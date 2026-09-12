/**
 * Workspace Domain Commands (ADR 0016/0018): the single write funnel for
 * arrangement changes. Same layer and funnel discipline as the task
 * commands: a named plain async function any caller can execute — dialog,
 * command palette, future agent — owning the write itself, cache
 * invalidation, and publication of the resulting Node event (ADR 0017).
 *
 * Workspace CRUD is low-frequency and non-interactive-state (no
 * checkbox racing), so the policy is deliberately simpler than the task
 * commands': write, invalidate, publish — no optimistic patch, no
 * rollback. Node drag persistence (ticket 05) layers its own three-stage
 * optimistic/debounced policy on top.
 *
 * Events: `workspace.created` / `workspace.renamed` / `workspace.deleted`
 * — past-tense facts about the arrangement, payload is the workspace
 * reference, never a full row. Nothing publishes on failure.
 */
import type { QueryClient } from "@tanstack/react-query";
import { workspaceMutations } from "@/lib/mutations/workspace";
import { workspaceKeys } from "@/lib/queries/workspace-keys";
import { publishDomainEvent } from "@/lib/events/domain-bus";
import type { Workspace, CreateWorkspaceInput } from "@/lib/types/workspace";

export interface WorkspaceCommandContext {
  readonly queryClient: QueryClient;
  readonly isGuestMode: boolean;
}

/** Invalidates every cache family a workspace write can touch. */
function invalidateWorkspaceCaches(
  queryClient: QueryClient,
  isGuestMode: boolean,
  workspaceId?: string,
): void {
  void Promise.all([
    queryClient.invalidateQueries({
      queryKey: workspaceKeys.list(isGuestMode),
    }),
    queryClient.invalidateQueries({ queryKey: workspaceKeys.nodes.all }),
    ...(workspaceId
      ? [
          queryClient.invalidateQueries({
            queryKey: workspaceKeys.nodes.of(workspaceId),
          }),
        ]
      : []),
  ]);
}

export const workspaceCommands = {
  /** `workspace.create` — creates a named workspace (an empty canvas). */
  create: async (
    ctx: WorkspaceCommandContext,
    input: CreateWorkspaceInput,
  ): Promise<Workspace> => {
    const workspace = await workspaceMutations.create({
      id: crypto.randomUUID(),
      name: input.name,
      color: input.color,
    });

    invalidateWorkspaceCaches(ctx.queryClient, ctx.isGuestMode);
    publishDomainEvent({
      type: "workspace.created",
      workspaceId: workspace.id,
    });

    return workspace;
  },

  /** `workspace.rename` — changes the workspace's name and optional color. */
  rename: async (
    ctx: WorkspaceCommandContext,
    id: string,
    name: string,
    color?: string,
  ): Promise<Workspace> => {
    const workspace = await workspaceMutations.rename(id, name, color);

    invalidateWorkspaceCaches(ctx.queryClient, ctx.isGuestMode);
    publishDomainEvent({
      type: "workspace.renamed",
      workspaceId: workspace.id,
    });

    return workspace;
  },

  /**
   * `workspace.delete` — hard-deletes the workspace. Nodes cascade with it
   * (the only hard cascade), so the nodes family is invalidated with the
   * workspace's own prefix.
   */
  delete: async (ctx: WorkspaceCommandContext, id: string): Promise<void> => {
    await workspaceMutations.delete(id);

    invalidateWorkspaceCaches(ctx.queryClient, ctx.isGuestMode, id);
    publishDomainEvent({ type: "workspace.deleted", workspaceId: id });
  },
};
