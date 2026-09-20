"use client";

import { useAuth } from "@/components/AuthProvider";
import {
  createBackupZip,
  parseBackupZip,
  downloadBackup,
} from "@/lib/backup/export-import";
import {
  collectLocalBackupData,
  restoreLocalBackupData,
} from "@/lib/backup/local-backup";
import { notify } from "@/lib/notify";
import { tr } from "@/lib/i18n/tr";

export function useAccountData() {
  useAuth();

  const exportData = async () => {
    const promise = async () => {
      const data = await collectLocalBackupData();
      const blob = await createBackupZip(data);
      downloadBackup(blob);
      return data;
    };

    return notify.promise(promise(), {
      loading: tr("common.account.exportPreparing"),
      success: tr("common.account.exportSuccess"),
      error: (err) =>
        tr("common.account.exportFailed", { message: err.message }),
    });
  };

  const importData = async (file: File) => {
    const promise = async () => {
      const data = await parseBackupZip(file);

      if (!data.metadata || !data.tasks) {
        throw new Error(tr("common.account.invalidBackup"));
      }

      await restoreLocalBackupData(data);
      return data;
    };

    return notify.promise(promise(), {
      loading: tr("common.account.importing"),
      success: tr("common.account.importSuccess"),
      error: (err) =>
        tr("common.account.importFailed", { message: err.message }),
    });
  };

  const clearCloudData = async () => {
    // In standalone local SQLite, user can reset database or use delete-all
    return;
  };

  return {
    exportData,
    importData,
    clearCloudData,
  };
}
