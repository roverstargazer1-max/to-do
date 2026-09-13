"use client";

import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Inbox } from "lucide-react";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
} from "@/components/ui/responsive-dialog";
import { useProjects } from "@/lib/hooks/useProjects";
import { useTasks } from "@/lib/hooks/useTasks";
import { useAuth } from "@/components/AuthProvider";
import { Skeleton } from "@/components/ui/skeleton";
import { notify } from "@/lib/notify";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { cn } from "@/lib/utils";
import { getNodeKindSpec } from "./node-registry";
import type { ProjectNodeCommands } from "./node-registry";
import type { NodePosition, WorkspaceNode } from "@/lib/types/workspace";
import type { Project } from "@/lib/types/task";

interface AddProjectNodeDialogProps {
  workspaceId: string;
  /** Where the new node lands (canvas center at open time). */
  position: NodePosition;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNodeAdded?: (node: WorkspaceNode) => void;
}

/**
 * The "place an existing project onto the canvas" picker: lists active
 * projects (including Inbox and custom projects), and selecting one routes
 * through the project kind's registry binding — `node.add` with the
 * reference pair and the registry defaults.
 */
export function AddProjectNodeDialog({
  workspaceId,
  position,
  open,
  onOpenChange,
  onNodeAdded,
}: AddProjectNodeDialogProps) {
  const queryClient = useQueryClient();
  const { isGuestMode } = useAuth();
  const { t } = useTranslation();
  const spec = getNodeKindSpec("project");

  const { data: projects = [], isLoading: isProjectsLoading } = useProjects();
  const { data: tasks = [], isLoading: isTasksLoading } = useTasks();

  const activeTaskCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const task of tasks) {
      if (task.parent_id || task.is_completed) continue;
      const key = task.project_id ?? "inbox";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [tasks]);

  const handleSelect = async (project: Project) => {
    if (!spec) return;
    try {
      const createdNode = await (spec.commands as ProjectNodeCommands).add(
        { queryClient, isGuestMode },
        { workspaceId, projectId: project.id, position },
      );
      notify(t("workspace.addProject.added"));
      onOpenChange(false);
      if (createdNode) {
        onNodeAdded?.(createdNode);
      }
    } catch (err) {
      console.error("Failed to add project node:", err);
      notify.error(t("workspace.addProject.addFailed"));
    }
  };

  const isLoading = isProjectsLoading || isTasksLoading;

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-[400px] p-0 overflow-hidden">
        <ResponsiveDialogHeader className="px-5 pt-5 pb-3 border-b border-border/40">
          <ResponsiveDialogTitle>
            {t("workspace.addProject.title")}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            {t("workspace.addProject.description")}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <div className="max-h-[60vh] overflow-y-auto">
          {isLoading ? (
            <div className="space-y-3 py-4 px-4">
              <Skeleton className="h-10 w-full rounded-md" />
              <Skeleton className="h-10 w-full rounded-md" />
              <Skeleton className="h-10 w-3/4 rounded-md" />
            </div>
          ) : projects.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-[13px] text-muted-foreground">
                {t("workspace.addProject.emptyTitle")}
              </p>
              <p className="text-[13px] text-muted-foreground mt-1">
                {t("workspace.addProject.emptyDescription")}
              </p>
            </div>
          ) : (
            <ul>
              {projects.map((project) => {
                const countKey = project.is_inbox ? "inbox" : project.id;
                const activeCount = activeTaskCounts.get(countKey) ?? 0;

                return (
                  <li key={project.id}>
                    <button
                      type="button"
                      data-testid={`add-project-option-${project.id}`}
                      onClick={() => void handleSelect(project)}
                      className={cn(
                        "w-full flex items-center gap-3 py-3 px-4 text-left",
                        "hover:bg-secondary/40 cursor-pointer transition-colors duration-100",
                      )}
                    >
                      {project.is_inbox ? (
                        <Inbox
                          className="h-4 w-4 text-muted-foreground shrink-0"
                          strokeWidth={2.25}
                        />
                      ) : (
                        <span
                          className="h-3 w-3 rounded-full shrink-0"
                          style={{
                            backgroundColor:
                              project.color || "var(--color-primary)",
                          }}
                        />
                      )}
                      <span className="flex-1 text-[15px] font-normal truncate">
                        {project.name}
                      </span>
                      <span className="text-[11px] text-muted-foreground shrink-0 font-mono">
                        {t("workspace.project.activeTaskCount", {
                          count: activeCount,
                        })}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
