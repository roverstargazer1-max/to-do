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
 *
 * Since ADR 0021 the same record carries the canvas's `edges` section.
 * `workspace_edges` is a *hard* relation in both backends (the cloud
 * schema's FKs cascade), so the two cascades the row storage gets for
 * free are spelled out here: deleting a node drops the connections that
 * touched it, and deleting a workspace drops all of its own.
 */
import { get, set, del } from "idb-keyval";
import type {
  Workspace,
  WorkspaceEdge,
  WorkspaceNode,
} from "@/lib/types/workspace";

const GUEST_WORKSPACES_KEY = "kanso-guest-workspaces";

interface GuestWorkspaceData {
  workspaces: Workspace[];
  nodes: WorkspaceNode[];
  edges: WorkspaceEdge[];
}

let cache: GuestWorkspaceData | null = null;

async function loadData(): Promise<GuestWorkspaceData> {
  if (cache) return cache;
  const stored = await get<GuestWorkspaceData>(GUEST_WORKSPACES_KEY);
  // `edges` is absent from records written before ADR 0021 — a canvas from
  // before connections simply has none, so the section defaults instead of
  // failing the read.
  cache = {
    workspaces: stored?.workspaces ?? [],
    nodes: (stored?.nodes ?? []).map((n) => ({
      ...n,
      group_id: n.group_id ?? null,
    })),
    edges: stored?.edges ?? [],
  };
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
    // Edges are the workspace's own arrangement, so they die with it — the
    // cloud schema's `workspace_edges.workspace_id … CASCADE` counterpart.
    data.edges = data.edges.filter((e) => e.workspace_id !== id);
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

  async listEdges(workspaceId: string): Promise<WorkspaceEdge[]> {
    const data = await loadData();
    return data.edges
      .filter((e) => e.workspace_id === workspaceId)
      .map((e) => ({ ...e }));
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
      // Restoring overwrites the canvas with what the archive carried. A
      // backup has no connections section (see ADR 0021), so a restore
      // leaves the canvas unconnected rather than keeping rows whose two
      // endpoints the restore just replaced.
      edges: [],
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
    groupId?: string | null;
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
      group_id: input.groupId ?? null,
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

  /** Row-level size PATCH — width, height, and updated_at move. */
  async updateNodeSize(
    id: string,
    size: { width: number; height: number },
  ): Promise<void> {
    const data = await loadData();
    const node = data.nodes.find((n) => n.id === id);
    if (!node) throw new Error("Node not found");
    node.width = size.width;
    node.height = size.height;
    node.updated_at = nowIso();
    await persistData();
  },

  /**
   * Atomic creation of a group container and assignment of member relative coords.
   */
  async createGroup(input: {
    groupNode: WorkspaceNode;
    members: Array<{
      id: string;
      position_x: number;
      position_y: number;
      group_id: string;
    }>;
  }): Promise<void> {
    const data = await loadData();
    data.nodes.push(input.groupNode);
    const memberMap = new Map(input.members.map((m) => [m.id, m]));
    for (const node of data.nodes) {
      const update = memberMap.get(node.id);
      if (update) {
        node.position_x = update.position_x;
        node.position_y = update.position_y;
        node.group_id = update.group_id;
        node.updated_at = nowIso();
      }
    }
    await persistData();
  },

  /**
   * Dissolve a group container, restoring members to absolute coords and deleting the group node.
   */
  async ungroup(input: {
    groupId: string;
    members: Array<{ id: string; position_x: number; position_y: number }>;
  }): Promise<void> {
    const data = await loadData();
    data.nodes = data.nodes.filter((n) => n.id !== input.groupId);
    data.edges = data.edges.filter(
      (e) =>
        e.source_node_id !== input.groupId &&
        e.target_node_id !== input.groupId,
    );
    const memberMap = new Map(input.members.map((m) => [m.id, m]));
    for (const node of data.nodes) {
      const update = memberMap.get(node.id);
      if (update) {
        node.position_x = update.position_x;
        node.position_y = update.position_y;
        node.group_id = null;
        node.updated_at = nowIso();
      }
    }
    await persistData();
  },

  /**
   * Move a single node into or out of a group container with its position.
   */
  async updateNodeGroup(input: {
    nodeId: string;
    groupId: string | null;
    position: { x: number; y: number };
  }): Promise<void> {
    const data = await loadData();
    const node = data.nodes.find((n) => n.id === input.nodeId);
    if (!node) throw new Error("Node not found");
    node.group_id = input.groupId;
    node.position_x = input.position.x;
    node.position_y = input.position.y;
    node.updated_at = nowIso();
    await persistData();
  },

  /**
   * Update the title of a group container node.
   */
  async updateGroupTitle(id: string, title: string): Promise<void> {
    const data = await loadData();
    const node = data.nodes.find((n) => n.id === id);
    if (!node) throw new Error("Group node not found");
    node.display_config = {
      ...(node.display_config ?? {}),
      title,
    };
    node.updated_at = nowIso();
    await persistData();
  },

  /**
   * Removing a node never touches the referenced entity — layout only.
   * If a group container node is removed, its members are restored to absolute coords.
   * If a member node is removed and leaves its group empty (0 members), the group dissolves.
   */
  async removeNode(id: string): Promise<void> {
    const data = await loadData();
    const targetNode = data.nodes.find((n) => n.id === id);
    if (!targetNode) return;

    // If removing a group container node: restore members to absolute positions
    if (targetNode.kind === "group") {
      for (const node of data.nodes) {
        if (node.group_id === id) {
          node.position_x = targetNode.position_x + node.position_x;
          node.position_y = targetNode.position_y + node.position_y;
          node.group_id = null;
          node.updated_at = nowIso();
        }
      }
    }

    const previousGroupId = targetNode.group_id;

    data.nodes = data.nodes.filter((n) => n.id !== id);
    data.edges = data.edges.filter(
      (e) => e.source_node_id !== id && e.target_node_id !== id,
    );

    // If removing a member node left a group with 0 members, auto-dissolve the group container
    if (previousGroupId) {
      const remainingMembers = data.nodes.filter(
        (n) => n.group_id === previousGroupId,
      );
      if (remainingMembers.length === 0) {
        data.nodes = data.nodes.filter((n) => n.id !== previousGroupId);
        data.edges = data.edges.filter(
          (e) =>
            e.source_node_id !== previousGroupId &&
            e.target_node_id !== previousGroupId,
        );
      }
    }

    await persistData();
  },

  async addEdge(input: {
    id: string;
    workspaceId: string;
    sourceNodeId: string;
    targetNodeId: string;
  }): Promise<WorkspaceEdge> {
    const data = await loadData();
    // The id arrives from the caller (the canvas already drew the edge), so
    // a retried write converges on the same row instead of duplicating.
    const existing = data.edges.find((e) => e.id === input.id);
    if (existing) return { ...existing };

    const edge: WorkspaceEdge = {
      id: input.id,
      workspace_id: input.workspaceId,
      user_id: "guest",
      source_node_id: input.sourceNodeId,
      target_node_id: input.targetNodeId,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    data.edges.push(edge);
    await persistData();
    return { ...edge };
  },

  async removeEdge(id: string): Promise<void> {
    const data = await loadData();
    data.edges = data.edges.filter((e) => e.id !== id);
    await persistData();
  },
};
