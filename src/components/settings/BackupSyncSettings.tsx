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
} from "lucide-react";
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
import { cn } from "@/lib/utils";
import { useHaptic } from "@/lib/hooks/useHaptic";
import { useDateFormatter } from "@/lib/i18n/useDateFormatter";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { tr } from "@/lib/i18n/tr";
import { useUiStore } from "@/lib/store/uiStore";
import {
  createBackupZip,
  parseBackupZip,
  downloadBackup,
} from "@/lib/backup/export-import";
import {
  testWebDavConnection,
  uploadWebDavBackup,
  downloadWebDavBackup,
  type WebDAVCredentials,
} from "@/lib/backup/webdav-sync";
import { mockStore } from "@/lib/mock/mock-store";
import { guestWorkspaceStore } from "@/lib/workspace/guest-store";
import { useLocationHistoryStore } from "@/lib/store/locationHistoryStore";
import type { BackupData } from "@/lib/backup/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/components/AuthProvider";
import { useAccountData } from "@/lib/hooks/useAccountData";
import { createClient } from "@/lib/supabase/client";
import {
  collectCloudBackup,
  replaceCloudBackup,
} from "@/lib/backup/cloud-data";
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

/**
 * A Guest's whole data set, workspace canvas included (ticket 09): the
 * IndexedDB workspace store is read alongside the mockStore blob, row ids
 * preserved verbatim per Backup convention. Async because the canvas lives
 * in IndexedDB, not synchronous localStorage.
 */
async function buildGuestBackupData(): Promise<BackupData> {
  return {
    metadata: {
      version: 1,
      appVersion: process.env.NEXT_PUBLIC_APP_VERSION || "1.0.0",
      exportedAt: new Date().toISOString(),
    },
    tasks: mockStore.getTasks(),
    projects: mockStore.getProjects(),
    habits: mockStore.getHabits(),
    habit_entries: mockStore.getHabitEntries(),
    focus_logs: mockStore.getFocusLogs(),
    events: mockStore.getEvents(),
    location_history: useLocationHistoryStore.getState().locations,
    workspaces: await guestWorkspaceStore.listWorkspaces(),
    workspace_nodes: await guestWorkspaceStore.listAllNodes(),
  };
}

/**
 * One fixed restore path for the guest canvas (ticket 09, ADR 0015): sections
 * absent from a pre-workspace backup restore as an empty canvas — no merge,
 * no conflict model, overwrite-on-backup.
 */
async function restoreGuestWorkspaceBackup(data: BackupData): Promise<void> {
  await guestWorkspaceStore.restoreBackup(
    data.workspaces ?? [],
    data.workspace_nodes ?? [],
  );
}

export function BackupSyncSettings() {
  const { trigger } = useHaptic();
  const { isGuestMode, user } = useAuth();
  const { exportData, importData } = useAccountData();
  const { formatMonthDayYear, formatClock } = useDateFormatter();
  const { t } = useTranslation();
  const supabase = createClient();
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
  // Pre-fetched so the confirmation dialog can display the backup export timestamp.
  const [pendingRestore, setPendingRestore] = useState<BackupData | null>(null);

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
    ]);
  };

  const handleExport = async () => {
    trigger("toggle");

    if (!isGuestMode) {
      await exportData();
      return;
    }

    setIsExporting(true);
    try {
      const blob = await createBackupZip(await buildGuestBackupData());
      downloadBackup(blob);

      localStorage.setItem("kanso_last_backup_date", new Date().toISOString());

      notify.success(tr("settings.backup.toast.exported"));
      trigger("success");
    } catch (err) {
      console.error("Export failed:", err);
      notify.error(tr("settings.backup.toast.exportFailed"));
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

    if (!isGuestMode) {
      await importData(file);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }

    setIsImporting(true);
    trigger("toggle");
    const loadingToastId = notify.loading(
      tr("settings.backup.toast.importing", { name: file.name }),
    );

    try {
      const backupData = await parseBackupZip(file);

      // Single write so large restores don't repeatedly stringify a growing payload.
      mockStore.restoreBackup(backupData);
      await restoreGuestWorkspaceBackup(backupData);
      useLocationHistoryStore.setState({
        locations: backupData.location_history ?? [],
      });

      await invalidateDataQueries();

      notify.success(
        tr("settings.backup.toast.imported", {
          tasks: backupData.tasks.length,
          projects: backupData.projects.length,
        }),
        {
          id: loadingToastId,
        },
      );
      trigger("success");
    } catch (err) {
      console.error("Import failed:", err);
      notify.error(tr("settings.backup.toast.importFailed"), {
        id: loadingToastId,
      });
      trigger("thud");
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
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
      const backupData: BackupData = isGuestMode
        ? await buildGuestBackupData()
        : await collectCloudBackup(supabase);

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
      if (isGuestMode) {
        mockStore.restoreBackup(data);
        await restoreGuestWorkspaceBackup(data);
      } else {
        if (!user) return;
        await replaceCloudBackup(supabase, user.id, data);
      }
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

      <Tabs defaultValue="local" className="space-y-4">
        <TabsList className="grid grid-cols-2 bg-secondary/10 p-1 rounded-lg h-11 border border-border/40 shadow-none">
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

        <TabsContent value="local" className="mt-0 outline-none">
          <div
            className={cn(
              isGuestMode && "flex flex-col gap-4 md:grid md:grid-cols-2",
            )}
          >
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
                  {t(
                    isGuestMode
                      ? "settings.backup.local.descriptionGuest"
                      : "settings.backup.local.descriptionCloud",
                  )}
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
            {isGuestMode && <BackupRemindersCard />}
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
    </div>
  );
}
