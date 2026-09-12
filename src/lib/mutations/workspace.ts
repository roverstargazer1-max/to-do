/**
 * Workspace mutation services (ADR 0018): how to write workspaces — guest
 * (IndexedDB guest store) vs cloud (Supabase) — split inline per function,
 * the same convention as the task mutation services. They know how to
 * write, nothing about cache policy or events; that is the workspace
 * commands' job.
 */
import { createClient } from "@/lib/supabase/client";
import { fetchAllRows } from "@/lib/supabase/paginate";
import { guestWorkspaceStore } from "@/lib/workspace/guest-store";
import type {
  Workspace,
  WorkspaceEdge,
  WorkspaceNode,
  CreateWorkspaceInput,
} from "@/lib/types/workspace";

function isGuest(): boolean {
  return (
    typeof window !== "undefined" &&
    localStorage.getItem("kanso_guest_mode") === "true"
  );
}

async function currentUserId(): Promise<string> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) throw new Error("Not authenticated");
  return user.id;
}

export const workspaceMutations = {
  list: async (): Promise<Workspace[]> => {
    if (isGuest()) {
      return guestWorkspaceStore.listWorkspaces();
    }
    const supabase = createClient();
    // RLS scopes the select to the caller's rows; paged so PostgREST's
    // 1000-row silent truncation can't drop workspaces.
    return fetchAllRows<Workspace>((from, to) =>
      supabase
        .from("workspaces")
        .select("id, user_id, name, created_at, updated_at")
        .order("created_at", { ascending: true })
        .range(from, to),
    );
  },

  create: async (
    input: CreateWorkspaceInput & { id: string },
  ): Promise<Workspace> => {
    if (isGuest()) {
      return guestWorkspaceStore.createWorkspace(input);
    }
    const userId = await currentUserId();
    const supabase = createClient();
    const { data, error } = await supabase
      .from("workspaces")
      .insert({ id: input.id, user_id: userId, name: input.name })
      .select("id, user_id, name, created_at, updated_at")
      .single();
    if (error) throw new Error(error.message);
    return data as Workspace;
  },

  rename: async (id: string, name: string): Promise<Workspace> => {
    if (isGuest()) {
      return guestWorkspaceStore.renameWorkspace(id, name);
    }
    const supabase = createClient();
    const { data, error } = await supabase
      .from("workspaces")
      .update({ name })
      .eq("id", id)
      .select("id, user_id, name, created_at, updated_at")
      .single();
    if (error) throw new Error(error.message);
    return data as Workspace;
  },

  /**
   * Deleting a workspace removes its nodes — the only hard cascade in the
   * workspace schema (`workspace_nodes.workspace_id … ON DELETE CASCADE`).
   */
  delete: async (id: string): Promise<void> => {
    if (isGuest()) {
      return guestWorkspaceStore.deleteWorkspace(id);
    }
    const supabase = createClient();
    const { error } = await supabase.from("workspaces").delete().eq("id", id);
    if (error) throw new Error(error.message);
  },

  listNodes: async (workspaceId: string): Promise<WorkspaceNode[]> => {
    if (isGuest()) {
      return guestWorkspaceStore.listNodes(workspaceId);
    }
    const supabase = createClient();
    // RLS scopes the select to the caller's rows; paged per the repo's
    // unbounded-select lint rule.
    return fetchAllRows<WorkspaceNode>((from, to) =>
      supabase
        .from("workspace_nodes")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: true })
        .range(from, to),
    );
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
    if (isGuest()) {
      return guestWorkspaceStore.addNode(input);
    }
    const userId = await currentUserId();
    const supabase = createClient();
    const { data, error } = await supabase
      .from("workspace_nodes")
      .insert({
        id: input.id,
        workspace_id: input.workspaceId,
        user_id: userId,
        kind: input.kind,
        entity_type: input.entityType,
        entity_id: input.entityId,
        position_x: input.positionX,
        position_y: input.positionY,
        width: input.width,
        height: input.height,
        group_id: input.groupId ?? null,
        display_config: input.displayConfig,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data as WorkspaceNode;
  },

  listEdges: async (workspaceId: string): Promise<WorkspaceEdge[]> => {
    if (isGuest()) {
      return guestWorkspaceStore.listEdges(workspaceId);
    }
    const supabase = createClient();
    // RLS scopes the select to the caller's rows; paged per the repo's
    // unbounded-select lint rule.
    return fetchAllRows<WorkspaceEdge>((from, to) =>
      supabase
        .from("workspace_edges")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: true })
        .range(from, to),
    );
  },

  /**
   * Draw a connection between two nodes (ADR 0021). The id is supplied by
   * the caller — the canvas already drew the edge — so the persisted row
   * and the drawn one are the same row. Both endpoints are hard FKs, so a
   * connection to a node that no longer exists is rejected by the database
   * rather than silently stored.
   */
  addEdge: async (input: {
    id: string;
    workspaceId: string;
    sourceNodeId: string;
    targetNodeId: string;
  }): Promise<WorkspaceEdge> => {
    if (isGuest()) {
      return guestWorkspaceStore.addEdge(input);
    }
    const userId = await currentUserId();
    const supabase = createClient();
    const { data, error } = await supabase
      .from("workspace_edges")
      .insert({
        id: input.id,
        workspace_id: input.workspaceId,
        user_id: userId,
        source_node_id: input.sourceNodeId,
        target_node_id: input.targetNodeId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data as WorkspaceEdge;
  },

  /** Cutting a connection changes the layout only — never the two nodes. */
  removeEdge: async (id: string): Promise<void> => {
    if (isGuest()) {
      return guestWorkspaceStore.removeEdge(id);
    }
    const supabase = createClient();
    const { error } = await supabase
      .from("workspace_edges")
      .delete()
      .eq("id", id);
    if (error) throw new Error(error.message);
  },

  /** Row-level position PATCH — only position and updated_at move. */
  updateNodePosition: async (
    id: string,
    position: { x: number; y: number },
  ): Promise<void> => {
    if (isGuest()) {
      return guestWorkspaceStore.updateNodePosition(id, position);
    }
    const supabase = createClient();
    const { error } = await supabase
      .from("workspace_nodes")
      .update({
        position_x: position.x,
        position_y: position.y,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) throw new Error(error.message);
  },

  /** Row-level size PATCH — width, height, and updated_at move. */
  updateNodeSize: async (
    id: string,
    size: { width: number; height: number },
  ): Promise<void> => {
    if (isGuest()) {
      return guestWorkspaceStore.updateNodeSize(id, size);
    }
    const supabase = createClient();
    const { error } = await supabase
      .from("workspace_nodes")
      .update({
        width: size.width,
        height: size.height,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) throw new Error(error.message);
  },

  /**
   * Create a group container node and update its members with relative coords.
   */
  createGroup: async (input: {
    groupNode: WorkspaceNode;
    members: Array<{
      id: string;
      position_x: number;
      position_y: number;
      group_id: string;
    }>;
  }): Promise<void> => {
    if (isGuest()) {
      return guestWorkspaceStore.createGroup(input);
    }
    const supabase = createClient();
    const { error: insertError } = await supabase
      .from("workspace_nodes")
      .insert(input.groupNode);
    if (insertError) throw new Error(insertError.message);

    for (const member of input.members) {
      const { error: updateError } = await supabase
        .from("workspace_nodes")
        .update({
          position_x: member.position_x,
          position_y: member.position_y,
          group_id: member.group_id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", member.id);
      if (updateError) throw new Error(updateError.message);
    }
  },

  /**
   * Dissolve a group container, restoring members to absolute coords and deleting the group node.
   */
  ungroup: async (input: {
    groupId: string;
    members: Array<{
      id: string;
      position_x: number;
      position_y: number;
    }>;
  }): Promise<void> => {
    if (isGuest()) {
      return guestWorkspaceStore.ungroup(input);
    }
    const supabase = createClient();
    for (const member of input.members) {
      const { error: updateError } = await supabase
        .from("workspace_nodes")
        .update({
          position_x: member.position_x,
          position_y: member.position_y,
          group_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", member.id);
      if (updateError) throw new Error(updateError.message);
    }

    const { error: deleteError } = await supabase
      .from("workspace_nodes")
      .delete()
      .eq("id", input.groupId);
    if (deleteError) throw new Error(deleteError.message);
  },

  /**
   * Update the title of a group container node in display_config.
   */
  updateGroupTitle: async (id: string, title: string): Promise<void> => {
    if (isGuest()) {
      return guestWorkspaceStore.updateGroupTitle(id, title);
    }
    const supabase = createClient();
    const { data: current } = await supabase
      .from("workspace_nodes")
      .select("display_config")
      .eq("id", id)
      .single();
    const displayConfig = {
      ...((current?.display_config as Record<string, unknown>) ?? {}),
      title,
    };
    const { error } = await supabase
      .from("workspace_nodes")
      .update({
        display_config: displayConfig,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) throw new Error(error.message);
  },

  /**
   * Move a single node into or out of a group container with its new coordinates.
   */
  updateNodeGroup: async (input: {
    nodeId: string;
    groupId: string | null;
    position: { x: number; y: number };
  }): Promise<void> => {
    if (isGuest()) {
      return guestWorkspaceStore.updateNodeGroup(input);
    }
    const supabase = createClient();
    const { error } = await supabase
      .from("workspace_nodes")
      .update({
        group_id: input.groupId,
        position_x: input.position.x,
        position_y: input.position.y,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.nodeId);
    if (error) throw new Error(error.message);
  },

  /** Removing a node never touches the referenced entity — layout only. */
  removeNode: async (id: string): Promise<void> => {
    if (isGuest()) {
      return guestWorkspaceStore.removeNode(id);
    }
    const supabase = createClient();
    const { data: target } = await supabase
      .from("workspace_nodes")
      .select("kind, group_id, position_x, position_y")
      .eq("id", id)
      .single();

    if (target?.kind === "group") {
      const members = await fetchAllRows<{
        id: string;
        position_x: number;
        position_y: number;
      }>((from, to) =>
        supabase
          .from("workspace_nodes")
          .select("id, position_x, position_y")
          .eq("group_id", id)
          .range(from, to),
      );
      for (const m of members) {
        await supabase
          .from("workspace_nodes")
          .update({
            position_x: target.position_x + m.position_x,
            position_y: target.position_y + m.position_y,
            group_id: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", m.id);
      }
    }

    const { error } = await supabase
      .from("workspace_nodes")
      .delete()
      .eq("id", id);
    if (error) throw new Error(error.message);

    if (target?.group_id) {
      const { count } = await supabase
        .from("workspace_nodes")
        .select("*", { count: "exact", head: true })
        .eq("group_id", target.group_id);
      if (count === 0) {
        await supabase
          .from("workspace_nodes")
          .delete()
          .eq("id", target.group_id);
      }
    }
  },
};
