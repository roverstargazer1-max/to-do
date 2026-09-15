/**
 * Project Domain Commands (ADR 0016): write funnel for project management.
 */
import type { QueryClient } from "@tanstack/react-query";
import { projectMutations } from "@/lib/mutations/project";
import type { Project } from "@/lib/types/task";

export interface ProjectCommandContext {
  readonly queryClient: QueryClient;
  readonly isGuestMode: boolean;
}

export interface CreateProjectCommandInput {
  name: string;
  color?: string;
}

export const projectCommands = {
  /** `project.create` — creates a named project. */
  create: async (
    ctx: ProjectCommandContext,
    input: CreateProjectCommandInput,
  ): Promise<Project> => {
    const project = await projectMutations.create({
      name: input.name,
      color: input.color ?? "#4B6CB7",
    });

    void ctx.queryClient.invalidateQueries({ queryKey: ["projects"] });
    return project;
  },

  /** Alias for `project.create` */
  createProject: (
    ctx: ProjectCommandContext,
    input: CreateProjectCommandInput,
  ): Promise<Project> => projectCommands.create(ctx, input),

  /** `project.delete` — hard-deletes a project during an explicit domain flow. */
  delete: async (ctx: ProjectCommandContext, id: string): Promise<void> => {
    await projectMutations.delete(id);
    void ctx.queryClient.invalidateQueries({ queryKey: ["projects"] });
  },
};
