"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useGitHubSyncStore } from "@/lib/store/githubSyncStore";
import {
  getRemoteSyncMeta,
  downloadDataFromGitHub,
  uploadDataToGitHub,
} from "@/lib/sync/github-sync";
import {
  collectLocalBackupData,
  restoreLocalBackupData,
} from "@/lib/backup/local-backup";
import { notify } from "@/lib/notify";
import { tr } from "@/lib/i18n/tr";

const AUTO_PUSH_DEBOUNCE_MS = 30000; // 30 seconds

export function useGitHubSyncLifecycle() {
  const queryClient = useQueryClient();

  const token = useGitHubSyncStore((s) => s.token);
  const repo = useGitHubSyncStore((s) => s.repo);
  const branch = useGitHubSyncStore((s) => s.branch);
  const deviceLabel = useGitHubSyncStore((s) => s.deviceLabel);
  const autoSyncOnStart = useGitHubSyncStore((s) => s.autoSyncOnStart);
  const autoSyncOnExit = useGitHubSyncStore((s) => s.autoSyncOnExit);
  const autoSyncDebounced = useGitHubSyncStore((s) => s.autoSyncDebounced);
  const lastSyncTime = useGitHubSyncStore((s) => s.lastSyncTime);
  const recordSyncSuccess = useGitHubSyncStore((s) => s.recordSyncSuccess);

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isSyncingRef = useRef<boolean>(false);
  const hasLocalChangesRef = useRef<boolean>(false);

  // 1. Startup auto-pull check
  useEffect(() => {
    if (!token.trim() || !repo.trim() || !autoSyncOnStart) {
      return;
    }

    let isMounted = true;

    async function checkStartupRemote() {
      try {
        const deviceId = useGitHubSyncStore.getState().getEffectiveDeviceId();
        const config = {
          token,
          repo,
          branch: branch || "main",
          deviceLabel: deviceLabel || "Personal Device",
          deviceId,
        };

        const remoteMeta = await getRemoteSyncMeta(config);
        if (!isMounted || !remoteMeta || !remoteMeta.updatedAt) {
          return;
        }

        // Check if remote is newer and was created by a different device
        const isRemoteNewer =
          !lastSyncTime ||
          new Date(remoteMeta.updatedAt) > new Date(lastSyncTime);
        const isDifferentDevice = remoteMeta.deviceId !== deviceId;

        if (isRemoteNewer && isDifferentDevice) {
          isSyncingRef.current = true;
          const pullRes = await downloadDataFromGitHub(config);

          if (isMounted && pullRes.success && pullRes.data) {
            await restoreLocalBackupData(pullRes.data);

            // Invalidate query caches
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: ["tasks"] }),
              queryClient.invalidateQueries({ queryKey: ["task"] }),
              queryClient.invalidateQueries({ queryKey: ["projects"] }),
              queryClient.invalidateQueries({ queryKey: ["project"] }),
              queryClient.invalidateQueries({ queryKey: ["habits"] }),
              queryClient.invalidateQueries({ queryKey: ["habit"] }),
              queryClient.invalidateQueries({ queryKey: ["calendar-events"] }),
              queryClient.invalidateQueries({ queryKey: ["workspaces"] }),
              queryClient.invalidateQueries({ queryKey: ["workspace-nodes"] }),
            ]);

            recordSyncSuccess(pullRes.meta);
            notify.success(
              tr("settings.github.toast.autoPulled", {
                device: remoteMeta.deviceLabel || "Remote Device",
              }),
            );
          }
        }
      } catch {
        // Silent catch on startup background check
      } finally {
        isSyncingRef.current = false;
      }
    }

    // Run after a short delay so the initial page render is not blocked
    const startupTimer = setTimeout(() => {
      void checkStartupRemote();
    }, 1500);

    return () => {
      isMounted = false;
      clearTimeout(startupTimer);
    };
  }, [
    token,
    repo,
    branch,
    deviceLabel,
    autoSyncOnStart,
    lastSyncTime,
    queryClient,
    recordSyncSuccess,
  ]);

  // 2. Debounced auto-push on SQLite mutations via /api/db/live SSE
  useEffect(() => {
    if (
      !token.trim() ||
      !repo.trim() ||
      (!autoSyncDebounced && !autoSyncOnExit) ||
      typeof window === "undefined" ||
      typeof EventSource === "undefined"
    ) {
      return;
    }

    let es: EventSource | null = null;

    const performBackgroundPush = async () => {
      if (isSyncingRef.current || !hasLocalChangesRef.current) return;
      isSyncingRef.current = true;
      try {
        const deviceId = useGitHubSyncStore.getState().getEffectiveDeviceId();
        const config = {
          token,
          repo,
          branch: branch || "main",
          deviceLabel: deviceLabel || "Personal Device",
          deviceId,
        };

        const localData = await collectLocalBackupData();
        const pushRes = await uploadDataToGitHub(config, localData);
        if (pushRes.success) {
          hasLocalChangesRef.current = false;
          recordSyncSuccess(
            pushRes.meta,
            `chore(sync): update data from ${deviceLabel}`,
          );
        }
      } catch {
        // Silent catch for background auto-push
      } finally {
        isSyncingRef.current = false;
      }
    };

    function handleLocalChange() {
      hasLocalChangesRef.current = true;

      if (!autoSyncDebounced) return;

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        void performBackgroundPush();
      }, AUTO_PUSH_DEBOUNCE_MS);
    }

    try {
      es = new EventSource("/api/db/live");
      es.addEventListener("change", handleLocalChange);
    } catch {
      // Ignore if SSE connection fails
    }

    const handleBeforeUnload = () => {
      if (
        autoSyncOnExit &&
        hasLocalChangesRef.current &&
        !isSyncingRef.current
      ) {
        void performBackgroundPush();
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      if (es) {
        es.close();
        es = null;
      }
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [
    token,
    repo,
    branch,
    deviceLabel,
    autoSyncDebounced,
    autoSyncOnExit,
    recordSyncSuccess,
  ]);
}
