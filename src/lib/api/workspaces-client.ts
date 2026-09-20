import type {
  Workspace,
  WorkspaceNode,
  WorkspaceEdge,
} from "@/lib/types/workspace";
import { getLocalDal } from "@/lib/api/local-dal";

function getBaseUrl(): string {
  if (typeof window !== "undefined") return "";
  return process.env.NEXT_PUBLIC_APP_URL || "http://127.0.0.1:3000";
}

export const workspacesClient = {
  async list(userId = "local_user"): Promise<Workspace[]> {
    const dal = getLocalDal();
    if (dal) return dal.workspaces.list(userId);
    const res = await fetch(
      `${getBaseUrl()}/api/db/workspaces?userId=${encodeURIComponent(userId)}`,
    );
    if (!res.ok)
      throw new Error(`Failed to list workspaces: ${res.statusText}`);
    return res.json();
  },

  async get(id: string): Promise<{
    workspace: Workspace;
    nodes: WorkspaceNode[];
    edges: WorkspaceEdge[];
  }> {
    const dal = getLocalDal();
    if (dal) {
      const ws = dal.workspaces.get(id);
      if (!ws) throw new Error("Workspace not found");
      return ws;
    }
    const res = await fetch(
      `${getBaseUrl()}/api/db/workspaces?id=${encodeURIComponent(id)}`,
    );
    if (!res.ok) throw new Error(`Failed to get workspace: ${res.statusText}`);
    return res.json();
  },

  async create(input: {
    id?: string;
    name: string;
    color?: string | null;
  }): Promise<Workspace> {
    const dal = getLocalDal();
    if (dal) return dal.workspaces.create(input);
    const res = await fetch(`${getBaseUrl()}/api/db/workspaces`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok)
      throw new Error(`Failed to create workspace: ${res.statusText}`);
    return res.json();
  },

  async updateWorkspace(
    id: string,
    updates: Partial<{ name: string; color: string | null }>,
  ): Promise<Workspace> {
    const dal = getLocalDal();
    if (dal) {
      const ws = dal.workspaces.updateWorkspace(id, updates);
      if (!ws) throw new Error("Workspace not found");
      return ws;
    }
    const res = await fetch(`${getBaseUrl()}/api/db/workspaces`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...updates }),
    });
    if (!res.ok)
      throw new Error(`Failed to update workspace: ${res.statusText}`);
    return res.json();
  },

  async deleteWorkspace(id: string): Promise<boolean> {
    const dal = getLocalDal();
    if (dal) return dal.workspaces.deleteWorkspace(id);
    const res = await fetch(
      `${getBaseUrl()}/api/db/workspaces?id=${encodeURIComponent(id)}`,
      {
        method: "DELETE",
      },
    );
    if (!res.ok)
      throw new Error(`Failed to delete workspace: ${res.statusText}`);
    const data = await res.json();
    return Boolean(data.success);
  },

  async listNodes(workspaceId: string): Promise<WorkspaceNode[]> {
    const ws = await this.get(workspaceId);
    return ws.nodes;
  },

  async listEdges(workspaceId: string): Promise<WorkspaceEdge[]> {
    const ws = await this.get(workspaceId);
    return ws.edges;
  },

  async createNode(input: {
    id?: string;
    workspace_id: string;
    kind: string;
    entity_type?: string | null;
    entity_id?: string | null;
    position_x: number;
    position_y: number;
    width?: number | null;
    height?: number | null;
    group_id?: string | null;
    display_config?: Record<string, unknown> | null;
  }): Promise<WorkspaceNode> {
    const dal = getLocalDal();
    if (dal) return dal.workspaces.createNode(input);
    const res = await fetch(`${getBaseUrl()}/api/db/workspace-nodes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok)
      throw new Error(`Failed to create workspace node: ${res.statusText}`);
    return res.json();
  },

  async updateNode(
    id: string,
    updates: Partial<WorkspaceNode>,
  ): Promise<WorkspaceNode> {
    const dal = getLocalDal();
    if (dal) {
      const updated = dal.workspaces.updateNode(id, updates);
      if (!updated) throw new Error("Node not found");
      return updated;
    }
    const res = await fetch(`${getBaseUrl()}/api/db/workspace-nodes`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...updates }),
    });
    if (!res.ok)
      throw new Error(`Failed to update workspace node: ${res.statusText}`);
    return res.json();
  },

  async batchUpdateNodes(
    nodes: {
      id: string;
      position_x?: number;
      position_y?: number;
      width?: number;
      height?: number;
    }[],
  ): Promise<void> {
    const dal = getLocalDal();
    if (dal) {
      dal.workspaces.batchUpdateNodes(nodes);
      return;
    }
    const res = await fetch(`${getBaseUrl()}/api/db/workspace-nodes`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "batchUpdate", nodes }),
    });
    if (!res.ok)
      throw new Error(`Failed to batch update nodes: ${res.statusText}`);
  },

  async deleteNode(id: string): Promise<boolean> {
    const dal = getLocalDal();
    if (dal) return dal.workspaces.deleteNode(id);
    const res = await fetch(
      `${getBaseUrl()}/api/db/workspace-nodes?id=${encodeURIComponent(id)}`,
      {
        method: "DELETE",
      },
    );
    if (!res.ok) throw new Error(`Failed to delete node: ${res.statusText}`);
    const data = await res.json();
    return Boolean(data.success);
  },

  async createEdge(input: {
    id?: string;
    workspace_id: string;
    source_node_id: string;
    target_node_id: string;
  }): Promise<WorkspaceEdge> {
    const dal = getLocalDal();
    if (dal) return dal.workspaces.createEdge(input);
    const res = await fetch(`${getBaseUrl()}/api/db/workspace-edges`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error(`Failed to create edge: ${res.statusText}`);
    return res.json();
  },

  async deleteEdge(id: string): Promise<boolean> {
    const dal = getLocalDal();
    if (dal) return dal.workspaces.deleteEdge(id);
    const res = await fetch(
      `${getBaseUrl()}/api/db/workspace-edges?id=${encodeURIComponent(id)}`,
      {
        method: "DELETE",
      },
    );
    if (!res.ok) throw new Error(`Failed to delete edge: ${res.statusText}`);
    const data = await res.json();
    return Boolean(data.success);
  },
};
