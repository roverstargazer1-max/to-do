"use client";

import { useMemo, useState, memo } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  ExternalLink,
  FolderKanban,
  Inbox,
  X,
} from "lucide-react";
import { useProjects } from "@/lib/hooks/useProjects";
import { useTasks } from "@/lib/hooks/useTasks";
import { useAuth } from "@/components/AuthProvider";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { notify } from "@/lib/notify";
import { useHaptic } from "@/lib/hooks/useHaptic";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { cn } from "@/lib/utils";
import { handleMutationError } from "@/lib/utils/mutation-error";
import { nodeCommands } from "@/lib/commands/node";
import { taskCommands } from "@/lib/commands/task";
import type { ToggleTaskInput } from "@/lib/commands/task";
import { NodeCard } from "./NodeCard";
import { NodeOrphanBody } from "./NodeOrphanBody";
import { formatDueDate } from "@/components/tasks/task-utils";
import type { WorkspaceNodeComponentProps } from "./node-registry";

const MAX_VISIBLE_TASKS = 4;

/**
 * The project Node — a live reference, not a copy (ADR 0018).
 *
 * Reads project metadata through `useProjects()` and task stats through
 * `useTasks({ projectId, showCompleted: true })`. Allows directly toggling tasks from
 * within the card, opening the right-hand task detail sheet, or navigating
 * to the project view on the tasks page.
 *
 * An unresolvable project renders the orphan placeholder (ADR 0019) with
 * `node.remove` as the single affordance.
 */
export const ProjectNode = memo(function ProjectNode({
  data,
  selected,
}: WorkspaceNodeComponentProps) {
  const { row } = data;
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isGuestMode } = useAuth();
  const { trigger } = useHaptic();
  const { t } = useTranslation();

  const projectId = row.entity_id;
  const testKey = projectId ?? row.id;

  const { data: projects = [], isLoading: isProjectsLoading } = useProjects();
  const project = projects.find((p) => p.id === projectId);

  const { data: rawTasks = [], isLoading: isTasksLoading } = useTasks({
    projectId: project?.is_inbox ? "inbox" : projectId,
    showCompleted: true,
  });

  const projectTasks = useMemo(() => {
    return rawTasks.filter((task) => !task.parent_id);
  }, [rawTasks]);

  const totalTasks = projectTasks.length;
  const completedTasks = useMemo(
    () => projectTasks.filter((t) => t.is_completed).length,
    [projectTasks],
  );
  const completionPercent =
    totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const incompleteTasks = useMemo(
    () => projectTasks.filter((t) => !t.is_completed),
    [projectTasks],
  );

  const sortedIncompleteTasks = useMemo(() => {
    return [...incompleteTasks].sort((a, b) => {
      // 1. Due date ascending (earliest first)
      if (a.due_date && !b.due_date) return -1;
      if (!a.due_date && b.due_date) return 1;
      if (a.due_date && b.due_date) {
        const cmp = a.due_date.localeCompare(b.due_date);
        if (cmp !== 0) return cmp;
      }
      // 2. Priority ascending (P1 before P2/P3/P4)
      const pA = a.priority ?? 4;
      const pB = b.priority ?? 4;
      if (pA !== pB) return pA - pB;
      // 3. Newest first
      return (
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    });
  }, [incompleteTasks]);

  const visibleTasks = sortedIncompleteTasks.slice(0, MAX_VISIBLE_TASKS);
  const remainingCount = sortedIncompleteTasks.length - visibleTasks.length;

  const toggle = useMutation({
    mutationKey: ["toggleTask"],
    mutationFn: (input: ToggleTaskInput) =>
      taskCommands.toggle({ queryClient, isGuestMode }, input),
    onError: (err) => {
      handleMutationError(err);
    },
  });

  const handleToggleTask = (taskId: string, currentCompleted: boolean) => {
    trigger("tick");
    toggle.mutate({ id: taskId, is_completed: !currentCompleted });
  };

  const handleOpenTask = (taskId: string) => {
    window.dispatchEvent(
      new CustomEvent("workspace:open-task-detail", {
        detail: { taskId },
      }),
    );
  };

  const [removing, setRemoving] = useState(false);
  const handleRemove = async () => {
    setRemoving(true);
    try {
      await nodeCommands.remove({ queryClient, isGuestMode }, row);
    } catch (err) {
      console.error("Failed to remove node:", err);
      notify.error(t("workspace.node.removeFailed"));
    } finally {
      setRemoving(false);
    }
  };

  const removeButton = (
    <button
      type="button"
      onClick={handleRemove}
      disabled={removing}
      data-testid={`project-node-remove-${testKey}`}
      aria-label={t("workspace.node.removeProjectAria")}
      className="nodrag grid h-4 w-4 place-content-center rounded-[3px] text-muted-foreground transition-colors duration-200 ease-seijaku hover:bg-muted hover:text-foreground disabled:opacity-50"
    >
      <X className="h-3 w-3" strokeWidth={2.25} />
    </button>
  );

  const kindLabel = (
    <div className="flex items-center gap-1.5 min-w-0">
      <FolderKanban
        className="h-3 w-3 text-muted-foreground shrink-0"
        strokeWidth={2.25}
      />
      <span className="truncate">{t("workspace.node.kindProject")}</span>
    </div>
  );

  if (isProjectsLoading) {
    return (
      <NodeCard
        kind={kindLabel}
        action={removeButton}
        minWidth={240}
        selected={selected}
      >
        <div className="p-3 space-y-2">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-2 w-full" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </NodeCard>
    );
  }

  if (!project) {
    return (
      <NodeCard
        kind={kindLabel}
        action={removeButton}
        minWidth={240}
        selected={selected}
      >
        <NodeOrphanBody lostLabel={t("workspace.node.kindProject")} />
      </NodeCard>
    );
  }

  const projectUrl = `/?project=${project.is_inbox ? "inbox" : project.id}`;

  return (
    <NodeCard
      kind={kindLabel}
      action={removeButton}
      minWidth={260}
      selected={selected}
      data-testid={`project-node-${testKey}`}
    >
      <div className="p-3 space-y-2.5">
        {/* Project title and header */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {project.is_inbox ? (
              <Inbox
                className="h-4 w-4 text-muted-foreground shrink-0"
                strokeWidth={2.25}
              />
            ) : (
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{
                  backgroundColor: project.color || "var(--color-primary)",
                }}
              />
            )}
            <button
              type="button"
              onClick={() => router.push(projectUrl)}
              title={t("workspace.project.openProject")}
              className="nodrag text-left font-medium text-[13px] text-foreground hover:text-brand hover:underline truncate flex items-center gap-1 group"
            >
              <span className="truncate">{project.name}</span>
              <ExternalLink
                className="h-3 w-3 opacity-0 group-hover:opacity-60 transition-opacity shrink-0"
                strokeWidth={2}
              />
            </button>
          </div>
          <span className="text-[11px] font-mono text-muted-foreground shrink-0">
            {completionPercent}%
          </span>
        </div>

        {/* Progress bar */}
        <div>
          <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full transition-all duration-300 rounded-full"
              style={{
                width: `${completionPercent}%`,
                backgroundColor: project.color || "var(--color-primary)",
              }}
            />
          </div>
          <div className="flex justify-between items-center text-[11px] text-muted-foreground mt-1">
            <span>
              {t("workspace.project.completedRatio", {
                completed: completedTasks,
                total: totalTasks,
                percent: completionPercent,
              })}
            </span>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-border/40" />

        {/* Tasks preview list */}
        {isTasksLoading ? (
          <div className="space-y-1.5 py-1">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        ) : totalTasks === 0 ? (
          <p className="text-[11px] text-muted-foreground text-center py-1">
            {t("workspace.project.noTasks")}
          </p>
        ) : incompleteTasks.length === 0 ? (
          <div className="flex items-center justify-center gap-1.5 py-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
            <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.25} />
            <span>{t("workspace.project.allCompleted")}</span>
          </div>
        ) : (
          <div className="space-y-1.5">
            {visibleTasks.map((task) => (
              <div
                key={task.id}
                className="flex items-start gap-2 group/item text-left"
              >
                <div className="nodrag pt-0.5">
                  <Checkbox
                    id={`project-task-${task.id}`}
                    checked={task.is_completed}
                    data-testid={`project-task-toggle-${task.id}`}
                    onCheckedChange={() =>
                      handleToggleTask(task.id, task.is_completed)
                    }
                    className="h-3.5 w-3.5 rounded-[3px]"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleOpenTask(task.id)}
                  className="nodrag flex-1 min-w-0 text-left cursor-pointer group/title"
                >
                  <p
                    className={cn(
                      "text-[12px] leading-tight text-foreground truncate group-hover/title:text-brand transition-colors",
                      task.is_completed && "line-through opacity-40",
                    )}
                  >
                    {task.content}
                  </p>
                  {task.due_date && (
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {formatDueDate(task.due_date)}
                    </span>
                  )}
                </button>
              </div>
            ))}

            {remainingCount > 0 && (
              <button
                type="button"
                onClick={() => router.push(projectUrl)}
                className="nodrag block text-[11px] text-muted-foreground hover:text-foreground font-medium pt-1 text-left hover:underline"
              >
                {t("workspace.project.viewMoreTasks", {
                  count: remainingCount,
                })}
              </button>
            )}
          </div>
        )}
      </div>
    </NodeCard>
  );
});
