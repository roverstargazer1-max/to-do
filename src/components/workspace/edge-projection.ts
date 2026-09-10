import type { Edge } from "@xyflow/react";
import type { WorkspaceEdge } from "@/lib/types/workspace";

/**
 * Flow-edge translation for the arrangement layer (ADR 0021). The mirror of
 * `toWorkspaceFlowNodes`: persisted rows in, React Flow edges out — the
 * only place the two shapes meet, so the canvas never hand-builds one.
 *
 * Orphan derivation happens here (the ADR 0019 discipline applied to
 * connections): an edge is drawn only when *both* of its endpoints are in
 * the node set currently on screen. The database cascades the row away
 * when a node is removed, but the two queries land independently, so for
 * one render the node set can already have lost an endpoint the edge set
 * still lists. Dropping it at the read boundary means a line to a node
 * that is no longer there can never be drawn — the same "derive at read,
 * never store the derived state" rule the nodes follow.
 *
 * Nothing here consults React Flow's runtime: this module is pure
 * translation, which is why it can be unit-tested without a canvas.
 *
 * The carried data is the connection's *identity*, not its row: the canvas
 * draws a connection optimistically the moment it is dropped (layer 2, the
 * drag model's shape), and a half-minted row has no business being the
 * canvas's idea of a connection. What a cut needs — the edge id and the
 * workspace it belongs to — is all that travels.
 */
export interface WorkspaceEdgeData extends Record<string, unknown> {
  /** The persisted edge's id. */
  edgeId: string;
  /** The workspace the edge belongs to (`workspace_id` on the row). */
  workspaceId: string;
}

export type WorkspaceFlowEdge = Edge<WorkspaceEdgeData>;

export function toWorkspaceFlowEdges(
  rows: WorkspaceEdge[],
  nodeIds: Iterable<string>,
): WorkspaceFlowEdge[] {
  const present = new Set(nodeIds);

  return rows
    .filter(
      (row) =>
        present.has(row.source_node_id) && present.has(row.target_node_id),
    )
    .map((row) => ({
      id: row.id,
      source: row.source_node_id,
      target: row.target_node_id,
      // The house edge: React Flow's bezier, re-skinned hairline in
      // workspace-canvas.css. No arrowheads — the ports already say which
      // way the arrangement reads.
      type: "default",
      data: { edgeId: row.id, workspaceId: row.workspace_id },
    }));
}
