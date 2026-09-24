"use client";

import { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useGitHubSyncStore } from "@/lib/store/githubSyncStore";
import {
  downloadDataFromGitHub,
  uploadDataToGitHub,
  shouldPullRemoteCommit,
  resolveRemoteSyncMeta,
  checkPushSafety,
  decideSyncFlow,
  buildSyncConfig,
} from "@/lib/sync/github-sync";
import {
  collectLocalBackupData,
  restoreLocalBackupData,
} from "@/lib/backup/local-backup";
import { stageBackup, promoteBackup } from "@/lib/backup/dual-slot";
import { saveBaseSnapshot, getBaseSnapshot } from "@/lib/sync/base-snapshot";
import { mergeBackupData } from "@/lib/sync/merge-engine";
import { notify } from "@/lib/notify";
import { tr } from "@/lib/i18n/tr";

const AUTO_PUSH_DEBOUNCE_MS = 30000; // 30 seconds
const REMOTE_CHECK_THROTTLE_MS = 30000; // 30 seconds between focus checks
const REMOTE_POLL_INTERVAL_MS = 120000; // 2 minutes background poll

export function useGitHubSyncLifecycle() {
  const queryClient = useQueryClient();

  const token = useGitHubSyncStore((s) => s.token);
  const repo = useGitHubSyncStore((s) => s.repo);
  const autoSyncOnStart = useGitHubSyncStore((s) => s.autoSyncOnStart);
  const autoSyncOnExit = useGitHubSyncStore((s) => s.autoSyncOnExit);
  const autoSyncDebounced = useGitHubSyncStore((s) => s.autoSyncDebounced);
  const hasUnsyncedChanges = useGitHubSyncStore((s) => s.hasUnsyncedChanges);
  const setHasUnsyncedChanges = useGitHubSyncStore(
    (s) => s.setHasUnsyncedChanges,
  );
  const recordSyncSuccess = useGitHubSyncStore((s) => s.recordSyncSuccess);
  const setStatus = useGitHubSyncStore((s) => s.setStatus);

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isSyncingRef = useRef<boolean>(false);
  const hasLocalChangesRef = useRef<boolean>(false);
  const lastRemoteCheckTimeRef = useRef<number>(0);

  // Sync ref with store state
  useEffect(() => {
    if (hasUnsyncedChanges) {
      hasLocalChangesRef.current = true;
    }
  }, [hasUnsyncedChanges]);

  // Unified Push Executor with A/B Dual-Slot Staging and Promotion
  const performPush = useCallback(
    async (
      reason: "debounce" | "exit" | "blur" | "reconnect" = "debounce",
    ): Promise<boolean> => {
      if (isSyncingRef.current) return false;

      const currentToken = useGitHubSyncStore.getState().token;
      const currentRepo = useGitHubSyncStore.getState().repo;
      const currentHasUnsynced =
        useGitHubSyncStore.getState().hasUnsyncedChanges ||
        hasLocalChangesRef.current;

      if (!currentToken.trim() || !currentRepo.trim() || !currentHasUnsynced) {
        return false;
      }

      isSyncingRef.current = true;
      try {
        const state = useGitHubSyncStore.getState();
        const deviceId = state.getEffectiveDeviceId();
        const currentDeviceLabel = state.deviceLabel || "Personal Device";

        const config = buildSyncConfig({
          token: state.token,
          repo: state.repo,
          branch: state.branch,
          deviceLabel: state.deviceLabel,
          deviceId,
        });

        const localData = await collectLocalBackupData();

        // 1. Stage into Slot B before pushing (Slot A baseline remains untouched)
        await stageBackup(localData);

        // Check offline state before initiating network request
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          if (reason !== "debounce" && reason !== "blur" && reason !== "exit") {
            notify.warning(tr("settings.github.toast.offlinePushSaved"));
          }
          return false;
        }

        // DLP guard: never let a background push silently wipe a populated
        // remote with an empty or cliff-dropped local snapshot.
        const safety = await checkPushSafety(config, localData);
        if (!safety.safe) {
          notify.warning(tr("settings.github.toast.dlpBlockedBackground"));
          return false;
        }

        const pushRes = await uploadDataToGitHub(config, localData);

        if (pushRes.success) {
          // 2. Promote Slot B to Slot A baseline upon confirmed 200 OK
          await promoteBackup();
          await saveBaseSnapshot(localData, pushRes.commitSha);

          hasLocalChangesRef.current = false;
          setHasUnsyncedChanges(false);
          recordSyncSuccess(
            pushRes.meta,
            `chore(sync): update data from ${currentDeviceLabel} [${reason}]`,
          );

          if (reason === "reconnect") {
            notify.success(tr("settings.github.toast.reconnectSynced"));
          }
          return true;
        } else if (pushRes.error === "settings.github.error.conflict") {
          // Concurrency detected: try background auto-merge self-heal
          const pullRes = await downloadDataFromGitHub(config);
          if (pullRes.success && pullRes.data) {
            const baseData = await getBaseSnapshot();
            const freshLocal = await collectLocalBackupData();
            const mergeRes = mergeBackupData({
              base: baseData,
              local: freshLocal,
              remote: pullRes.data,
            });

            if (mergeRes.clean) {
              await restoreLocalBackupData(mergeRes.mergedData);
              await queryClient.invalidateQueries();
              const retryPush = await uploadDataToGitHub(
                config,
                mergeRes.mergedData,
                `chore(sync): auto-merged updates from ${currentDeviceLabel} [409 retry]`,
              );
              if (retryPush.success) {
                await promoteBackup();
                await saveBaseSnapshot(
                  mergeRes.mergedData,
                  retryPush.commitSha,
                );
                hasLocalChangesRef.current = false;
                setHasUnsyncedChanges(false);
                recordSyncSuccess(
                  retryPush.meta,
                  `chore(sync): auto-merged updates from ${currentDeviceLabel} [409 retry]`,
                );
                notify.success(
                  tr("settings.github.toast.autoMerged", {
                    device:
                      pullRes.meta?.deviceLabel ||
                      tr("settings.github.deviceFallback"),
                  }),
                );
                return true;
              }
            } else {
              state.setPendingConflict({
                deviceLabel:
                  pullRes.meta?.deviceLabel ||
                  tr("settings.github.deviceFallback"),
                mergeResult: mergeRes,
                localData: freshLocal,
                remoteData: pullRes.data,
                remoteMeta: pullRes.meta ?? null,
              });
            }
          }
          setStatus("conflict", pushRes.error);
          notify.error(tr("settings.github.error.conflict"));
          return false;
        } else {
          if (typeof navigator !== "undefined" && !navigator.onLine) {
            notify.warning(tr("settings.github.toast.offlinePushSaved"));
          }
          return false;
        }
      } catch {
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          notify.warning(tr("settings.github.toast.offlinePushSaved"));
        }
        return false;
      } finally {
        isSyncingRef.current = false;
      }
    },
    [queryClient, recordSyncSuccess, setHasUnsyncedChanges, setStatus],
  );

  // Unified Remote Check and Pull Executor
  const checkAndPullRemote = useCallback(
    async (_trigger: "startup" | "focus" | "poll"): Promise<void> => {
      if (isSyncingRef.current) return;

      const currentState = useGitHubSyncStore.getState();
      if (
        !currentState.token.trim() ||
        !currentState.repo.trim() ||
        !currentState.autoSyncOnStart
      ) {
        return;
      }

      if (typeof navigator !== "undefined" && !navigator.onLine) {
        return;
      }

      lastRemoteCheckTimeRef.current = Date.now();

      try {
        const deviceId = currentState.getEffectiveDeviceId();
        const config = buildSyncConfig({
          token: currentState.token,
          repo: currentState.repo,
          branch: currentState.branch,
          deviceLabel: currentState.deviceLabel,
          deviceId,
        });

        const remoteMetaRes = await resolveRemoteSyncMeta(config);
        if (remoteMetaRes.fallbackUsed && remoteMetaRes.meta) {
          notify.warning(tr("settings.github.toast.metaFallback"));
        }
        const remoteMeta = remoteMetaRes.meta;
        if (!remoteMeta || !remoteMeta.updatedAt) {
          return;
        }

        const { shouldPull } = shouldPullRemoteCommit({
          remoteMeta,
          localDeviceId: deviceId,
          lastRemoteCommitSha: currentState.lastRemoteCommitSha,
          lastRemoteDataSha: currentState.lastRemoteDataSha,
          lastSyncTime: currentState.lastSyncTime,
        });

        // Single source of truth: the same pure decision function the manual
        // "sync now" path uses. Conflict (remote updated + local dirty) refuses
        // to pull or push; aligned/push branches are intentionally ignored here
        // because this check is pull-only by design.
        const action = decideSyncFlow({
          shouldPull,
          pullDevice: remoteMeta.deviceLabel,
          hasUnsyncedChanges:
            currentState.hasUnsyncedChanges || hasLocalChangesRef.current,
          safety: { safe: true },
        });

        if (action.kind === "conflict") {
          isSyncingRef.current = true;
          const pullRes = await downloadDataFromGitHub(config);
          if (pullRes.success && pullRes.data) {
            const baseData = await getBaseSnapshot();
            const localData = await collectLocalBackupData();
            const mergeResult = mergeBackupData({
              base: baseData,
              local: localData,
              remote: pullRes.data,
            });

            const remoteDevice =
              action.device ||
              remoteMeta.deviceLabel ||
              tr("settings.github.deviceFallback");

            if (mergeResult.clean) {
              await restoreLocalBackupData(mergeResult.mergedData);
              await queryClient.invalidateQueries();

              const commitMsg = `chore(sync): auto-merged updates from ${remoteDevice}`;
              let pushRes = await uploadDataToGitHub(
                config,
                mergeResult.mergedData,
                commitMsg,
              );

              // 409 retry
              if (
                !pushRes.success &&
                pushRes.error === "settings.github.error.conflict"
              ) {
                const retryRemote = await downloadDataFromGitHub(config);
                if (retryRemote.success && retryRemote.data) {
                  const freshLocal = await collectLocalBackupData();
                  const retryMerge = mergeBackupData({
                    base: baseData,
                    local: freshLocal,
                    remote: retryRemote.data,
                  });
                  if (retryMerge.clean) {
                    await restoreLocalBackupData(retryMerge.mergedData);
                    await queryClient.invalidateQueries();
                    pushRes = await uploadDataToGitHub(
                      config,
                      retryMerge.mergedData,
                      `chore(sync): auto-merged updates from ${remoteDevice} [retry]`,
                    );
                    if (pushRes.success) {
                      await saveBaseSnapshot(
                        retryMerge.mergedData,
                        pushRes.commitSha,
                      );
                      hasLocalChangesRef.current = false;
                      setHasUnsyncedChanges(false);
                      recordSyncSuccess(pushRes.meta, commitMsg);
                      notify.success(
                        tr("settings.github.toast.autoMerged", {
                          device: remoteDevice,
                        }),
                      );
                      return;
                    }
                  }
                }
              }

              if (pushRes.success) {
                await saveBaseSnapshot(
                  mergeResult.mergedData,
                  pushRes.commitSha,
                );
                hasLocalChangesRef.current = false;
                setHasUnsyncedChanges(false);
                recordSyncSuccess(pushRes.meta, commitMsg);
                notify.success(
                  tr("settings.github.toast.autoMerged", {
                    device: remoteDevice,
                  }),
                );
                return;
              }
            }

            // Real conflict blocked
            currentState.setPendingConflict({
              deviceLabel: remoteDevice,
              mergeResult,
              localData,
              remoteData: pullRes.data,
              remoteMeta: pullRes.meta ?? null,
            });
            currentState.setStatus(
              "conflict",
              "settings.github.error.conflict",
            );
            notify.warning(
              tr("settings.github.toast.remoteUpdateConflict", {
                device: remoteDevice,
              }),
            );
            return;
          }

          currentState.setStatus("conflict", "settings.github.error.conflict");
          notify.warning(
            tr("settings.github.toast.remoteUpdateConflict", {
              device: action.device || tr("settings.github.deviceFallback"),
            }),
          );
          return;
        }

        if (action.kind === "pull") {
          // Safe to pull: download and replace local data
          isSyncingRef.current = true;
          const pullRes = await downloadDataFromGitHub(config);

          if (pullRes.success && pullRes.data) {
            await restoreLocalBackupData(pullRes.data);
            await queryClient.invalidateQueries();
            await saveBaseSnapshot(pullRes.data, pullRes.meta?.commitSha);
            recordSyncSuccess(pullRes.meta);
            notify.success(
              tr("settings.github.toast.autoPulled", {
                device: action.device || tr("settings.github.deviceFallback"),
              }),
            );
          }
        }
      } catch {
        // Silent catch on background pull checks
      } finally {
        isSyncingRef.current = false;
      }
    },
    [queryClient, recordSyncSuccess, setHasUnsyncedChanges],
  );

  // Mark changes and schedule debounced push
  const handleLocalChange = useCallback(() => {
    hasLocalChangesRef.current = true;
    setHasUnsyncedChanges(true);

    if (!autoSyncDebounced) return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      void performPush("debounce");
    }, AUTO_PUSH_DEBOUNCE_MS);
  }, [autoSyncDebounced, performPush, setHasUnsyncedChanges]);

  // 1. Startup auto-pull check & backlog push
  useEffect(() => {
    if (!token.trim() || !repo.trim()) {
      return;
    }

    const startupTimer = setTimeout(() => {
      const state = useGitHubSyncStore.getState();
      if (state.hasUnsyncedChanges || hasLocalChangesRef.current) {
        if (typeof navigator === "undefined" || navigator.onLine) {
          void performPush("reconnect");
        }
      } else if (state.autoSyncOnStart) {
        void checkAndPullRemote("startup");
      }
    }, 1500);

    return () => {
      clearTimeout(startupTimer);
    };
  }, [token, repo, autoSyncOnStart, checkAndPullRemote, performPush]);

  // 2. Window Focus & Visibility auto-pull detection
  useEffect(() => {
    if (!token.trim() || !repo.trim() || !autoSyncOnStart) {
      return;
    }

    const handleFocusCheck = () => {
      const now = Date.now();
      if (now - lastRemoteCheckTimeRef.current < REMOTE_CHECK_THROTTLE_MS) {
        return;
      }
      if (
        typeof document !== "undefined" &&
        document.visibilityState !== "visible"
      ) {
        return;
      }
      void checkAndPullRemote("focus");
    };

    window.addEventListener("focus", handleFocusCheck);
    document.addEventListener("visibilitychange", handleFocusCheck);

    return () => {
      window.removeEventListener("focus", handleFocusCheck);
      document.removeEventListener("visibilitychange", handleFocusCheck);
    };
  }, [token, repo, autoSyncOnStart, checkAndPullRemote]);

  // 3. Periodic background poll (every 2 minutes while active)
  useEffect(() => {
    if (!token.trim() || !repo.trim() || !autoSyncOnStart) {
      return;
    }

    const pollInterval = setInterval(() => {
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "visible"
      ) {
        void checkAndPullRemote("poll");
      }
    }, REMOTE_POLL_INTERVAL_MS);

    return () => {
      clearInterval(pollInterval);
    };
  }, [token, repo, autoSyncOnStart, checkAndPullRemote]);

  // 4. Online reconnection handler (auto push offline backlog)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleOnline = () => {
      const state = useGitHubSyncStore.getState();
      if (state.token.trim() && state.repo.trim()) {
        if (state.hasUnsyncedChanges || hasLocalChangesRef.current) {
          void performPush("reconnect");
        } else if (state.autoSyncOnStart) {
          void checkAndPullRemote("focus");
        }
      }
    };

    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("online", handleOnline);
    };
  }, [performPush, checkAndPullRemote]);

  // 5. Local mutation observer (React Query cache mutations)
  useEffect(() => {
    const unsubscribe = queryClient.getMutationCache().subscribe((event) => {
      if (event?.type === "updated" && event.action?.type === "success") {
        handleLocalChange();
      }
    });

    return () => {
      unsubscribe();
    };
  }, [queryClient, handleLocalChange]);

  // 6. Local database file observer (/api/db/live SSE)
  useEffect(() => {
    if (
      !token.trim() ||
      !repo.trim() ||
      typeof window === "undefined" ||
      typeof EventSource === "undefined"
    ) {
      return;
    }

    let es: EventSource | null = null;
    try {
      es = new EventSource("/api/db/live");
      es.addEventListener("change", handleLocalChange);
    } catch {
      // Ignore if SSE connection fails
    }

    return () => {
      if (es) {
        es.close();
        es = null;
      }
    };
  }, [token, repo, handleLocalChange]);

  // 7. Exit & Blur sync handler (Electron Graceful Quit + Visibility Blur)
  useEffect(() => {
    if (!token.trim() || !repo.trim() || !autoSyncOnExit) {
      return;
    }

    // Electron Preload bridge for app quit interception
    const electronBridge =
      typeof window !== "undefined" ? window.electron : undefined;

    if (electronBridge?.onPrepareQuit) {
      electronBridge.onPrepareQuit(async () => {
        const state = useGitHubSyncStore.getState();
        const hasChanges =
          state.hasUnsyncedChanges || hasLocalChangesRef.current;
        if (state.autoSyncOnExit && hasChanges) {
          const pushSuccess = await performPush("exit");
          return {
            success: pushSuccess,
            hasUnsynced: !pushSuccess,
            reason:
              typeof navigator !== "undefined" && !navigator.onLine
                ? "设备处于未联网状态"
                : "网络请求失败或响应异常",
          };
        }
        return { success: true, hasUnsynced: false };
      });
    }

    // Browser beforeunload fallback
    const handleBeforeUnload = () => {
      const state = useGitHubSyncStore.getState();
      if (
        state.autoSyncOnExit &&
        (state.hasUnsyncedChanges || hasLocalChangesRef.current)
      ) {
        void performPush("exit");
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    // Visibility hidden / Blur handler (失焦/切窗口前静默推送)
    const handleVisibilityOrBlur = () => {
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "hidden"
      ) {
        const state = useGitHubSyncStore.getState();
        if (
          state.autoSyncOnExit &&
          (state.hasUnsyncedChanges || hasLocalChangesRef.current) &&
          !isSyncingRef.current
        ) {
          void performPush("blur");
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityOrBlur);
    window.addEventListener("blur", handleVisibilityOrBlur);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityOrBlur);
      window.removeEventListener("blur", handleVisibilityOrBlur);
    };
  }, [token, repo, autoSyncOnExit, performPush]);

  // Clean up debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, []);
}
