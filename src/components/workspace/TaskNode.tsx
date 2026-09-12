"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Calendar, Flag, X } from "lucide-react";
import { useTasks } from "@/lib/hooks/useTasks";
import { useAuth } from "@/components/AuthProvider";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { notify } from "@/lib/notify";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { cn } from "@/lib/utils";
import { handleMutationError } from "@/lib/utils/mutation-error";
import { nodeCommands } from "@/lib/commands/node";
import type { ToggleTaskInput } from "@/lib/commands/task";
import { NodeCard } from "./NodeCard";
import { NodeOrphanBody } from "./NodeOrphanBody";
import {
  formatDueDate,
  priorityTextClasses,
} from "@/components/tasks/task-utils";
import type {
  TaskNodeCommands,
  WorkspaceNodeComponentProps,
} from "./node-registry";

/**
 * The task Node — a live reference, not a copy. The task is read through
 * the tasks query family the tasks page reads (the entry that keeps
 * completed tasks visible: a node keeps rendering its entity after
 * completion), and the checkbox invokes the same `task.toggle` Domain
 * Command the tasks page uses, via the kind's registry binding — so both
 * surfaces always tell the same story (spec: User Stories 7, 11, 12).
 *
 * A task whose row no longer resolves renders the orphan placeholder
 * (derived at read, ADR 0019) — dismiss (node.remove) is the only
 * affordance; removing the node never touches the task itself.
 */
export function TaskNode({ data, spec }: WorkspaceNodeComponentProps) {
  const { row } = data;
  const queryClient = useQueryClient();
  const { isGuestMode } = useAuth();
  const { t } = useTranslation();

  const taskId = row.entity_id;
  const testKey = taskId ?? row.id;
  const { data: tasks = [], isLoading } = useTasks({ showCompleted: true });
  const task = tasks.find((t) => t.id === taskId);

  // The registry's command binding: the same taskCommands.toggle the
  // tasks-page hook executes, routed through the single registration.
  const toggleCommand = (spec.commands as TaskNodeCommands).toggle;
  const toggle = useMutation({
    mutationKey: ["toggleTask"],
    mutationFn: (input: ToggleTaskInput) =>
      toggleCommand({ queryClient, isGuestMode }, input),
    onError: (err) => {
      handleMutationError(err);
    },
  });

  const [removing, setRemoving] = useState(false);

  // node.remove — layout only; the referenced task is never touched.
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
      data-testid={`task-node-remove-${testKey}`}
      aria-label={t("workspace.node.removeTaskAria")}
      className="nodrag grid h-4 w-4 place-content-center rounded-[3px] text-muted-foreground transition-colors duration-200 ease-seijaku hover:bg-muted hover:text-foreground disabled:opacity-50"
    >
      <X className="h-3 w-3" strokeWidth={2.25} />
    </button>
  );

  const stateLabel = task
    ? task.is_completed
      ? "completed"
      : "active"
    : "missing";

  return (
    <div
      data-testid={`task-node-${testKey}`}
      className="relative w-full h-full"
    >
      <span data-testid={`task-node-state-${testKey}`} className="sr-only">
        {stateLabel}
      </span>

      <NodeCard kind={t("workspace.node.kindTask")} action={removeButton}>
        {isLoading ? (
          <div className="flex items-center gap-2.5 px-3 py-2.5">
            <Skeleton className="h-4 w-4 rounded-[3px]" />
            <Skeleton className="h-4 flex-1" />
          </div>
        ) : task ? (
          <div className="flex items-start gap-2.5 px-3 py-2.5">
            <Checkbox
              checked={task.is_completed}
              onCheckedChange={() =>
                toggle.mutate({
                  id: task.id,
                  is_completed: !task.is_completed,
                })
              }
              disabled={toggle.isPending}
              data-testid={`task-node-toggle-${task.id}`}
              aria-label={t("workspace.node.toggleTaskAria")}
              className="nodrag h-4 w-4 mt-0.5"
            />
            <div className="flex flex-col gap-0.5 min-w-0 flex-1">
              <p className="text-sm font-medium leading-snug break-words text-foreground">
                <span
                  className={cn(task.is_completed && "task-ink-completed-text")}
                  data-animate="false"
                >
                  {task.content}
                </span>
              </p>
              {(task.due_date || task.priority < 4) && (
                <div className="flex items-center gap-2.5 flex-wrap">
                  {task.due_date && (
                    <span className="text-[11px] text-muted-foreground/80 flex items-center gap-1 font-medium uppercase tracking-wider">
                      <Calendar className="h-3 w-3" strokeWidth={2.25} />
                      {formatDueDate(task.due_date)}
                    </span>
                  )}
                  {task.priority < 4 && (
                    <span
                      className={cn(
                        "flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider",
                        priorityTextClasses[task.priority as 1 | 2 | 3 | 4],
                      )}
                    >
                      <Flag className="h-3 w-3" strokeWidth={2.5} />P
                      {task.priority}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <NodeOrphanBody lostLabel={t("workspace.canvas.addTask")} />
        )}
      </NodeCard>
    </div>
  );
}
