/**
 * Node Domain Commands (ADR 0016/0018): the single write funnel for canvas
 * layout. Same layer and funnel discipline as the task and workspace
 * commands — a named plain async function any caller can execute (node
 * component, canvas controller, future agent), owning the write, cache
 * invalidation, and publication of the resulting Node event (ADR 0017).
 *
 * Commands are kind-agnostic: the reference pair and placement arrive as
 * input; kind-specific defaults and entity bindings are supplied by the
 * node-kind registry at the call site (the registry is the single
 * declarative source — spec: UI).
 *
 * Write policies, deliberately different per frequency class:
 *   add / remove — low-frequency arrangement writes: write → invalidate →
 *                  publish, no optimistic layer (the workspace CRUD
 *                  convention; offline they fail with a toast, they do
 *                  not queue).
 *   remove       — the node's connections go with it (hard FKs, ADR
 *                  0021), so the edges family is invalidated alongside the
 *                  nodes family; the referenced entity is never touched.
 *   move         — the layer-3 executor of the three-layer drag model: the
 *                  canvas already wrote the position optimistically (layer
 *                  2) before debouncing into the `node.move` mutation, so
 *                  the command persists the row-level PATCH, publishes
 *                  `node.moved` after it lands, and — only on failure —
 *                  invalidates so the cache falls back to server truth.
 *                  No refetch on success: a quiet PATCH, per User Story 16.
 *
 * Events: `node.added` / `node.moved` / `node.removed` — past-tense facts
 * about the arrangement, payload is the node reference (workspace + node
 * ids), never a full row. A command that sat offline-paused publishes on
 * resume, after the write lands (ADR 0017). Nothing publishes on failure.
 */
import type { QueryClient } from "@tanstack/react-query";
import { workspaceMutations } from "@/lib/mutations/workspace";
import { workspaceKeys } from "@/lib/queries/workspace-keys";
import { publishDomainEvent } from "@/lib/events/domain-bus";
import type {
  WorkspaceNode,
  AddNodeInput,
  MoveNodeInput,
} from "@/lib/types/workspace";

export interface NodeCommandContext {
  readonly queryClient: QueryClient;
  readonly isGuestMode: boolean;
}

/** Invalidates the nodes family: every per-workspace list, both modes. */
function invalidateNodeCaches(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: workspaceKeys.nodes.all });
}

/**
 * Invalidates the edges family too. A connection's endpoints are hard FKs
 * (ADR 0021): removing a node removes the connections that touched it, in
 * both backends, by cascade — the cache must not keep drawing them.
 */
function invalidateEdgeCaches(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: workspaceKeys.edges.all });
}

export const nodeCommands = {
  /**
   * `node.add` — place a node (a soft reference plus layout metadata) on a
   * workspace. The entity itself is never touched.
   */
  add: async (
    ctx: NodeCommandContext,
    input: AddNodeInput,
  ): Promise<WorkspaceNode> => {
    const node = await workspaceMutations.addNode({
      id: crypto.randomUUID(),
      workspaceId: input.workspaceId,
      kind: input.kind,
      entityType: input.entityType,
      entityId: input.entityId,
      positionX: input.position.x,
      positionY: input.position.y,
      width: input.width ?? null,
      height: input.height ?? null,
      displayConfig: input.displayConfig ?? null,
    });

    invalidateNodeCaches(ctx.queryClient);
    publishDomainEvent({
      type: "node.added",
      workspaceId: input.workspaceId,
      nodeId: node.id,
    });

    return node;
  },

  /**
   * `node.move` — persist a node's final position as a row-level PATCH.
   * Executed through the `node.move` mutation (position-specific key), so
   * an offline write parks in the mutation queue and lands on reconnect.
   * Success stays quiet (no refetch — the optimistic cache write is the
   * visible truth); failure invalidates so the cache falls back to the
   * persisted row.
   */
  move: async (
    ctx: NodeCommandContext,
    input: MoveNodeInput,
  ): Promise<void> => {
    try {
      await workspaceMutations.updateNodePosition(input.nodeId, input.position);

      publishDomainEvent({
        type: "node.moved",
        workspaceId: input.workspaceId,
        nodeId: input.nodeId,
      });
    } catch (err) {
      invalidateNodeCaches(ctx.queryClient);
      throw err;
    }
  },

  /**
   * `node.remove` — remove a node from the canvas. Removing a node never
   * touches the referenced entity; re-adding it later is possible.
   */
  remove: async (
    ctx: NodeCommandContext,
    node: { id: string; workspace_id: string },
  ): Promise<void> => {
    await workspaceMutations.removeNode(node.id);

    invalidateNodeCaches(ctx.queryClient);
    invalidateEdgeCaches(ctx.queryClient);
    publishDomainEvent({
      type: "node.removed",
      workspaceId: node.workspace_id,
      nodeId: node.id,
    });
  },
};
