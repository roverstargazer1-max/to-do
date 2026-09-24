"use client";

import { useState, useMemo } from "react";
import { GitBranch, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { useHaptic } from "@/lib/hooks/useHaptic";
import { notify } from "@/lib/notify";
import { useGitHubSyncStore } from "@/lib/store/githubSyncStore";
import { collectLocalBackupData } from "@/lib/backup/local-backup";
import {
  formatBackupBranchSlug,
  buildDefaultBackupBranchName,
  formatBackupCommitMessage,
  createBackupBranchSnapshot,
} from "@/lib/sync/github-sync";

export interface CreateBackupBranchDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreateBackupBranchDialog({
  isOpen,
  onClose,
}: CreateBackupBranchDialogProps) {
  const { t } = useTranslation();
  const { trigger } = useHaptic();

  const token = useGitHubSyncStore((s) => s.token);
  const repo = useGitHubSyncStore((s) => s.repo);
  const branch = useGitHubSyncStore((s) => s.branch);

  const [remark, setRemark] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // Real-time preview derived from current input and current time
  const previewBranchName = useMemo(() => {
    const slug = remark ? formatBackupBranchSlug(remark) : undefined;
    return buildDefaultBackupBranchName(new Date(), slug);
  }, [remark]);

  const previewCommitTitle = useMemo(() => {
    return formatBackupCommitMessage(remark, new Date());
  }, [remark]);

  const handleClose = () => {
    if (isCreating) return;
    setRemark("");
    onClose();
  };

  const handleSubmit = async () => {
    if (!token.trim() || !repo.trim() || isCreating) return;

    trigger("toggle");
    setIsCreating(true);

    try {
      const data = await collectLocalBackupData();
      const res = await createBackupBranchSnapshot(
        {
          token,
          repo,
          branch: branch || "main",
        },
        {
          remark: remark.trim() || undefined,
          data,
        },
      );

      if (res.success && res.branchName) {
        trigger("success");
        notify.success(t("settings.backup.github.backupSuccess"), {
          action: {
            label: t("settings.backup.github.viewBranch"),
            onClick: () => {
              if (res.viewUrl) {
                window.open(res.viewUrl, "_blank", "noopener,noreferrer");
              }
            },
          },
        });
        setRemark("");
        onClose();
      } else {
        trigger("thud");
        notify.error(
          res.error
            ? t(res.error as never)
            : t("settings.backup.github.backupFailed"),
        );
      }
    } catch (err) {
      trigger("thud");
      notify.error(err instanceof Error ? err.message : String(err));
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-brand" />
            <span>{t("settings.backup.github.backupDialogTitle")}</span>
          </DialogTitle>
          <DialogDescription>
            {t("settings.backup.github.backupDialogDesc")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Remark Input */}
          <div className="space-y-1.5">
            <Label htmlFor="backup-remark" className="text-xs font-medium">
              {t("settings.backup.github.backupRemarkLabel")}
            </Label>
            <Input
              id="backup-remark"
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isCreating) {
                  e.preventDefault();
                  void handleSubmit();
                }
              }}
              placeholder={t("settings.backup.github.backupRemarkPlaceholder")}
              disabled={isCreating}
              maxLength={100}
              autoFocus
            />
          </div>

          {/* Real-time previews */}
          <div className="space-y-3 rounded-lg border border-border/50 bg-secondary/30 p-3 text-xs">
            <div>
              <span className="text-muted-foreground block mb-1 font-medium">
                {t("settings.backup.github.backupBranchPreview")}
              </span>
              <code className="text-xs font-mono font-medium text-foreground bg-background/80 px-2 py-1 rounded border border-border/40 break-all select-all flex items-center gap-1.5">
                <GitBranch className="h-3.5 w-3.5 text-brand shrink-0" />
                {previewBranchName}
              </code>
            </div>

            <div>
              <span className="text-muted-foreground block mb-1 font-medium">
                {t("settings.backup.github.backupCommitPreview")}
              </span>
              <code className="text-xs font-mono text-muted-foreground bg-background/80 px-2 py-1 rounded border border-border/40 break-all select-all block">
                {previewCommitTitle}
              </code>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleClose} disabled={isCreating}>
            {t("settings.backup.github.backupCancel")}
          </Button>
          <Button
            onClick={() => void handleSubmit()}
            disabled={isCreating || !token.trim() || !repo.trim()}
            className="bg-brand hover:bg-brand/90 text-white gap-2 font-medium"
          >
            {isCreating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <GitBranch className="h-4 w-4" />
            )}
            {isCreating
              ? t("settings.backup.github.backupCreating")
              : t("settings.backup.github.backupConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
