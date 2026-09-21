"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  GitBranch,
  Check,
  X,
  Loader2,
  Upload,
  Download,
  RefreshCw,
  Trash2,
  ExternalLink,
  Eye,
  EyeOff,
  Laptop,
  CheckCircle2,
} from "lucide-react";
import { GitHubIcon } from "@/components/ui/GitHubIcon";
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
import { DeleteConfirmationDialog } from "@/components/ui/DeleteConfirmationDialog";
import { SETTINGS_CARD_CLASS } from "@/components/settings/settingsCardClass";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { useHaptic } from "@/lib/hooks/useHaptic";
import { useDateFormatter } from "@/lib/i18n/useDateFormatter";
import { useGitHubSyncStore } from "@/lib/store/githubSyncStore";
import {
  testGitHubConnection,
  downloadDataFromGitHub,
  uploadDataToGitHub,
  getRemoteSyncMeta,
  normalizeRepo,
} from "@/lib/sync/github-sync";
import {
  collectLocalBackupData,
  restoreLocalBackupData,
} from "@/lib/backup/local-backup";

export function GitHubSyncCard() {
  const { t } = useTranslation();
  const { trigger } = useHaptic();
  const queryClient = useQueryClient();
  const { formatMonthDayYear, formatClock } = useDateFormatter();

  const token = useGitHubSyncStore((s) => s.token);
  const repo = useGitHubSyncStore((s) => s.repo);
  const branch = useGitHubSyncStore((s) => s.branch);
  const deviceLabel = useGitHubSyncStore((s) => s.deviceLabel);
  const autoSyncOnStart = useGitHubSyncStore((s) => s.autoSyncOnStart);
  const autoSyncOnExit = useGitHubSyncStore((s) => s.autoSyncOnExit);
  const autoSyncDebounced = useGitHubSyncStore((s) => s.autoSyncDebounced);

  const lastSyncTime = useGitHubSyncStore((s) => s.lastSyncTime);
  const lastSyncDevice = useGitHubSyncStore((s) => s.lastSyncDevice);
  const lastRemoteCommitSha = useGitHubSyncStore((s) => s.lastRemoteCommitSha);
  const lastRemoteCommitMessage = useGitHubSyncStore(
    (s) => s.lastRemoteCommitMessage,
  );

  const setConfig = useGitHubSyncStore((s) => s.setConfig);
  const clearConfig = useGitHubSyncStore((s) => s.clearConfig);
  const recordSyncSuccess = useGitHubSyncStore((s) => s.recordSyncSuccess);

  const [showToken, setShowToken] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<"idle" | "success" | "error">(
    "idle",
  );
  const [isOperating, setIsOperating] = useState(false);
  const [operationType, setOperationType] = useState<
    "sync" | "push" | "pull" | null
  >(null);
  const [showPullConfirm, setShowPullConfirm] = useState(false);

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
      queryClient.invalidateQueries({ queryKey: ["workspaces"] }),
      queryClient.invalidateQueries({ queryKey: ["workspace-nodes"] }),
      queryClient.invalidateQueries({ queryKey: ["visual-assets"] }),
    ]);
  };

  const handleTestConnection = async () => {
    if (!token.trim() || !repo.trim()) {
      notify.error(t("settings.github.error.missingToken"));
      return;
    }
    trigger("toggle");
    setIsTesting(true);
    setTestResult("idle");

    try {
      const res = await testGitHubConnection({
        token,
        repo,
        branch: branch || "main",
      });

      if (res.success) {
        setTestResult("success");
        notify.success(t("settings.github.toast.connected"));
        trigger("success");
        if (res.repoFullName) {
          setConfig({ repo: res.repoFullName });
        }
      } else {
        setTestResult("error");
        notify.error(
          res.error
            ? t(res.error as never)
            : t("settings.backup.toast.connectionFailed"),
        );
        trigger("thud");
      }
    } catch (err) {
      setTestResult("error");
      notify.error(err instanceof Error ? err.message : String(err));
      trigger("thud");
    } finally {
      setIsTesting(false);
    }
  };

  const handlePush = async () => {
    if (!token.trim() || !repo.trim()) {
      notify.error(t("settings.github.error.missingToken"));
      return;
    }
    trigger("toggle");
    setIsOperating(true);
    setOperationType("push");

    try {
      const localData = await collectLocalBackupData();
      const res = await uploadDataToGitHub(
        {
          token,
          repo,
          branch: branch || "main",
          deviceLabel: deviceLabel || "Personal Device",
          deviceId: useGitHubSyncStore.getState().getEffectiveDeviceId(),
        },
        localData,
      );

      if (res.success) {
        recordSyncSuccess(
          res.meta,
          `chore(sync): update data from ${deviceLabel}`,
        );
        notify.success(t("settings.github.toast.pushSuccess"));
        trigger("success");
      } else {
        notify.error(
          res.error
            ? t(res.error as never)
            : t("settings.github.toast.syncFailed"),
        );
        trigger("thud");
      }
    } catch (err) {
      notify.error(err instanceof Error ? err.message : String(err));
      trigger("thud");
    } finally {
      setIsOperating(false);
      setOperationType(null);
    }
  };

  const handlePullConfirm = async () => {
    setShowPullConfirm(false);
    if (!token.trim() || !repo.trim()) return;

    trigger("toggle");
    setIsOperating(true);
    setOperationType("pull");

    try {
      const res = await downloadDataFromGitHub({
        token,
        repo,
        branch: branch || "main",
      });

      if (res.success && res.data) {
        await restoreLocalBackupData(res.data);
        await invalidateDataQueries();
        recordSyncSuccess(res.meta);
        notify.success(t("settings.github.toast.pullSuccess"));
        trigger("success");
      } else {
        notify.error(
          res.error
            ? t(res.error as never)
            : t("settings.backup.toast.downloadFailed"),
        );
        trigger("thud");
      }
    } catch (err) {
      notify.error(err instanceof Error ? err.message : String(err));
      trigger("thud");
    } finally {
      setIsOperating(false);
      setOperationType(null);
    }
  };

  const handleSmartSync = async () => {
    if (!token.trim() || !repo.trim()) {
      notify.error(t("settings.github.error.missingToken"));
      return;
    }
    trigger("toggle");
    setIsOperating(true);
    setOperationType("sync");

    try {
      const syncConfig = {
        token,
        repo,
        branch: branch || "main",
        deviceLabel: deviceLabel || "Personal Device",
        deviceId: useGitHubSyncStore.getState().getEffectiveDeviceId(),
      };

      const remoteMeta = await getRemoteSyncMeta(syncConfig);

      // If remote has a newer timestamp than our last sync time and was from another device -> Pull
      const hasRemoteUpdate =
        remoteMeta &&
        remoteMeta.updatedAt &&
        (!lastSyncTime ||
          new Date(remoteMeta.updatedAt) > new Date(lastSyncTime)) &&
        remoteMeta.deviceId !== syncConfig.deviceId;

      if (hasRemoteUpdate) {
        const pullRes = await downloadDataFromGitHub(syncConfig);
        if (pullRes.success && pullRes.data) {
          await restoreLocalBackupData(pullRes.data);
          await invalidateDataQueries();
          recordSyncSuccess(pullRes.meta);
          notify.success(
            t("settings.github.toast.autoPulled", {
              device: remoteMeta.deviceLabel || "Remote Device",
            }),
          );
          trigger("success");
        } else {
          notify.error(
            pullRes.error
              ? t(pullRes.error as never)
              : t("settings.github.toast.syncFailed"),
          );
          trigger("thud");
        }
      } else {
        // Otherwise, push local state to remote
        const localData = await collectLocalBackupData();
        const pushRes = await uploadDataToGitHub(syncConfig, localData);
        if (pushRes.success) {
          recordSyncSuccess(
            pushRes.meta,
            `chore(sync): update data from ${deviceLabel}`,
          );
          notify.success(t("settings.github.toast.syncSuccess"));
          trigger("success");
        } else {
          notify.error(
            pushRes.error
              ? t(pushRes.error as never)
              : t("settings.github.toast.syncFailed"),
          );
          trigger("thud");
        }
      }
    } catch (err) {
      notify.error(err instanceof Error ? err.message : String(err));
      trigger("thud");
    } finally {
      setIsOperating(false);
      setOperationType(null);
    }
  };

  const cleanRepo = normalizeRepo(repo);
  const repoWebUrl =
    cleanRepo && cleanRepo.includes("/")
      ? `https://github.com/${cleanRepo}`
      : null;

  return (
    <>
      <Card className={SETTINGS_CARD_CLASS}>
        <CardHeader className="pb-3 px-4 pt-5">
          <CardTitle className="flex items-center gap-2 text-base font-medium tracking-tight">
            <GitHubIcon className="h-4 w-4 text-brand" />
            {t("settings.backup.github.title")}
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground/80 lowercase">
            {t("settings.backup.github.description")}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5 px-4 pb-5 pt-0">
          {/* Repository & Token Settings */}
          <div className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label
                  htmlFor="github-token"
                  className="text-[11px] uppercase tracking-wider text-muted-foreground/60"
                >
                  {t("settings.backup.github.token")}
                </Label>
                <a
                  href="https://github.com/settings/tokens/new?scopes=repo&description=Kagelin+Sync"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] text-brand hover:underline flex items-center gap-1"
                >
                  {t("settings.backup.github.tokenHelp")}
                  <ExternalLink className="h-2.5 w-2.5" />
                </a>
              </div>
              <div className="relative">
                <Input
                  id="github-token"
                  type={showToken ? "text" : "password"}
                  placeholder={t("settings.backup.github.tokenPlaceholder")}
                  value={token}
                  onChange={(e) => setConfig({ token: e.target.value })}
                  className="h-10 pr-10 bg-background/30 border-border/40 focus:border-brand/50 focus:ring-0 transition-all font-mono text-xs"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showToken ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label
                  htmlFor="github-repo"
                  className="text-[11px] uppercase tracking-wider text-muted-foreground/60"
                >
                  {t("settings.backup.github.repo")}
                </Label>
                <Input
                  id="github-repo"
                  placeholder={t("settings.backup.github.repoPlaceholder")}
                  value={repo}
                  onChange={(e) => setConfig({ repo: e.target.value })}
                  className="h-10 bg-background/30 border-border/40 focus:border-brand/50 focus:ring-0 transition-all font-mono text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label
                    htmlFor="github-branch"
                    className="text-[11px] uppercase tracking-wider text-muted-foreground/60"
                  >
                    {t("settings.backup.github.branch")}
                  </Label>
                  <Input
                    id="github-branch"
                    placeholder={t("settings.backup.github.branchPlaceholder")}
                    value={branch}
                    onChange={(e) => setConfig({ branch: e.target.value })}
                    className="h-10 bg-background/30 border-border/40 focus:border-brand/50 focus:ring-0 transition-all text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label
                    htmlFor="github-device"
                    className="text-[11px] uppercase tracking-wider text-muted-foreground/60"
                  >
                    {t("settings.backup.github.deviceLabel")}
                  </Label>
                  <Input
                    id="github-device"
                    placeholder={t(
                      "settings.backup.github.deviceLabelPlaceholder",
                    )}
                    value={deviceLabel}
                    onChange={(e) => setConfig({ deviceLabel: e.target.value })}
                    className="h-10 bg-background/30 border-border/40 focus:border-brand/50 focus:ring-0 transition-all text-xs"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Test connection & Clear config */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleTestConnection}
              disabled={isTesting || !token.trim() || !repo.trim()}
              className="gap-2 h-9 text-xs border-border/50 hover:bg-secondary/30 transition-all"
            >
              {isTesting ? (
                <Loader2
                  className="h-3.5 w-3.5 animate-spin"
                  strokeWidth={2.25}
                />
              ) : testResult === "success" ? (
                <Check className="h-3.5 w-3.5 text-green-500" strokeWidth={3} />
              ) : testResult === "error" ? (
                <X className="h-3.5 w-3.5 text-red-500" strokeWidth={3} />
              ) : (
                <GitBranch className="h-3.5 w-3.5" strokeWidth={2.25} />
              )}
              {t("settings.backup.github.test")}
            </Button>

            {(token || repo) && (
              <Button
                variant="destructive"
                size="icon"
                onClick={() => {
                  trigger("thud");
                  clearConfig();
                  notify.success(t("settings.github.toast.configCleared"));
                }}
                className="h-9 w-9"
                title={t("settings.backup.github.forget")}
                aria-label={t("settings.backup.github.forget")}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}

            {repoWebUrl && (
              <a
                href={repoWebUrl}
                target="_blank"
                rel="noreferrer"
                className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {t("settings.backup.github.viewRepo")}
              </a>
            )}
          </div>

          <Separator className="bg-border/30" />

          {/* Manual sync action buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              variant="default"
              onClick={handleSmartSync}
              disabled={isOperating || !token || !repo}
              className="flex-1 gap-2 h-10 bg-brand hover:bg-brand/90 text-white transition-all active:scale-[0.98] font-semibold"
            >
              {isOperating && operationType === "sync" ? (
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.25} />
              ) : (
                <RefreshCw className="h-4 w-4" strokeWidth={2.25} />
              )}
              {t("settings.backup.github.syncNow")}
            </Button>

            <Button
              variant="outline"
              onClick={handlePush}
              disabled={isOperating || !token || !repo}
              className="flex-1 gap-2 h-10 border-border/60 hover:bg-secondary/40 transition-all font-medium"
            >
              {isOperating && operationType === "push" ? (
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.25} />
              ) : (
                <Upload className="h-4 w-4" strokeWidth={2.25} />
              )}
              {t("settings.backup.github.push")}
            </Button>

            <Button
              variant="outline"
              onClick={() => setShowPullConfirm(true)}
              disabled={isOperating || !token || !repo}
              className="flex-1 gap-2 h-10 border-border/60 hover:bg-secondary/40 transition-all font-medium"
            >
              {isOperating && operationType === "pull" ? (
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.25} />
              ) : (
                <Download className="h-4 w-4" strokeWidth={2.25} />
              )}
              {t("settings.backup.github.pull")}
            </Button>
          </div>

          {/* Status & Last sync information */}
          <div className="p-3 rounded-lg border border-border/40 bg-secondary/15 flex flex-col gap-1.5 text-xs text-muted-foreground">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-medium text-foreground">
                <CheckCircle2 className="h-3.5 w-3.5 text-brand" />
                {t("settings.backup.github.lastSync")}
              </span>
              <span>
                {lastSyncTime
                  ? `${formatMonthDayYear(new Date(lastSyncTime))} ${formatClock(new Date(lastSyncTime), "12h")}`
                  : t("settings.backup.github.neverSynced")}
              </span>
            </div>
            {lastSyncDevice && (
              <div className="flex items-center justify-between text-[11px]">
                <span className="flex items-center gap-1">
                  <Laptop className="h-3 w-3" />
                  设备来源：
                </span>
                <span className="font-mono">{lastSyncDevice}</span>
              </div>
            )}
            {lastRemoteCommitSha && (
              <div className="flex items-center justify-between text-[11px]">
                <span className="flex items-center gap-1">
                  <GitBranch className="h-3 w-3" />
                  最新提交：
                </span>
                <span
                  className="font-mono truncate max-w-[200px]"
                  title={lastRemoteCommitMessage || lastRemoteCommitSha}
                >
                  {lastRemoteCommitSha.slice(0, 7)}
                </span>
              </div>
            )}
          </div>

          <Separator className="bg-border/30" />

          {/* Automation toggles */}
          <div className="space-y-3">
            <ToggleRow
              icon={RefreshCw}
              title={t("settings.backup.github.autoStart")}
              description={t("settings.backup.github.autoStartDesc")}
              checked={autoSyncOnStart}
              onChange={(checked) => {
                trigger("toggle");
                setConfig({ autoSyncOnStart: checked });
              }}
            />
            <ToggleRow
              icon={Upload}
              title={t("settings.backup.github.autoExit")}
              description={t("settings.backup.github.autoExitDesc")}
              checked={autoSyncOnExit}
              onChange={(checked) => {
                trigger("toggle");
                setConfig({ autoSyncOnExit: checked });
              }}
            />
            <ToggleRow
              icon={Laptop}
              title={t("settings.backup.github.autoDebounce")}
              description={t("settings.backup.github.autoDebounceDesc")}
              checked={autoSyncDebounced}
              onChange={(checked) => {
                trigger("toggle");
                setConfig({ autoSyncDebounced: checked });
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Confirmation Dialog for Pull */}
      <DeleteConfirmationDialog
        isOpen={showPullConfirm}
        onClose={() => setShowPullConfirm(false)}
        onConfirm={handlePullConfirm}
        title={t("settings.backup.github.pullConfirmTitle")}
        description={t("settings.backup.github.pullConfirmDesc")}
        confirmLabel={t("settings.backup.github.pull")}
      />
    </>
  );
}
