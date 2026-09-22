"use client";

import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useGitHubSyncStore } from "@/lib/store/githubSyncStore";
import {
  buildSyncConfig,
  resolveRemoteSyncMeta,
  shouldPullRemoteCommit,
  checkPushSafety,
  decideSyncFlow,
  uploadDataToGitHub,
  downloadDataFromGitHub,
  type GitHubSyncConfig,
  type PushSafetyReason,
  type PushSafetyResult,
} from "@/lib/sync/github-sync";
import {
  collectLocalBackupData,
  restoreLocalBackupData,
} from "@/lib/backup/local-backup";
import { notify } from "@/lib/notify";
import { tr } from "@/lib/i18n/tr";
import type { BackupData } from "@/lib/backup/types";

/** What the "sync now"/"push" flow is currently doing (drives button spinners). */
export type SmartSyncOperation = "sync" | "push" | "pull" | null;

/** Context for a push held by the DLP guard until the user confirms or cancels. */
export interface SmartSyncDlp {
  reason: PushSafetyReason;
  counts: { local: number; remote: number };
}

export interface UseSmartSyncResult {
  /** True while run()/runPush()/confirmDlp() is executing. */
  isOperating: boolean;
  operationType: SmartSyncOperation;
  /** When non-null, a destructive push is pending explicit confirmation. */
  dlp: SmartSyncDlp | null;
  /** "Sync now" orchestration: resolve remote → decide → pull/conflict/push/DLP. */
  run: () => Promise<void>;
  /** Manual "push" button: DLP pre-flight, then push or hold for confirmation. */
  runPush: () => Promise<void>;
  /** Confirm an intercepted (DLP-held) push. */
  confirmDlp: () => Promise<void>;
  /** Cancel an intercepted push without uploading. */
  cancelDlp: () => void;
}

/**
 * Manual GitHub sync orchestration (previously inlined in GitHubSyncCard).
 * Thin, JSX-free state machine: remote resolution → DLP pre-flight → shared
 * `decideSyncFlow` decision → pull / conflict / aligned / push, with a
 * DLP-hold state that requires explicit confirmation before any destructive
 * upload. The displayed decision (kind, conflicts, DLP context) is produced by
 * the pure shared function so the manual path cannot diverge from background
 * sync.
 */
export function useSmartSync(): UseSmartSyncResult {
  const queryClient = useQueryClient();

  const [isOperating, setIsOperating] = useState(false);
  const [operationType, setOperationType] = useState<SmartSyncOperation>(null);
  const [dlp, setDlp] = useState<SmartSyncDlp | null>(null);
  const pendingPushRef = useRef<{
    config: GitHubSyncConfig;
    data: BackupData;
  } | null>(null);

  const executePush = useCallback(
    async (
      config: GitHubSyncConfig,
      localData: BackupData,
      successMessage: string,
    ): Promise<boolean> => {
      const res = await uploadDataToGitHub(config, localData);
      if (res.success) {
        useGitHubSyncStore
          .getState()
          .recordSyncSuccess(
            res.meta,
            `chore(sync): update data from ${config.deviceLabel}`,
          );
        notify.success(successMessage);
        return true;
      }
      notify.error(
        res.error
          ? tr(res.error as never)
          : tr("settings.github.toast.syncFailed"),
      );
      return false;
    },
    [],
  );

  /**
   * Download the remote snapshot and restore it locally, invalidating caches.
   * Returns true when the restore succeeded (also used for pull notifications).
   */
  const downloadDataAndRestore = useCallback(
    async (config: GitHubSyncConfig): Promise<boolean> => {
      const pullRes = await downloadDataFromGitHub(config);
      if (pullRes.success && pullRes.data) {
        await restoreLocalBackupData(pullRes.data);
        await queryClient.invalidateQueries();
        useGitHubSyncStore.getState().recordSyncSuccess(pullRes.meta);
        return true;
      }
      notify.error(
        pullRes.error
          ? tr(pullRes.error as never)
          : tr("settings.github.toast.syncFailed"),
      );
      return false;
    },
    [queryClient],
  );

  const run = useCallback(async () => {
    const state = useGitHubSyncStore.getState();
    if (!state.token.trim() || !state.repo.trim()) {
      notify.error(tr("settings.github.error.missingToken"));
      return;
    }

    setIsOperating(true);
    setOperationType("sync");
    try {
      const deviceId = state.getEffectiveDeviceId();
      const config = buildSyncConfig({
        token: state.token,
        repo: state.repo,
        branch: state.branch,
        deviceLabel: state.deviceLabel,
        deviceId,
      });

      // 1. Resolve remote state with a fallback to kagelin-data.json when
      //    sync-meta.json is missing or unreadable.
      const { meta, fallbackUsed } = await resolveRemoteSyncMeta(config);
      if (fallbackUsed && meta) {
        notify.warning(tr("settings.github.toast.metaFallback"));
      }

      // 2. Commit SHA based remote-update detection (clock-skew resilient).
      const { shouldPull } = shouldPullRemoteCommit({
        remoteMeta: meta,
        localDeviceId: deviceId,
        lastRemoteCommitSha: state.lastRemoteCommitSha,
        lastRemoteDataSha: state.lastRemoteDataSha,
        lastSyncTime: state.lastSyncTime,
      });

      const hasUnsynced = state.hasUnsyncedChanges;

      // 3. DLP pre-flight only when we are actually about to push.
      let localData: BackupData | null = null;
      let safety: PushSafetyResult = { safe: true };
      if (!shouldPull && hasUnsynced) {
        localData = await collectLocalBackupData();
        safety = await checkPushSafety(config, localData);
      }

      // 4. Pure decision: conflict / pull / aligned (No-Dirty-No-Push) / push
      //    (with DLP hold) — same function the background hook uses.
      const action = decideSyncFlow({
        shouldPull,
        pullDevice: meta?.deviceLabel,
        hasUnsyncedChanges: hasUnsynced,
        safety,
      });

      switch (action.kind) {
        case "conflict": {
          // Remote updated + local dirty: never pull over it, never push.
          state.setStatus("conflict", "settings.github.error.conflict");
          notify.warning(
            tr("settings.github.toast.remoteUpdateConflict", {
              device: action.device || tr("settings.github.deviceFallback"),
            }),
          );
          break;
        }
        case "pull": {
          const pullRes = await downloadDataAndRestore(config);
          if (pullRes) {
            notify.success(
              tr("settings.github.toast.autoPulled", {
                device: action.device || tr("settings.github.deviceFallback"),
              }),
            );
          }
          break;
        }
        case "aligned": {
          // No remote update AND no local changes -> never push.
          notify.success(tr("settings.github.toast.alreadyInSync"));
          break;
        }
        case "push-blocked-dlp": {
          // Destructive overwrite detected: require explicit high-risk confirm.
          if (!localData) break;
          pendingPushRef.current = { config, data: localData };
          setDlp({ reason: action.reason, counts: action.counts });
          break;
        }
        case "push": {
          if (localData) {
            await executePush(
              config,
              localData,
              tr("settings.github.toast.syncSuccess"),
            );
          }
          break;
        }
      }
    } catch (err) {
      notify.error(err instanceof Error ? err.message : String(err));
    } finally {
      setIsOperating(false);
      setOperationType(null);
    }
  }, [executePush, downloadDataAndRestore]);

  const runPush = useCallback(async () => {
    const state = useGitHubSyncStore.getState();
    if (!state.token.trim() || !state.repo.trim()) {
      notify.error(tr("settings.github.error.missingToken"));
      return;
    }

    setIsOperating(true);
    setOperationType("push");
    try {
      const config = buildSyncConfig({
        token: state.token,
        repo: state.repo,
        branch: state.branch,
        deviceLabel: state.deviceLabel,
        deviceId: state.getEffectiveDeviceId(),
      });
      const localData = await collectLocalBackupData();

      // DLP pre-flight: refuse to silently overwrite a populated remote with an
      // empty or cliff-dropped local snapshot, unless the user confirms.
      const safety = await checkPushSafety(config, localData);
      const action = decideSyncFlow({
        shouldPull: false,
        hasUnsyncedChanges: true,
        safety,
      });

      if (action.kind === "push-blocked-dlp") {
        pendingPushRef.current = { config, data: localData };
        setDlp({ reason: action.reason, counts: action.counts });
        return;
      }

      await executePush(
        config,
        localData,
        tr("settings.github.toast.pushSuccess"),
      );
    } catch (err) {
      notify.error(err instanceof Error ? err.message : String(err));
    } finally {
      setIsOperating(false);
      setOperationType(null);
    }
  }, [executePush]);

  const confirmDlp = useCallback(async () => {
    const pending = pendingPushRef.current;
    setDlp(null);
    if (!pending) return;

    setIsOperating(true);
    setOperationType("push");
    try {
      await executePush(
        pending.config,
        pending.data,
        tr("settings.github.toast.pushSuccess"),
      );
    } catch (err) {
      notify.error(err instanceof Error ? err.message : String(err));
    } finally {
      pendingPushRef.current = null;
      setIsOperating(false);
      setOperationType(null);
    }
  }, [executePush]);

  const cancelDlp = useCallback(() => {
    pendingPushRef.current = null;
    setDlp(null);
  }, []);

  return {
    isOperating,
    operationType,
    dlp,
    run,
    runPush,
    confirmDlp,
    cancelDlp,
  };
}
