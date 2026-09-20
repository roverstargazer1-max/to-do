/**
 * Shared node-cleanup helper (ADR 0019): what a Domain delete command runs
 * after its entity write lands, to keep the canvas honest. When tasks are
 * destroyed by a command-layer delete (`task.delete`, clear-completed, the
 * project hard-delete flow), the nodes referencing them are removed across
 * the user's workspaces, and the removed node rows are returned to the
 * caller so an Undo context can revive them along with the entity subtree —
 * the same pattern task deletion already uses for cascaded subtasks.
 *
 * Orphan-ness itself stays derived-at-read: no trigger, no tombstone, no
 * stored flag. A cleanup that never ran (a write the command layer never
 * saw — another device, Backup restore pruning, the calendar sync engine)
 * leaves a node whose entity query misses; that node renders the dismissable
 * orphan placeholder. Rare and visible, never silent rot.
 *
 * Connections that touched a removed node go with it (their endpoints are
 * hard FKs, ADR 0021) — the caller does not have to ask, and the edges
 * cache is invalidated alongside the nodes one. Undo revives the node but
 * not those connections: the removal is layout-lossless for nodes, and a
 * cut connection is redrawn with one drag. ADR 0021 records the trade.
 *
 * Policy is identical for Guest and cloud: the workspace mutation services
 * split the two storage backends inline, so this helper needs no mode
 * branch. Every removal publishes `node.removed` and every re-insertion
 * publishes `node.added` — past-tense facts, node references only (ADR
 * 0017). The full rows travel only in the caller's Undo context, never in
 * an event payload.
 */
import { workspaceMutations } from "@/lib/mutations/workspace";
import { workspaceKeys } from "@/lib/queries/workspace-keys";
import { publishDomainEvent } from "@/lib/events/domain-bus";
import type { QueryClient } from "@tanstack/react-query";
import type { WorkspaceNode } from "@/lib/types/workspace";

export interface NodeCleanupContext {
  readonly queryClient: QueryClient;
  readonly isGuestMode?: boolean;
}

/** Invalidates the nodes family: every per-workspace list, both modes. */
function invalidateNodeCaches(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: workspaceKeys.nodes.all });
}

/**
 * Invalidates the edges family too. A connection's endpoints are hard FKs
 * (ADR 0021), so removing a node removes the connections that touched it
 * — in both backends, by cascade. The cache has to hear about it or the
 * canvas would keep drawing lines to a node that is already gone.
 */
function invalidateEdgeCaches(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: workspaceKeys.edges.all });
}

/**
 * Remove every node referencing one of `entityIds` (of `entityType`), across
 * ALL of the user's workspaces — node rows are per-workspace, and a delete
 * must not leave a stale reference on any board. Returns the removed rows
 * for the caller's Undo context. Node identity (id), placement, and display
 * config are preserved in those rows, so re-insertion restores the exact
 * layout. Low-frequency arrangement writes: no optimistic layer, and a
 * failure throws to the caller, whose policy decides how honest degradation
 * surfaces.
 */
export async function removeNodesReferencing(
  ctx: NodeCleanupContext,
  refs: { entityType: string; entityIds: string[] },
): Promise<WorkspaceNode[]> {
  const { entityType, entityIds } = refs;
  if (entityIds.length === 0) return [];

  const idSet = new Set(entityIds);
  const removed: WorkspaceNode[] = [];

  const workspaces = await workspaceMutations.list();
  for (const workspace of workspaces) {
    const nodes = await workspaceMutations.listNodes(workspace.id);
    for (const node of nodes) {
      if (node.entity_type !== entityType) continue;
      if (node.entity_id === null || !idSet.has(node.entity_id)) continue;

      await workspaceMutations.removeNode(node.id);
      removed.push(node);
      publishDomainEvent({
        type: "node.removed",
        workspaceId: node.workspace_id,
        nodeId: node.id,
      });
    }
  }

  if (removed.length > 0) {
    invalidateNodeCaches(ctx.queryClient);
    invalidateEdgeCaches(ctx.queryClient);
  }
  return removed;
}

/**
 * Re-insert previously removed node rows verbatim — same id, position, and
 * display config — so an undone delete revives the canvas layout along with
 * the entity. Used by `task.restore` (delete's Undo); an entity restored by
 * any other path (Backup restore) revives its node for free on next fetch,
 * because the node row was never removed.
 */
export async function reinsertNodes(
  ctx: NodeCleanupContext,
  nodes: WorkspaceNode[],
): Promise<void> {
  if (nodes.length === 0) return;

  for (const node of nodes) {
    await workspaceMutations.addNode({
      id: node.id,
      workspaceId: node.workspace_id,
      kind: node.kind,
      entityType: node.entity_type,
      entityId: node.entity_id,
      positionX: node.position_x,
      positionY: node.position_y,
      width: node.width,
      height: node.height,
      groupId: node.group_id,
      displayConfig: node.display_config,
    });
    publishDomainEvent({
      type: "node.added",
      workspaceId: node.workspace_id,
      nodeId: node.id,
    });
  }

  invalidateNodeCaches(ctx.queryClient);
}
