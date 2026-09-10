/**
 * Guest workspace storage (ADR 0018): a Guest's workspaces and nodes live
 * in IndexedDB under their own key — the import-source precedent — never
 * inside mockStore's localStorage blob, so drag-frequency node writes
 * never re-serialise the whole guest data set.
 *
 * Read-through, write-through: an in-memory snapshot is kept so repeated
 * reads are synchronous-cheap, and every mutation persists immediately
 * (workspace CRUD is low-frequency; node drag persistence debounces at
 * the command layer, not here).
 */
import { get, set, del } from "idb-keyval";
import type { Workspace, WorkspaceNode } from "@/lib/types/workspace";

const GUEST_WORKSPACES_KEY = "kanso-guest-workspaces";

interface GuestWorkspaceData {
  workspaces: Workspace[];
  nodes: WorkspaceNode[];
}

let cache: GuestWorkspaceData | null = null;

async function loadData(): Promise<GuestWorkspaceData> {
  if (cache) return cache;
  const stored = await get<GuestWorkspaceData>(GUEST_WORKSPACES_KEY);
  cache = stored ?? { workspaces: [], nodes: [] };
  return cache;
}

async function persistData(): Promise<void> {
  if (cache) {
    await set(GUEST_WORKSPACES_KEY, cache);
  }
}

const nowIso = () => new Date().toISOString();

export const guestWorkspaceStore = {
  /**
   * Test seam: drops the in-memory snapshot so the next read falls
   * through to IndexedDB (simulating a reload). Deliberately does not
   * touch the persisted data.
   */
  async clear(): Promise<void> {
    cache = null;
  },

  async listWorkspaces(): Promise<Workspace[]> {
    const data = await loadData();
    return [...data.workspaces].sort((a, b) =>
      a.created_at.localeCompare(b.created_at),
    );
  },

  async createWorkspace(input: {
    id: string;
    name: string;
  }): Promise<Workspace> {
    const data = await loadData();
    const workspace: Workspace = {
      id: input.id,
      user_id: "guest",
      name: input.name,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    data.workspaces.push(workspace);
    await persistData();
    return { ...workspace };
  },

  async renameWorkspace(id: string, name: string): Promise<Workspace> {
    const data = await loadData();
    const workspace = data.workspaces.find((w) => w.id === id);
    if (!workspace) throw new Error("Workspace not found");
    workspace.name = name;
    workspace.updated_at = nowIso();
    await persistData();
    return { ...workspace };
  },

  /**
   * Hard-deletes the workspace and cascades its nodes — the same hard
   * cascade the cloud schema enforces via `workspace_nodes.workspace_id`.
   */
  async deleteWorkspace(id: string): Promise<void> {
    const data = await loadData();
    data.workspaces = data.workspaces.filter((w) => w.id !== id);
    data.nodes = data.nodes.filter((n) => n.workspace_id !== id);
    await persistData();
  },

  async listNodes(workspaceId: string): Promise<WorkspaceNode[]> {
    const data = await loadData();
    return data.nodes
      .filter((n) => n.workspace_id === workspaceId)
      .map((n) => ({ ...n }));
  },

  /**
   * Every node row across all workspaces — the backup export's view (ticket
   * 09). Copies, like listNodes: a serialized payload must never alias the
   * in-memory snapshot.
   */
  async listAllNodes(): Promise<WorkspaceNode[]> {
    const data = await loadData();
    return data.nodes.map((n) => ({ ...n }));
  },

  /**
   * Backup restore (ticket 09, ADR 0015 discipline): one fixed path,
   * overwrite-on-backup, no conflict model. Row ids, placement, and display
   * config arrive verbatim from the payload (the Backup convention) and are
   * written in a single persist — a restore is one write, not thousands.
   * A backup from before workspaces (sections absent) restores as an empty
   * canvas, converging with a fresh device.
   */
  async restoreBackup(
    workspaces: Workspace[],
    nodes: WorkspaceNode[],
  ): Promise<void> {
    cache = {
      workspaces: workspaces.map((w) => ({ ...w })),
      nodes: nodes.map((n) => ({ ...n })),
    };
    await persistData();
  },

  /**
   * "Start fresh" / Clear Data (ticket 09): drops the persisted key and the
   * in-memory snapshot, so guest workspaces empty along with the rest of the
   * store — a partial clear would leave nodes referencing nothing.
   */
  async clearAll(): Promise<void> {
    cache = null;
    await del(GUEST_WORKSPACES_KEY);
  },

  async addNode(input: {
    id: string;
    workspaceId: string;
    kind: string;
    entityType: string | null;
    entityId: string | null;
    positionX: number;
    positionY: number;
    width: number | null;
    height: number | null;
    displayConfig: Record<string, unknown> | null;
  }): Promise<WorkspaceNode> {
    const data = await loadData();
    const node: WorkspaceNode = {
      id: input.id,
      workspace_id: input.workspaceId,
      user_id: "guest",
      kind: input.kind,
      entity_type: input.entityType,
      entity_id: input.entityId,
      position_x: input.positionX,
      position_y: input.positionY,
      width: input.width,
      height: input.height,
      display_config: input.displayConfig,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    data.nodes.push(node);
    await persistData();
    return { ...node };
  },

  /** Row-level position PATCH — only position and updated_at move. */
  async updateNodePosition(
    id: string,
    position: { x: number; y: number },
  ): Promise<void> {
    const data = await loadData();
    const node = data.nodes.find((n) => n.id === id);
    if (!node) throw new Error("Node not found");
    node.position_x = position.x;
    node.position_y = position.y;
    node.updated_at = nowIso();
    await persistData();
  },

  /** Removing a node never touches the referenced entity — layout only. */
  async removeNode(id: string): Promise<void> {
    const data = await loadData();
    data.nodes = data.nodes.filter((n) => n.id !== id);
    await persistData();
  },
};
