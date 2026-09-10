/**
 * Edge Domain Commands (ADR 0016/0017/0021): the single write funnel for
 * the arrangement's connections. Same layer and funnel discipline as the
 * node and workspace commands — a named plain async function any caller
 * can execute (the canvas controller, an importer, a future agent), owning
 * the write, cache invalidation, and publication of the resulting fact.
 *
 * Write policy — `add` is the one arrangement write with an optimistic
 * caller. The canvas draws the connection the instant the user drops it
 * (the layer-2 pattern ADR 0018 documents for drags), so the command's job
 * is to make that drawn row real: it persists the caller's id, publishes
 * `edge.added`, and invalidates so the cache re-reads the row that now
 * exists. On failure it invalidates *first* and then rethrows — a refused
 * write must not leave an optimistic line standing, and the canvas decides
 * how the failure surfaces. `remove` is a plain low-frequency write:
 * write → invalidate → publish, no optimistic layer.
 *
 * Events: `edge.added` / `edge.removed` — past-tense facts about the
 * arrangement, payload is the edge reference (workspace + edge ids), never
 * a full row. Nothing publishes on failure.
 */
import type { QueryClient } from "@tanstack/react-query";
import { workspaceMutations } from "@/lib/mutations/workspace";
import { workspaceKeys } from "@/lib/queries/workspace-keys";
import { publishDomainEvent } from "@/lib/events/domain-bus";
import type { AddEdgeInput, WorkspaceEdge } from "@/lib/types/workspace";

export interface EdgeCommandContext {
  readonly queryClient: QueryClient;
  readonly isGuestMode: boolean;
}

/** Invalidates the edges family: every per-workspace list, both modes. */
function invalidateEdgeCaches(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: workspaceKeys.edges.all });
}

export const edgeCommands = {
  /**
   * `edge.add` — draw a connection between two nodes on a workspace. The
   * nodes themselves are never touched: a connection is arrangement, and
   * cutting it later leaves both endpoints exactly as they were.
   */
  add: async (
    ctx: EdgeCommandContext,
    input: AddEdgeInput,
  ): Promise<WorkspaceEdge> => {
    try {
      const edge = await workspaceMutations.addEdge(input);

      invalidateEdgeCaches(ctx.queryClient);
      publishDomainEvent({
        type: "edge.added",
        workspaceId: input.workspaceId,
        edgeId: edge.id,
      });

      return edge;
    } catch (err) {
      invalidateEdgeCaches(ctx.queryClient);
      throw err;
    }
  },

  /**
   * `edge.remove` — cut a connection. Both endpoints survive: only the
   * relationship between them goes away.
   */
  remove: async (
    ctx: EdgeCommandContext,
    edge: { id: string; workspace_id: string },
  ): Promise<void> => {
    await workspaceMutations.removeEdge(edge.id);

    invalidateEdgeCaches(ctx.queryClient);
    publishDomainEvent({
      type: "edge.removed",
      workspaceId: edge.workspace_id,
      edgeId: edge.id,
    });
  },
};
