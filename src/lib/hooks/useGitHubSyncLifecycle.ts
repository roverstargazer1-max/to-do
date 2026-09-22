"use client";

import { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useGitHubSyncStore } from "@/lib/store/githubSyncStore";
import {
  getRemoteSyncMeta,
  downloadDataFromGitHub,
  uploadDataToGitHub,
  shouldPullRemoteCommit,
} from "@/lib/sync/github-sync";
import {
  collectLocalBackupData,
  restoreLocalBackupData,
} from "@/lib/backup/local-backup";
import { stageBackup, promoteBackup } from "@/lib/backup/dual-slot";
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
        const deviceId = useGitHubSyncStore.getState().getEffectiveDeviceId();
        const currentBranch = useGitHubSyncStore.getState().branch || "main";
        const currentDeviceLabel =
          useGitHubSyncStore.getState().deviceLabel || "Personal Device";

        const config = {
          token: currentToken,
          repo: currentRepo,
          branch: currentBranch,
          deviceLabel: currentDeviceLabel,
          deviceId,
        };

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

        const pushRes = await uploadDataToGitHub(config, localData);

        if (pushRes.success) {
          // 2. Promote Slot B to Slot A baseline upon confirmed 200 OK
          await promoteBackup();

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
    [recordSyncSuccess, setHasUnsyncedChanges, setStatus],
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
        const config = {
          token: currentState.token,
          repo: currentState.repo,
          branch: currentState.branch || "main",
          deviceLabel: currentState.deviceLabel || "Personal Device",
          deviceId,
        };

        const remoteMeta = await getRemoteSyncMeta(config);
        if (!remoteMeta || !remoteMeta.updatedAt) {
          return;
        }

        const { shouldPull } = shouldPullRemoteCommit({
          remoteMeta,
          localDeviceId: deviceId,
          lastRemoteCommitSha: currentState.lastRemoteCommitSha,
          lastSyncTime: currentState.lastSyncTime,
        });

        if (shouldPull) {
          // Conflict guard: local has unsynced changes, don't overwrite blindly
          const localHasChanges =
            currentState.hasUnsyncedChanges || hasLocalChangesRef.current;

          if (localHasChanges) {
            currentState.setStatus(
              "conflict",
              "settings.github.error.conflict",
            );
            notify.warning(
              tr("settings.github.toast.remoteUpdateConflict", {
                device: remoteMeta.deviceLabel || "Remote Device",
              }),
            );
            return;
          }

          // Safe to pull: download and replace local data
          isSyncingRef.current = true;
          const pullRes = await downloadDataFromGitHub(config);

          if (pullRes.success && pullRes.data) {
            await restoreLocalBackupData(pullRes.data);
            await queryClient.invalidateQueries();
            recordSyncSuccess(pullRes.meta);
            notify.success(
              tr("settings.github.toast.autoPulled", {
                device: remoteMeta.deviceLabel || "Remote Device",
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
    [queryClient, recordSyncSuccess],
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
