"use client";

import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Download,
  Upload,
  Server,
  Check,
  X,
  Loader2,
  HardDrive,
  Cloud,
  Trash2,
  BellRing,
  Database,
} from "lucide-react";
import { GitHubIcon } from "@/components/ui/GitHubIcon";
import { GitHubSyncCard } from "@/components/settings/GitHubSyncCard";
import { useGitHubSyncStore } from "@/lib/store/githubSyncStore";
import { notify } from "@/lib/notify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ToggleRow } from "@/components/settings/ToggleRow";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useHaptic } from "@/lib/hooks/useHaptic";
import { useDateFormatter } from "@/lib/i18n/useDateFormatter";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { tr } from "@/lib/i18n/tr";
import { useUiStore } from "@/lib/store/uiStore";
import { createBackupZip } from "@/lib/backup/export-import";
import {
  testWebDavConnection,
  uploadWebDavBackup,
  downloadWebDavBackup,
  type WebDAVCredentials,
} from "@/lib/backup/webdav-sync";
import {
  collectLocalBackupData,
  restoreLocalBackupData,
} from "@/lib/backup/local-backup";
import { useLocationHistoryStore } from "@/lib/store/locationHistoryStore";
import type { BackupData } from "@/lib/backup/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAccountData } from "@/lib/hooks/useAccountData";
import { DeleteConfirmationDialog } from "@/components/ui/DeleteConfirmationDialog";
import { ImportDialog } from "./ImportDialog";
import { SETTINGS_CARD_CLASS } from "@/components/settings/settingsCardClass";

interface CloudSyncCardProps {
  credentials: WebDAVCredentials;
  onCredentialsChange: (
    updater: (prev: WebDAVCredentials) => WebDAVCredentials,
  ) => void;
  isTestingConnection: boolean;
  connectionStatus: "idle" | "success" | "error";
  isSyncing: boolean;
  onTestConnection: () => void;
  onResetCredentials: () => void;
  onSyncUpload: () => void;
  onSyncDownload: () => void;
}

function CloudSyncCard({
  credentials,
  onCredentialsChange,
  isTestingConnection,
  connectionStatus,
  isSyncing,
  onTestConnection,
  onResetCredentials,
  onSyncUpload,
  onSyncDownload,
}: CloudSyncCardProps) {
  const { t } = useTranslation();

  return (
    <TabsContent value="cloud" className="mt-0 outline-none">
      <Card className={SETTINGS_CARD_CLASS}>
        <CardHeader className="pb-3 px-4 pt-5">
          <CardTitle className="flex items-center gap-2 text-base font-medium tracking-tight">
            <Cloud className="h-4 w-4 text-brand" strokeWidth={2.25} />
            {t("settings.backup.webdav.title")}
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground/80 lowercase">
            {t("settings.backup.webdav.description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 px-4 pb-5 pt-0">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label
                htmlFor="webdav-url"
                className="text-[11px] uppercase tracking-wider text-muted-foreground/60"
              >
                {t("settings.backup.webdav.serverUrl")}
              </Label>
              <Input
                id="webdav-url"
                placeholder="https://cloud.example.com/remote.php/dav/files/..."
                value={credentials.serverUrl}
                onChange={(e) =>
                  onCredentialsChange((prev) => ({
                    ...prev,
                    serverUrl: e.target.value,
                  }))
                }
                className="h-10 bg-background/30 border-border/40 focus:border-brand/50 focus:ring-0 transition-all"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label
                  htmlFor="webdav-user"
                  className="text-[11px] uppercase tracking-wider text-muted-foreground/60"
                >
                  {t("settings.backup.webdav.username")}
                </Label>
                <Input
                  id="webdav-user"
                  placeholder={t("settings.backup.webdav.usernamePlaceholder")}
                  value={credentials.username}
                  onChange={(e) =>
                    onCredentialsChange((prev) => ({
                      ...prev,
                      username: e.target.value,
                    }))
                  }
                  className="h-10 bg-background/30 border-border/40 focus:border-brand/50 focus:ring-0 transition-all"
                />
              </div>
              <div className="space-y-1.5">
                <Label
                  htmlFor="webdav-pass"
                  className="text-[11px] uppercase tracking-wider text-muted-foreground/60"
                >
                  {t("settings.backup.webdav.password")}
                </Label>
                <Input
                  id="webdav-pass"
                  type="password"
                  placeholder="••••••••"
                  value={credentials.password}
                  onChange={(e) =>
                    onCredentialsChange((prev) => ({
                      ...prev,
                      password: e.target.value,
                    }))
                  }
                  className="h-10 bg-background/30 border-border/40 focus:border-brand/50 focus:ring-0 transition-all"
                />
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={onTestConnection}
              disabled={isTestingConnection}
              className="gap-2 h-9 text-xs border-border/50 hover:bg-secondary/30 transition-all"
            >
              {isTestingConnection ? (
                <Loader2
                  className="h-3.5 w-3.5 animate-spin"
                  strokeWidth={2.25}
                />
              ) : connectionStatus === "success" ? (
                <Check className="h-3.5 w-3.5 text-green-500" strokeWidth={3} />
              ) : connectionStatus === "error" ? (
                <X className="h-3.5 w-3.5 text-red-500" strokeWidth={3} />
              ) : (
                <Server className="h-3.5 w-3.5" strokeWidth={2.25} />
              )}
              {t("settings.backup.webdav.test")}
            </Button>
            {(credentials.serverUrl || credentials.username) && (
              <Button
                variant="destructive"
                size="icon"
                onClick={onResetCredentials}
                className="h-9 w-9"
                title={t("settings.backup.webdav.forget")}
                aria-label={t("settings.backup.webdav.forget")}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>

          <Separator className="bg-border/30" />

          <div className="flex gap-3">
            <Button
              variant="default"
              onClick={onSyncUpload}
              disabled={isSyncing || !credentials.serverUrl}
              className="flex-1 gap-2 h-10 bg-brand hover:bg-brand/90 text-white transition-all active:scale-[0.98] font-semibold"
            >
              {isSyncing ? (
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.25} />
              ) : (
                <Upload className="h-4 w-4" strokeWidth={2.25} />
              )}
              Back Up
            </Button>
            <Button
              variant="outline"
              onClick={onSyncDownload}
              disabled={isSyncing || !credentials.serverUrl}
              className="flex-1 gap-2 h-10 border-border/60 hover:bg-secondary/40 transition-all font-medium"
            >
              {isSyncing ? (
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.25} />
              ) : (
                <Download className="h-4 w-4" strokeWidth={2.25} />
              )}
              {t("settings.backup.webdav.restore")}
            </Button>
          </div>

          <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
            {t("settings.backup.webdav.credentialsNote")}
          </p>
        </CardContent>
      </Card>
    </TabsContent>
  );
}

function BackupRemindersCard() {
  const { t } = useTranslation();
  const { trigger } = useHaptic();
  const backupReminderEnabled = useUiStore((s) => s.backupReminderEnabled);
  const setBackupReminderEnabled = useUiStore(
    (s) => s.setBackupReminderEnabled,
  );
  const backupReminderFrequencyDays = useUiStore(
    (s) => s.backupReminderFrequencyDays,
  );
  const setBackupReminderFrequencyDays = useUiStore(
    (s) => s.setBackupReminderFrequencyDays,
  );

  const frequencyOptions = [
    { value: "7", label: t("settings.backup.reminders.weekly") },
    { value: "14", label: t("settings.backup.reminders.biweekly") },
    { value: "30", label: t("settings.backup.reminders.monthly") },
  ];

  return (
    <Card className={SETTINGS_CARD_CLASS}>
      <CardHeader className="pb-3 px-4 pt-5">
        <CardTitle className="flex items-center gap-2 text-base font-medium tracking-tight">
          <BellRing className="h-4 w-4 text-brand" strokeWidth={2.25} />
          {t("settings.backup.reminders.title")}
        </CardTitle>
        <CardDescription className="text-xs text-muted-foreground/80 lowercase">
          {t("settings.backup.reminders.description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 px-4 pb-5 pt-0">
        <ToggleRow
          icon={BellRing}
          title={t("settings.backup.reminders.toggleTitle")}
          description={t("settings.backup.reminders.toggleDescription")}
          checked={backupReminderEnabled}
          onChange={(checked) => {
            trigger("toggle");
            setBackupReminderEnabled(checked);
          }}
        />
        <Select
          value={String(backupReminderFrequencyDays)}
          onValueChange={(val) => {
            trigger("toggle");
            setBackupReminderFrequencyDays(Number(val));
          }}
          disabled={!backupReminderEnabled}
        >
          <SelectTrigger
            className="w-full h-10 bg-background/30 border-border/40"
            aria-label={t("settings.backup.reminders.frequencyAria")}
          >
            <SelectValue
              placeholder={t("settings.backup.reminders.frequencyPlaceholder")}
            />
          </SelectTrigger>
          <SelectContent>
            {frequencyOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardContent>
    </Card>
  );
}

export function BackupSyncSettings() {
  const { trigger } = useHaptic();
  const { exportData, importData } = useAccountData();
  const { formatMonthDayYear, formatClock } = useDateFormatter();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Locale-aware replacement for the legacy
  // `format(date, "MMM d, yyyy 'at' h:mm a")` (ticket 03): the dictionary
  // key supplies the locale connector between the Intl date and time.
  const formatBackupDate = (exportedAt: string): string =>
    t("settings.backup.exportedAtFormat", {
      date: formatMonthDayYear(new Date(exportedAt)),
      time: formatClock(new Date(exportedAt), "12h"),
    });

  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [showExternalImport, setShowExternalImport] = useState(false);

  // Kept in memory only to avoid persisting credentials locally.
  const [webdavCredentials, setWebdavCredentials] = useState<WebDAVCredentials>(
    { serverUrl: "", username: "", password: "" },
  );
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<
    "idle" | "success" | "error"
  >("idle");
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingRestore, setPendingRestore] = useState<BackupData | null>(null);
  const sqliteFileInputRef = useRef<HTMLInputElement>(null);
  const [isCreatingSnapshot, setIsCreatingSnapshot] = useState(false);
  const [isRestoringSqlite, setIsRestoringSqlite] = useState(false);
  const [pendingSqliteFile, setPendingSqliteFile] = useState<File | null>(null);

  const invalidateDataQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["tasks"] }),
      queryClient.invalidateQueries({ queryKey: ["task"] }),
      queryClient.invalidateQueries({ queryKey: ["projects"] }),
      queryClient.invalidateQueries({ queryKey: ["project"] }),
      queryClient.invalidateQueries({ queryKey: ["habits"] }),
      queryClient.invalidateQueries({ queryKey: ["habit"] }),
      queryClient.invalidateQueries({ queryKey: ["subtasks"] }),
      queryClient.invalidateQueries({ queryKey: ["inbox-project"] }),
      queryClient.invalidateQueries({ queryKey: ["stats-dashboard"] }),
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] }),
      queryClient.invalidateQueries({ queryKey: ["calendar-tasks"] }),
      queryClient.invalidateQueries({ queryKey: ["heatmap-data"] }),
      // The restored canvas reads fresh: both workspace query families.
      queryClient.invalidateQueries({ queryKey: ["workspaces"] }),
      queryClient.invalidateQueries({ queryKey: ["workspace-nodes"] }),
      queryClient.invalidateQueries({ queryKey: ["visual-assets"] }),
    ]);
  };

  const handleExport = async () => {
    trigger("toggle");
    setIsExporting(true);
    try {
      await exportData();
      localStorage.setItem("kanso_last_backup_date", new Date().toISOString());
      trigger("success");
    } catch (err) {
      console.error("Export failed:", err);
      trigger("thud");
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportClick = () => {
    trigger("toggle");
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    trigger("toggle");
    try {
      await importData(file);
      await invalidateDataQueries();
      trigger("success");
    } catch (err) {
      console.error("Import failed:", err);
      trigger("thud");
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleCreateSnapshot = async () => {
    trigger("toggle");
    setIsCreatingSnapshot(true);
    try {
      const res = await fetch("/api/db/snapshot");
      if (!res.ok) {
        throw new Error(`Snapshot failed: ${res.statusText}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `kagelin-snapshot-${new Date().toISOString().replace(/[:.]/g, "-")}.db`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      notify.success(t("settings.backup.sqlite.snapshotSuccess"));
      trigger("success");
    } catch (err) {
      console.error("Snapshot error:", err);
      notify.error(t("settings.backup.sqlite.snapshotFailed"));
      trigger("thud");
    } finally {
      setIsCreatingSnapshot(false);
    }
  };

  const handleRestoreSqliteSelect = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingSqliteFile(file);
    trigger("toggle");
  };

  const runRestoreSqlite = async () => {
    if (!pendingSqliteFile) return;
    const file = pendingSqliteFile;
    setPendingSqliteFile(null);
    setIsRestoringSqlite(true);
    trigger("toggle");
    const loadingToastId = notify.loading("Restoring SQLite database...");

    try {
      const buffer = await file.arrayBuffer();
      const res = await fetch("/api/db/restore", {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
        },
        body: buffer,
      });

      if (!res.ok) {
        const errorJson = await res.json().catch(() => ({}));
        throw new Error(errorJson.error || `Restore failed: ${res.statusText}`);
      }

      await invalidateDataQueries();
      notify.success(t("settings.backup.sqlite.restoreSuccess"), {
        id: loadingToastId,
      });
      trigger("success");
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } catch (err) {
      console.error("Restore error:", err);
      notify.error(t("settings.backup.sqlite.restoreFailed"), {
        id: loadingToastId,
      });
      trigger("thud");
    } finally {
      setIsRestoringSqlite(false);
      if (sqliteFileInputRef.current) {
        sqliteFileInputRef.current.value = "";
      }
    }
  };

  const resetCredentials = () => {
    trigger("toggle");
    setWebdavCredentials({ serverUrl: "", username: "", password: "" });
    setConnectionStatus("idle");
    notify.success(tr("settings.backup.toast.credentialsCleared"));
  };

  const handleTestConnection = async () => {
    if (
      !webdavCredentials.serverUrl ||
      !webdavCredentials.username ||
      !webdavCredentials.password
    ) {
      notify.error(tr("settings.backup.toast.fillAllFields"));
      return;
    }

    setIsTestingConnection(true);
    setConnectionStatus("idle");
    trigger("toggle");

    try {
      const result = await testWebDavConnection(webdavCredentials);

      if (result.success) {
        setConnectionStatus("success");
        notify.success(tr("settings.backup.toast.connected"));
        trigger("success");
      } else {
        setConnectionStatus("error");
        notify.error(
          result.error || tr("settings.backup.toast.connectionFailed"),
        );
        trigger("thud");
      }
    } catch {
      setConnectionStatus("error");
      notify.error(tr("settings.backup.toast.connectionTestFailed"));
      trigger("thud");
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleSyncUpload = async () => {
    if (!webdavCredentials.serverUrl) {
      notify.error(tr("settings.backup.toast.configureFirst"));
      return;
    }

    setIsSyncing(true);
    trigger("toggle");

    try {
      const backupData: BackupData = await collectLocalBackupData();

      const blob = await createBackupZip(backupData);
      const result = await uploadWebDavBackup(webdavCredentials, blob);

      if (result.success) {
        localStorage.setItem(
          "kanso_last_backup_date",
          new Date().toISOString(),
        );
        notify.success(tr("settings.backup.toast.backedUp"));
        trigger("success");
      } else {
        notify.error(result.error || tr("settings.backup.toast.backUpFailed"));
        trigger("thud");
      }
    } catch {
      notify.error(tr("settings.backup.toast.backUpFailed"));
      trigger("thud");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSyncDownload = async () => {
    if (!webdavCredentials.serverUrl) {
      notify.error(tr("settings.backup.toast.configureFirst"));
      return;
    }

    trigger("toggle");
    setIsSyncing(true);

    try {
      const result = await downloadWebDavBackup(webdavCredentials);

      if (result.success && result.data) {
        setPendingRestore(result.data);
      } else {
        notify.error(
          result.error || tr("settings.backup.toast.downloadFailed"),
        );
        trigger("thud");
      }
    } catch {
      notify.error(tr("settings.backup.toast.downloadFailed"));
      trigger("thud");
    } finally {
      setIsSyncing(false);
    }
  };

  const runSyncDownload = async () => {
    const data = pendingRestore;
    if (!data) return;
    setPendingRestore(null);

    setIsSyncing(true);

    try {
      await restoreLocalBackupData(data);
      useLocationHistoryStore.setState({
        locations: data.location_history ?? [],
      });

      await invalidateDataQueries();

      notify.success(tr("settings.backup.toast.restored"));
      trigger("success");
    } catch {
      notify.error(tr("settings.backup.toast.restoreFailed"));
      trigger("thud");
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="space-y-6">
      <input
        ref={fileInputRef}
        type="file"
        accept=".zip,application/zip"
        onChange={handleFileChange}
        className="hidden"
        aria-label={t("settings.backup.importFileAria")}
      />
      <input
        ref={sqliteFileInputRef}
        type="file"
        accept=".db,application/x-sqlite3,application/vnd.sqlite3"
        onChange={handleRestoreSqliteSelect}
        className="hidden"
        aria-label={t("settings.backup.sqlite.restore")}
      />

      <Tabs
        defaultValue={useGitHubSyncStore.getState().token ? "github" : "local"}
        className="space-y-4"
      >
        <TabsList className="grid grid-cols-3 bg-secondary/10 p-1 rounded-lg h-11 border border-border/40 shadow-none">
          <TabsTrigger
            value="github"
            onClick={() => trigger("toggle")}
            className="rounded-md gap-2 text-[13px] font-medium tracking-tight data-[state=active]:bg-brand data-[state=active]:text-brand-foreground data-[state=active]:shadow-none transition-all h-9 border border-transparent data-[state=active]:border-brand/20"
          >
            <GitHubIcon className="h-3.5 w-3.5" />
            {t("settings.backup.tab.github")}
          </TabsTrigger>
          <TabsTrigger
            value="local"
            onClick={() => trigger("toggle")}
            className="rounded-md gap-2 text-[13px] font-medium tracking-tight data-[state=active]:bg-brand data-[state=active]:text-brand-foreground data-[state=active]:shadow-none transition-all h-9 border border-transparent data-[state=active]:border-brand/20"
          >
            <HardDrive className="h-3.5 w-3.5" />
            {t("settings.backup.tab.local")}
          </TabsTrigger>
          <TabsTrigger
            value="cloud"
            onClick={() => trigger("toggle")}
            className="rounded-md gap-2 text-[13px] font-medium tracking-tight data-[state=active]:bg-brand data-[state=active]:text-brand-foreground data-[state=active]:shadow-none transition-all h-9 border border-transparent data-[state=active]:border-brand/20"
          >
            <Cloud className="h-3.5 w-3.5" />
            {t("settings.backup.tab.webdav")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="github" className="mt-0 outline-none">
          <GitHubSyncCard />
        </TabsContent>

        <TabsContent value="local" className="mt-0 outline-none">
          <div className="flex flex-col gap-4 md:grid md:grid-cols-2">
            <Card className={SETTINGS_CARD_CLASS}>
              <CardHeader className="pb-3 px-4 pt-5">
                <CardTitle className="flex items-center gap-2 text-base font-medium tracking-tight">
                  <HardDrive
                    className="h-4 w-4 text-brand"
                    strokeWidth={2.25}
                  />
                  {t("settings.backup.local.title")}
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground/80 lowercase">
                  {t("settings.backup.local.descriptionGuest")}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex gap-3 px-4 pb-5 pt-0">
                <Button
                  variant="outline"
                  onClick={handleExport}
                  disabled={isExporting}
                  className="flex-1 gap-2 h-10 border-border/60 hover:bg-secondary/40 transition-all font-medium"
                >
                  {isExporting ? (
                    <Loader2
                      className="h-4 w-4 animate-spin"
                      strokeWidth={2.25}
                    />
                  ) : (
                    <Download className="h-4 w-4" strokeWidth={2.25} />
                  )}
                  {t("settings.backup.export")}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleImportClick}
                  disabled={isImporting}
                  className="flex-1 gap-2 h-10 border-border/60 hover:bg-secondary/40 transition-all font-medium"
                >
                  {isImporting ? (
                    <Loader2
                      className="h-4 w-4 animate-spin"
                      strokeWidth={2.25}
                    />
                  ) : (
                    <Upload className="h-4 w-4" strokeWidth={2.25} />
                  )}
                  {t("settings.backup.import")}
                </Button>
              </CardContent>
              <Separator className="bg-border/20 mx-4" />
              <div className="px-4 pb-4 pt-4">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs text-muted-foreground hover:text-brand transition-colors h-8"
                  onClick={() => {
                    trigger("toggle");
                    setShowExternalImport(true);
                  }}
                >
                  {t("settings.backup.importOtherApps")}
                </Button>
              </div>
            </Card>
            <Card className={SETTINGS_CARD_CLASS}>
              <CardHeader className="pb-3 px-4 pt-5">
                <CardTitle className="flex items-center gap-2 text-base font-medium tracking-tight">
                  <Database className="h-4 w-4 text-brand" strokeWidth={2.25} />
                  {t("settings.backup.sqlite.title")}
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground/80">
                  {t("settings.backup.sqlite.description")}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex gap-3 px-4 pb-5 pt-0">
                <Button
                  variant="outline"
                  onClick={handleCreateSnapshot}
                  disabled={isCreatingSnapshot}
                  className="flex-1 gap-2 h-10 border-border/60 hover:bg-secondary/40 transition-all font-medium"
                >
                  {isCreatingSnapshot ? (
                    <Loader2
                      className="h-4 w-4 animate-spin"
                      strokeWidth={2.25}
                    />
                  ) : (
                    <Download className="h-4 w-4" strokeWidth={2.25} />
                  )}
                  {t("settings.backup.sqlite.snapshot")}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    trigger("toggle");
                    sqliteFileInputRef.current?.click();
                  }}
                  disabled={isRestoringSqlite}
                  className="flex-1 gap-2 h-10 border-border/60 hover:bg-secondary/40 transition-all font-medium"
                >
                  {isRestoringSqlite ? (
                    <Loader2
                      className="h-4 w-4 animate-spin"
                      strokeWidth={2.25}
                    />
                  ) : (
                    <Upload className="h-4 w-4" strokeWidth={2.25} />
                  )}
                  {t("settings.backup.sqlite.restore")}
                </Button>
              </CardContent>
            </Card>
            <BackupRemindersCard />
          </div>
        </TabsContent>

        <CloudSyncCard
          credentials={webdavCredentials}
          onCredentialsChange={setWebdavCredentials}
          isTestingConnection={isTestingConnection}
          connectionStatus={connectionStatus}
          isSyncing={isSyncing}
          onTestConnection={handleTestConnection}
          onResetCredentials={resetCredentials}
          onSyncUpload={handleSyncUpload}
          onSyncDownload={handleSyncDownload}
        />
      </Tabs>

      <ImportDialog
        open={showExternalImport}
        onOpenChange={setShowExternalImport}
      />

      <DeleteConfirmationDialog
        isOpen={pendingRestore !== null}
        onClose={() => setPendingRestore(null)}
        onConfirm={runSyncDownload}
        title={t("settings.backup.replace.title")}
        description={
          pendingRestore
            ? t("settings.backup.replace.descriptionWithDate", {
                date: formatBackupDate(pendingRestore.metadata.exportedAt),
              })
            : t("settings.backup.replace.description")
        }
        confirmLabel={t("settings.backup.replace.confirm")}
      />

      <DeleteConfirmationDialog
        isOpen={pendingSqliteFile !== null}
        onClose={() => {
          setPendingSqliteFile(null);
          if (sqliteFileInputRef.current) {
            sqliteFileInputRef.current.value = "";
          }
        }}
        onConfirm={runRestoreSqlite}
        title={t("settings.backup.sqlite.restoreConfirmTitle")}
        description={t("settings.backup.sqlite.restoreConfirmDescription")}
        confirmLabel={t("settings.backup.sqlite.restore")}
      />
    </div>
  );
}
