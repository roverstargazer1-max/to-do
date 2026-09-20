/**
 * Workspace mutation services (ADR 0018/0023): pure local workspace storage.
 * All Supabase client code and isGuest branching removed.
 */
import { workspacesClient } from "@/lib/api/workspaces-client";
import type {
  Workspace,
  WorkspaceEdge,
  WorkspaceNode,
  CreateWorkspaceInput,
} from "@/lib/types/workspace";

export const workspaceMutations = {
  list: async (): Promise<Workspace[]> => {
    return workspacesClient.list();
  },

  create: async (
    input: CreateWorkspaceInput & { id: string },
  ): Promise<Workspace> => {
    return workspacesClient.create(input);
  },

  rename: async (
    id: string,
    name: string,
    color?: string,
  ): Promise<Workspace> => {
    return workspacesClient.updateWorkspace(id, { name, color });
  },

  delete: async (id: string): Promise<void> => {
    await workspacesClient.deleteWorkspace(id);
  },

  listNodes: async (workspaceId: string): Promise<WorkspaceNode[]> => {
    return workspacesClient.listNodes(workspaceId);
  },

  addNode: async (input: {
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
  }): Promise<WorkspaceNode> => {
    return workspacesClient.createNode({
      id: input.id,
      workspace_id: input.workspaceId,
      kind: input.kind,
      entity_type: input.entityType,
      entity_id: input.entityId,
      position_x: input.positionX,
      position_y: input.positionY,
      width: input.width,
      height: input.height,
      group_id: input.groupId,
      display_config: input.displayConfig,
    });
  },

  listEdges: async (workspaceId: string): Promise<WorkspaceEdge[]> => {
    return workspacesClient.listEdges(workspaceId);
  },

  addEdge: async (input: {
    id: string;
    workspaceId: string;
    sourceNodeId: string;
    targetNodeId: string;
    label?: string | null;
    source_handle?: string | null;
    sourceHandle?: string | null;
    target_handle?: string | null;
    targetHandle?: string | null;
  }): Promise<WorkspaceEdge> => {
    return workspacesClient.createEdge({
      id: input.id,
      workspace_id: input.workspaceId,
      source_node_id: input.sourceNodeId,
      target_node_id: input.targetNodeId,
    });
  },

  updateEdge: async (input: {
    id: string;
    workspaceId: string;
    label?: string | null;
  }): Promise<WorkspaceEdge> => {
    return {
      id: input.id,
      workspace_id: input.workspaceId,
      user_id: "local_user",
      source_node_id: "",
      target_node_id: "",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  },

  removeEdge: async (id: string): Promise<void> => {
    await workspacesClient.deleteEdge(id);
  },

  updateNodePosition: async (
    id: string,
    position: { x: number; y: number },
  ): Promise<void> => {
    await workspacesClient.updateNode(id, {
      position_x: position.x,
      position_y: position.y,
    });
  },

  updateNodeSize: async (
    id: string,
    size: { width: number; height: number },
  ): Promise<void> => {
    await workspacesClient.updateNode(id, {
      width: size.width,
      height: size.height,
    });
  },

  createGroup: async (input: {
    groupNode: WorkspaceNode;
    members: Array<{
      id: string;
      position_x: number;
      position_y: number;
      group_id: string;
    }>;
  }): Promise<void> => {
    await workspacesClient.createNode({
      id: input.groupNode.id,
      workspace_id: input.groupNode.workspace_id,
      kind: input.groupNode.kind,
      position_x: input.groupNode.position_x,
      position_y: input.groupNode.position_y,
      width: input.groupNode.width,
      height: input.groupNode.height,
      display_config: input.groupNode.display_config,
    });
    for (const m of input.members) {
      await workspacesClient.updateNode(m.id, {
        position_x: m.position_x,
        position_y: m.position_y,
        group_id: m.group_id,
      });
    }
  },

  ungroup: async (input: {
    groupId: string;
    members: Array<{
      id: string;
      position_x: number;
      position_y: number;
    }>;
  }): Promise<void> => {
    for (const m of input.members) {
      await workspacesClient.updateNode(m.id, {
        position_x: m.position_x,
        position_y: m.position_y,
        group_id: null,
      });
    }
    await workspacesClient.deleteNode(input.groupId);
  },

  updateGroupTitle: async (id: string, title: string): Promise<void> => {
    await workspacesClient.updateNode(id, {
      display_config: { title },
    });
  },

  updateDocNode: async (
    id: string,
    updates: { title?: string; content?: string },
  ): Promise<void> => {
    await workspacesClient.updateNode(id, {
      display_config: updates,
    });
  },

  updateDecisionNode: async (
    id: string,
    updates: { question?: string; description?: string },
  ): Promise<void> => {
    await workspacesClient.updateNode(id, {
      display_config: updates,
    });
  },

  updateStepNode: async (
    id: string,
    updates: { title?: string; description?: string },
  ): Promise<void> => {
    await workspacesClient.updateNode(id, {
      display_config: updates,
    });
  },

  updateImageNode: async (
    id: string,
    updates: {
      title?: string;
      role?: string;
      altText?: string;
      versionId?: string | null;
    },
  ): Promise<void> => {
    await workspacesClient.updateNode(id, {
      display_config: updates,
    });
  },

  updateNodeGroup: async (input: {
    nodeId: string;
    groupId: string | null;
    position: { x: number; y: number };
  }): Promise<void> => {
    await workspacesClient.updateNode(input.nodeId, {
      group_id: input.groupId,
      position_x: input.position.x,
      position_y: input.position.y,
    });
  },

  removeNode: async (id: string): Promise<void> => {
    await workspacesClient.deleteNode(id);
  },
};
