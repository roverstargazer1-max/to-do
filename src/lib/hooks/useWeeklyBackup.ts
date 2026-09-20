"use client";

import { useEffect, useCallback, useRef, useMemo } from "react";
import { notify } from "@/lib/notify";
import { useUiStore } from "@/lib/store/uiStore";
import { tr } from "@/lib/i18n/tr";

const STORAGE_KEY = "kanso_last_backup_date";
const SESSION_KEY = "kanso_backup_prompted";

/** Prompts users to back up weekly via a dismissible toast. */
export function useWeeklyBackup() {
  const backupReminderEnabled = useUiStore((s) => s.backupReminderEnabled);
  const backupReminderFrequencyDays = useUiStore(
    (s) => s.backupReminderFrequencyDays,
  );
  const hasPrompted = useRef(false);

  const lastBackupDate = useMemo(() => {
    if (typeof window === "undefined") return null;
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? new Date(stored) : null;
  }, []);

  const updateLastBackupDate = useCallback(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, new Date().toISOString());
    }
  }, []);

  const triggerBackup = useCallback(async () => {
    try {
      const res = await fetch("/api/db/snapshot");
      if (!res.ok) throw new Error("Failed to create snapshot");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `kagelin-snapshot-${new Date().toISOString().replace(/[:.]/g, "-")}.db`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      updateLastBackupDate();
      notify.success(tr("common.backup.downloaded"));
    } catch (error) {
      console.error("Backup failed:", error);
      notify.error(tr("common.backup.createFailed"));
    }
  }, [updateLastBackupDate]);

  useEffect(() => {
    if (!backupReminderEnabled) return;
    if (hasPrompted.current) return;
    if (typeof window !== "undefined" && sessionStorage.getItem(SESSION_KEY))
      return;

    const frequencyMs = backupReminderFrequencyDays * 24 * 60 * 60 * 1000;
    const isStale =
      !lastBackupDate || Date.now() - lastBackupDate.getTime() > frequencyMs;

    if (isStale) {
      const timeoutId = setTimeout(() => {
        hasPrompted.current = true;
        if (typeof window !== "undefined") {
          sessionStorage.setItem(SESSION_KEY, "true");
        }

        notify(tr("common.backup.reminder"), {
          duration: 10000,
          action: {
            label: tr("common.backup.backUpNow"),
            onClick: () => {
              void triggerBackup();
            },
          },
        });
      }, 3000);

      return () => clearTimeout(timeoutId);
    }
  }, [
    backupReminderEnabled,
    backupReminderFrequencyDays,
    lastBackupDate,
    triggerBackup,
  ]);
}
