"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Calendar } from "lucide-react";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
} from "@/components/ui/responsive-dialog";
import { useTasks } from "@/lib/hooks/useTasks";
import { useAuth } from "@/components/AuthProvider";
import { Skeleton } from "@/components/ui/skeleton";
import { notify } from "@/lib/notify";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { cn } from "@/lib/utils";
import { formatDueDate } from "@/components/tasks/task-utils";
import { getNodeKindSpec } from "./node-registry";
import type { TaskNodeCommands } from "./node-registry";
import type { NodePosition, WorkspaceNode } from "@/lib/types/workspace";
import type { Task } from "@/lib/types/task";

interface AddTaskNodeDialogProps {
  workspaceId: string;
  /** Where the new node lands (canvas center at open time). */
  position: NodePosition;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNodeAdded?: (node: WorkspaceNode) => void;
}

/**
 * The "place an existing task onto the canvas" picker: lists the same
 * tasks the tasks page reads (the default list entry), and selecting one
 * routes through the task kind's registry binding — `node.add` with the
 * reference pair and the registry defaults. The task itself is never
 * touched; the node is a new reference.
 */
export function AddTaskNodeDialog({
  workspaceId,
  position,
  open,
  onOpenChange,
  onNodeAdded,
}: AddTaskNodeDialogProps) {
  const queryClient = useQueryClient();
  const { isGuestMode } = useAuth();
  const { t } = useTranslation();
  const spec = getNodeKindSpec("task");
  const { data: tasks = [], isLoading } = useTasks();

  const handleSelect = async (task: Task) => {
    if (!spec) return;
    try {
      const createdNode = await (spec.commands as TaskNodeCommands).add(
        { queryClient, isGuestMode },
        { workspaceId, taskId: task.id, position },
      );
      notify(t("workspace.addTask.added"));
      onOpenChange(false);
      if (createdNode) {
        onNodeAdded?.(createdNode);
      }
    } catch (err) {
      console.error("Failed to add task node:", err);
      notify.error(t("workspace.addTask.addFailed"));
    }
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-[400px] p-0 overflow-hidden">
        <ResponsiveDialogHeader className="px-5 pt-5 pb-3 border-b border-border/40">
          <ResponsiveDialogTitle>
            {t("workspace.addTask.title")}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            {t("workspace.addTask.description")}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <div className="max-h-[60vh] overflow-y-auto">
          {isLoading ? (
            <div className="space-y-3 py-4 px-4">
              <Skeleton className="h-10 w-full rounded-md" />
              <Skeleton className="h-10 w-full rounded-md" />
              <Skeleton className="h-10 w-3/4 rounded-md" />
            </div>
          ) : tasks.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-[13px] text-muted-foreground">
                {t("workspace.addTask.emptyTitle")}
              </p>
              <p className="text-[13px] text-muted-foreground mt-1">
                {t("workspace.addTask.emptyDescription")}
              </p>
            </div>
          ) : (
            <ul>
              {tasks.map((task) => (
                <li key={task.id}>
                  <button
                    type="button"
                    data-testid={`add-task-option-${task.id}`}
                    onClick={() => void handleSelect(task)}
                    className={cn(
                      "w-full flex items-center gap-3 py-3 px-4 text-left",
                      "hover:bg-secondary/40 cursor-pointer transition-colors duration-100",
                    )}
                  >
                    <span
                      className={cn(
                        "flex-1 text-[15px] font-normal truncate",
                        task.is_completed && "line-through opacity-40",
                      )}
                    >
                      {task.content}
                    </span>
                    {task.due_date && (
                      <span className="text-[11px] text-muted-foreground/80 flex items-center gap-1 font-medium uppercase tracking-wider shrink-0">
                        <Calendar className="h-3 w-3" strokeWidth={2.25} />
                        {formatDueDate(task.due_date)}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
