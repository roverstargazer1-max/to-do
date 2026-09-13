import { type Edge, MarkerType } from "@xyflow/react";
import type { WorkspaceEdge, WorkspaceNode } from "@/lib/types/workspace";
import {
  resolveOptimalHandles,
  type NodeGeometricInfo,
} from "@/lib/workspace/blueprint/layout";

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
  /** Optional condition or branch label (ADR 0021 / Flowchart Spec). */
  label?: string | null;
  /** Optional callback to persist inline label updates. */
  onUpdateLabel?: (label: string) => void;
}

export type WorkspaceFlowEdge = Edge<WorkspaceEdgeData>;

export function toWorkspaceFlowEdges(
  rows: WorkspaceEdge[],
  nodeIds: Iterable<string>,
  options?: {
    onUpdateLabel?: (edgeId: string, label: string) => void;
    nodes?: Iterable<unknown>;
  },
): WorkspaceFlowEdge[] {
  const present = new Set(nodeIds);

  const nodesMap = new Map<string, NodeGeometricInfo>();
  if (options?.nodes) {
    for (const rawNode of options.nodes) {
      if (!rawNode || typeof rawNode !== "object") continue;
      const n = rawNode as Record<string, unknown>;
      const id = typeof n.id === "string" ? n.id : undefined;
      if (!id) continue;

      const row = (n.data as { row?: WorkspaceNode } | undefined)?.row;
      const x =
        (n.position as { x?: number })?.x ??
        row?.position_x ??
        (n.position_x as number | undefined);
      const y =
        (n.position as { y?: number })?.y ??
        row?.position_y ??
        (n.position_y as number | undefined);
      const width =
        (typeof n.width === "number" ? n.width : undefined) ??
        (typeof (n.style as { width?: number | string })?.width === "number"
          ? (n.style as { width?: number }).width
          : undefined) ??
        row?.width ??
        undefined;
      const groupId =
        (n.parentId as string | undefined) ??
        (n.groupId as string | undefined) ??
        row?.group_id ??
        (n.group_id as string | undefined) ??
        null;

      if (x !== undefined && y !== undefined) {
        nodesMap.set(id, {
          position: { x, y },
          width,
          groupId,
        });
      }
    }
  }

  return rows
    .filter(
      (row) =>
        present.has(row.source_node_id) && present.has(row.target_node_id),
    )
    .map((row) => {
      const data: WorkspaceEdgeData = {
        edgeId: row.id,
        workspaceId: row.workspace_id,
      };
      if (row.label !== undefined && row.label !== null) {
        data.label = row.label;
      }
      if (options?.onUpdateLabel) {
        data.onUpdateLabel = (newLabel: string) =>
          options.onUpdateLabel?.(row.id, newLabel);
      }

      let sourceHandle = row.source_handle ?? undefined;
      let targetHandle = row.target_handle ?? undefined;

      if (!sourceHandle && !targetHandle && nodesMap.size > 0) {
        const sourceNode = nodesMap.get(row.source_node_id);
        const targetNode = nodesMap.get(row.target_node_id);
        if (sourceNode && targetNode) {
          const optimal = resolveOptimalHandles(sourceNode, targetNode);
          sourceHandle = optimal.sourceHandle;
          targetHandle = optimal.targetHandle;
        }
      }

      return {
        id: row.id,
        source: row.source_node_id,
        target: row.target_node_id,
        sourceHandle,
        targetHandle,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 14,
          height: 14,
        },
        // The house edge: React Flow's smooth step, re-skinned hairline in
        // workspace-canvas.css with directional arrowheads.
        type: "default",
        data,
      };
    });
}
