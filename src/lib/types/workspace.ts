/**
 * Workspace domain types (ADR 0018). A Workspace is a saved arrangement of
 * Node references — it holds no domain data. A WorkspaceNode stores
 * reference metadata only (node id, entity type, entity id, position,
 * size, display config) and never a copy of the entity's business fields:
 * the entity is read through the same Query cache the normal UI reads.
 */

export interface Workspace {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceNode {
  id: string;
  workspace_id: string;
  /** Denormalised from the workspace row for the RLS convention. */
  user_id: string;
  /**
   * Tolerant node kind (`task`, `habit`, `event`, `focus`, or a value a
   * newer app version wrote). Unknown kinds render as placeholders, so
   * this is text, not an enum.
   */
  kind: string;
  /**
   * The soft reference pair — which domain record the node points at.
   * Nullable, and paired: both null (a focus node has no reference) or
   * both set. Deliberately without a foreign key: one column, several
   * possible target tables, so integrity is an application concern.
   */
  entity_type: string | null;
  entity_id: string | null;
  position_x: number;
  position_y: number;
  width: number | null;
  height: number | null;
  /** Kind-specific display options (collapsed/expanded, etc.). */
  display_config: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

/** Known phase-1 node kinds. Anything else renders the placeholder. */
export const WORKSPACE_NODE_KINDS = [
  "task",
  "habit",
  "event",
  "focus",
] as const;

export type WorkspaceNodeKind = (typeof WORKSPACE_NODE_KINDS)[number];

export interface CreateWorkspaceInput {
  name: string;
}

/** A node's position on the canvas, in flow coordinates. */
export interface NodePosition {
  x: number;
  y: number;
}

/**
 * `node.add` input: the reference pair plus placement. Size and display
 * config come from the kind's registry defaults when omitted — the
 * registry is the single declarative source (spec: UI).
 */
export interface AddNodeInput {
  workspaceId: string;
  kind: string;
  entityType: string | null;
  entityId: string | null;
  position: NodePosition;
  width?: number | null;
  height?: number | null;
  displayConfig?: Record<string, unknown> | null;
}

/** `node.move` input: final position only — a row-level position PATCH. */
export interface MoveNodeInput {
  workspaceId: string;
  nodeId: string;
  position: NodePosition;
}
