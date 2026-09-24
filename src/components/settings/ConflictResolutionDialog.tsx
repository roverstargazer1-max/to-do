"use client";

import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  Copy,
  ChevronDown,
  ChevronRight,
  Laptop,
  Cloud,
  Loader2,
  Trash2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { useGitHubSyncStore } from "@/lib/store/githubSyncStore";
import {
  resolveConflicts,
  type EntityConflict,
  type ConflictChoice,
} from "@/lib/sync/merge-engine";
import { restoreLocalBackupData } from "@/lib/backup/local-backup";
import { uploadDataToGitHub, buildSyncConfig } from "@/lib/sync/github-sync";
import { saveBaseSnapshot } from "@/lib/sync/base-snapshot";
import { notify } from "@/lib/notify";

export interface ConflictResolutionDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ConflictResolutionDialog({
  isOpen,
  onClose,
}: ConflictResolutionDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const pendingConflict = useGitHubSyncStore((s) => s.pendingConflict);
  const token = useGitHubSyncStore((s) => s.token);
  const repo = useGitHubSyncStore((s) => s.repo);
  const branch = useGitHubSyncStore((s) => s.branch);
  const deviceLabel = useGitHubSyncStore((s) => s.deviceLabel);
  const getEffectiveDeviceId = useGitHubSyncStore(
    (s) => s.getEffectiveDeviceId,
  );
  const recordSyncSuccess = useGitHubSyncStore((s) => s.recordSyncSuccess);
  const clearPendingConflict = useGitHubSyncStore(
    (s) => s.clearPendingConflict,
  );

  const conflicts = useMemo(
    () => pendingConflict?.mergeResult.conflicts ?? [],
    [pendingConflict],
  );

  // Map conflict ID -> resolution choice ("local" | "remote" | "duplicate")
  const [resolutions, setResolutions] = useState<
    Record<string, ConflictChoice>
  >({});
  const [expandedJson, setExpandedJson] = useState<Record<string, boolean>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Group conflicts by category
  const groupedConflicts = useMemo(() => {
    const groups: Record<string, EntityConflict[]> = {
      task: [],
      habit: [],
      event: [],
      project: [],
      other: [],
    };

    for (const conflict of conflicts) {
      if (conflict.entityType === "task") {
        groups.task.push(conflict);
      } else if (
        conflict.entityType === "habit" ||
        conflict.entityType === "habit_entry"
      ) {
        groups.habit.push(conflict);
      } else if (conflict.entityType === "event") {
        groups.event.push(conflict);
      } else if (conflict.entityType === "project") {
        groups.project.push(conflict);
      } else {
        groups.other.push(conflict);
      }
    }
    return groups;
  }, [conflicts]);

  const getChoice = (conflictId: string): ConflictChoice => {
    return resolutions[conflictId] || "local";
  };

  const handleSetChoice = (conflictId: string, choice: ConflictChoice) => {
    setResolutions((prev) => ({
      ...prev,
      [conflictId]: choice,
    }));
  };

  const handleBatchChoice = (choice: "local" | "remote") => {
    const next: Record<string, ConflictChoice> = {};
    for (const c of conflicts) {
      next[c.id] = choice;
    }
    setResolutions(next);
  };

  const toggleJsonDiff = (id: string) => {
    setExpandedJson((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleApplyAndPush = async () => {
    if (!pendingConflict) return;
    setIsSubmitting(true);

    try {
      // 1. Resolve conflicts into finalized BackupData
      const resolvedData = resolveConflicts({
        mergeResult: pendingConflict.mergeResult,
        resolutions,
      });

      // 2. Restore into local SQLite database
      await restoreLocalBackupData(resolvedData);

      // 3. Invalidate React Query caches
      await queryClient.invalidateQueries();

      // 4. Push finalized resolved data to GitHub
      const config = buildSyncConfig({
        token,
        repo,
        branch,
        deviceLabel,
        deviceId: getEffectiveDeviceId(),
      });

      const commitMsg = `chore(sync): resolved ${conflicts.length} conflict(s) from ${deviceLabel}`;
      const pushRes = await uploadDataToGitHub(config, resolvedData, commitMsg);

      if (pushRes.success) {
        await saveBaseSnapshot(resolvedData, pushRes.commitSha);
        recordSyncSuccess(pushRes.meta, commitMsg);
        clearPendingConflict();
        notify.success(t("settings.github.toast.syncSuccess"));
        onClose();
      } else {
        notify.error(
          pushRes.error
            ? t(pushRes.error as never)
            : t("settings.github.toast.syncFailed"),
        );
      }
    } catch (err) {
      notify.error(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !pendingConflict || conflicts.length === 0) {
    return null;
  }

  const getCategoryLabel = (key: string): string => {
    switch (key) {
      case "task":
        return t("settings.conflict.category.tasks");
      case "habit":
        return t("settings.conflict.category.habits");
      case "event":
        return t("settings.conflict.category.events");
      case "project":
        return t("settings.conflict.category.projects");
      default:
        return t("settings.conflict.category.workspaces");
    }
  };

  const renderFieldPreview = (
    val: unknown,
    fieldName: string,
    isDiffering: boolean,
  ) => {
    let display = "";
    if (val === null || val === undefined) {
      display = "(empty)";
    } else if (typeof val === "boolean") {
      display = val ? "true" : "false";
    } else if (typeof val === "object") {
      display = JSON.stringify(val);
    } else {
      display = String(val);
    }

    return (
      <div
        key={fieldName}
        className={`text-xs py-0.5 px-1.5 rounded flex justify-between gap-2 ${
          isDiffering
            ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 font-medium border border-amber-500/20"
            : "text-muted-foreground"
        }`}
      >
        <span className="font-mono text-[10px] opacity-75">{fieldName}:</span>
        <span className="truncate max-w-[160px]" title={display}>
          {display}
        </span>
      </div>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-6 gap-4">
        <DialogHeader className="space-y-1">
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-5 w-5" />
            <DialogTitle className="text-base font-semibold">
              {t("settings.conflict.dialog.title")}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs">
            {t("settings.conflict.dialog.description", {
              device: pendingConflict.deviceLabel,
              count: conflicts.length,
            })}
          </DialogDescription>
        </DialogHeader>

        {/* Global Batch Actions Bar */}
        <div className="flex items-center justify-between bg-muted/40 p-2.5 rounded-lg border border-border/40">
          <span className="text-xs font-medium text-muted-foreground">
            {t("settings.conflict.dialog.pendingCount", {
              count: conflicts.length,
            })}
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleBatchChoice("local")}
              className="h-7 text-xs border-border/60 hover:bg-muted"
            >
              <Laptop className="h-3 w-3 mr-1" />
              {t("settings.conflict.batch.allLocal")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleBatchChoice("remote")}
              className="h-7 text-xs border-border/60 hover:bg-muted"
            >
              <Cloud className="h-3 w-3 mr-1" />
              {t("settings.conflict.batch.allRemote")}
            </Button>
          </div>
        </div>

        {/* Scrollable Conflict Cards Container */}
        <div className="flex-1 overflow-y-auto space-y-6 pr-1">
          {Object.entries(groupedConflicts).map(([catKey, items]) => {
            if (items.length === 0) return null;
            return (
              <div key={catKey} className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                  {getCategoryLabel(catKey)} ({items.length})
                </h4>

                <div className="space-y-3">
                  {items.map((conflict) => {
                    const choice = getChoice(conflict.id);
                    const isDeleteModify =
                      conflict.conflictType === "delete-modify";
                    const isModifyDelete =
                      conflict.conflictType === "modify-delete";

                    return (
                      <div
                        key={conflict.id}
                        className="rounded-lg border border-border/60 bg-card p-3.5 space-y-3 shadow-xs"
                      >
                        {/* Conflict Card Header */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm text-foreground">
                                {conflict.title}
                              </span>
                              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                {conflict.entityType}
                              </span>
                              {(isDeleteModify || isModifyDelete) && (
                                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-red-500/10 text-red-600 dark:text-red-400">
                                  {t(
                                    "settings.conflict.dialog.deleteModifyDiff",
                                  )}
                                </span>
                              )}
                            </div>
                            {conflict.differingFields.length > 0 && (
                              <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                                <span>
                                  {t(
                                    "settings.conflict.dialog.differingFields",
                                  )}
                                  :
                                </span>
                                <span className="font-mono text-amber-600 dark:text-amber-400">
                                  {conflict.differingFields.join(", ")}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Side by Side Comparison Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {/* Left Column: Local */}
                          <div
                            onClick={() =>
                              handleSetChoice(conflict.id, "local")
                            }
                            className={`p-3 rounded-md border text-xs cursor-pointer transition-all ${
                              choice === "local"
                                ? "border-brand bg-brand/5 ring-1 ring-brand"
                                : "border-border/50 bg-muted/20 hover:border-border"
                            }`}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-medium flex items-center gap-1.5">
                                <Laptop className="h-3.5 w-3.5 text-brand" />
                                {t("settings.conflict.dialog.localVersion")}
                              </span>
                              {choice === "local" && (
                                <Check className="h-4 w-4 text-brand" />
                              )}
                            </div>

                            {conflict.local ? (
                              <div className="space-y-1">
                                {conflict.differingFields.map((f) =>
                                  renderFieldPreview(
                                    conflict.local![f],
                                    f,
                                    true,
                                  ),
                                )}
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5 text-muted-foreground py-2 italic text-xs">
                                <Trash2 className="h-3.5 w-3.5 text-red-500" />
                                {t("settings.conflict.dialog.deletedLocally")}
                              </div>
                            )}
                          </div>

                          {/* Right Column: Remote */}
                          <div
                            onClick={() =>
                              handleSetChoice(conflict.id, "remote")
                            }
                            className={`p-3 rounded-md border text-xs cursor-pointer transition-all ${
                              choice === "remote"
                                ? "border-brand bg-brand/5 ring-1 ring-brand"
                                : "border-border/50 bg-muted/20 hover:border-border"
                            }`}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-medium flex items-center gap-1.5">
                                <Cloud className="h-3.5 w-3.5 text-blue-500" />
                                {t("settings.conflict.dialog.remoteVersion")} (
                                {pendingConflict.deviceLabel})
                              </span>
                              {choice === "remote" && (
                                <Check className="h-4 w-4 text-brand" />
                              )}
                            </div>

                            {conflict.remote ? (
                              <div className="space-y-1">
                                {conflict.differingFields.map((f) =>
                                  renderFieldPreview(
                                    conflict.remote![f],
                                    f,
                                    true,
                                  ),
                                )}
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5 text-muted-foreground py-2 italic text-xs">
                                <Trash2 className="h-3.5 w-3.5 text-red-500" />
                                {t("settings.conflict.dialog.deletedRemotely")}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Action buttons row */}
                        <div className="flex items-center justify-between pt-1 text-xs">
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant={
                                choice === "local" ? "default" : "outline"
                              }
                              onClick={() =>
                                handleSetChoice(conflict.id, "local")
                              }
                              className="h-7 text-xs"
                            >
                              {t("settings.conflict.action.keepLocal")}
                            </Button>
                            <Button
                              size="sm"
                              variant={
                                choice === "remote" ? "default" : "outline"
                              }
                              onClick={() =>
                                handleSetChoice(conflict.id, "remote")
                              }
                              className="h-7 text-xs"
                            >
                              {t("settings.conflict.action.keepRemote")}
                            </Button>
                            {conflict.local && conflict.remote && (
                              <Button
                                size="sm"
                                variant={
                                  choice === "duplicate" ? "default" : "outline"
                                }
                                onClick={() =>
                                  handleSetChoice(conflict.id, "duplicate")
                                }
                                className="h-7 text-xs"
                              >
                                <Copy className="h-3 w-3 mr-1" />
                                {t("settings.conflict.action.duplicate")}
                              </Button>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => toggleJsonDiff(conflict.id)}
                            className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 cursor-pointer transition-colors"
                          >
                            {expandedJson[conflict.id] ? (
                              <ChevronDown className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5" />
                            )}
                            {t("settings.conflict.dialog.rawJsonDiff")}
                          </button>
                        </div>

                        {/* Collapsible Raw JSON Diff */}
                        {expandedJson[conflict.id] && (
                          <div className="pt-2 border-t border-border/40 grid grid-cols-2 gap-2 text-[10px] font-mono bg-muted/40 p-2 rounded">
                            <div>
                              <div className="font-semibold text-muted-foreground mb-1">
                                Local JSON:
                              </div>
                              <pre className="overflow-x-auto max-h-32 text-muted-foreground/90">
                                {JSON.stringify(conflict.local, null, 2)}
                              </pre>
                            </div>
                            <div>
                              <div className="font-semibold text-muted-foreground mb-1">
                                Remote JSON:
                              </div>
                              <pre className="overflow-x-auto max-h-32 text-muted-foreground/90">
                                {JSON.stringify(conflict.remote, null, 2)}
                              </pre>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Dialog Footer */}
        <DialogFooter className="flex flex-row justify-end gap-2 pt-2 border-t border-border/40">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
            className="text-xs h-9"
          >
            {t("common.cancel")}
          </Button>
          <Button
            variant="default"
            onClick={handleApplyAndPush}
            disabled={isSubmitting}
            className="text-xs h-9 bg-brand hover:bg-brand/90 font-medium"
          >
            {isSubmitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
            ) : null}
            {t("settings.conflict.dialog.applyAndPush")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
