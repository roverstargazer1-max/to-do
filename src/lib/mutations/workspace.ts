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
  if (user) return user.id;
  if (process.env.KAGELIN_MCP_USER_ID) return process.env.KAGELIN_MCP_USER_ID;
  throw new Error("Not authenticated");
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
        .select("id, user_id, name, color, created_at, updated_at")
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
    const insertPayload: {
      id: string;
      user_id: string;
      name: string;
      color?: string;
    } = {
      id: input.id,
      user_id: userId,
      name: input.name,
    };
    if (input.color) {
      insertPayload.color = input.color;
    }
    const { data, error } = await supabase
      .from("workspaces")
      .insert(insertPayload)
      .select("id, user_id, name, color, created_at, updated_at")
      .single();
    if (error) throw new Error(error.message);
    return data as Workspace;
  },

  rename: async (
    id: string,
    name: string,
    color?: string,
  ): Promise<Workspace> => {
    if (isGuest()) {
      return guestWorkspaceStore.renameWorkspace(id, name, color);
    }
    const supabase = createClient();
    const updatePayload: { name: string; color?: string } = { name };
    if (color !== undefined) {
      updatePayload.color = color;
    }
    const { data, error } = await supabase
      .from("workspaces")
      .update(updatePayload)
      .eq("id", id)
      .select("id, user_id, name, color, created_at, updated_at")
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
    const isUuid = (str?: string | null) =>
      Boolean(
        str &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          str,
        ),
      );

    const insertPayload: Record<string, unknown> = {
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
    };
    const hasExplicitId = isUuid(input.id);
    if (hasExplicitId) {
      insertPayload.id = input.id;
    }

    const { data, error } = hasExplicitId
      ? await supabase
          .from("workspace_nodes")
          .upsert(insertPayload, { onConflict: "id" })
          .select("*")
          .single()
      : await supabase
          .from("workspace_nodes")
          .insert(insertPayload)
          .select("*")
          .single();

    if (
      error &&
      (error.code === "23505" ||
        error.message.includes("workspace_nodes_pkey") ||
        error.message.includes("duplicate key")) &&
      hasExplicitId
    ) {
      const { data: existing, error: fetchErr } = await supabase
        .from("workspace_nodes")
        .select("*")
        .eq("id", input.id)
        .maybeSingle();
      if (existing && !fetchErr) {
        return existing as WorkspaceNode;
      }
    }

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
    label?: string | null;
    source_handle?: string | null;
    sourceHandle?: string | null;
    target_handle?: string | null;
    targetHandle?: string | null;
  }): Promise<WorkspaceEdge> => {
    if (isGuest()) {
      return guestWorkspaceStore.addEdge(input);
    }
    const userId = await currentUserId();
    const supabase = createClient();
    const isUuid = (str?: string | null) =>
      Boolean(
        str &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          str,
        ),
      );

    const insertPayload: Record<string, unknown> = {
      workspace_id: input.workspaceId,
      user_id: userId,
      source_node_id: input.sourceNodeId,
      target_node_id: input.targetNodeId,
    };
    if (input.label !== undefined && input.label !== null) {
      insertPayload.label = input.label;
    }
    const sourceHandle = input.source_handle ?? input.sourceHandle;
    if (sourceHandle !== undefined && sourceHandle !== null) {
      insertPayload.source_handle = sourceHandle;
    }
    const targetHandle = input.target_handle ?? input.targetHandle;
    if (targetHandle !== undefined && targetHandle !== null) {
      insertPayload.target_handle = targetHandle;
    }
    const hasExplicitId = isUuid(input.id);
    if (hasExplicitId) {
      insertPayload.id = input.id;
    }

    let { data, error } = hasExplicitId
      ? await supabase
          .from("workspace_edges")
          .upsert(insertPayload, { onConflict: "id" })
          .select("*")
          .single()
      : await supabase
          .from("workspace_edges")
          .insert(insertPayload)
          .select("*")
          .single();

    // Fallback if PostgREST schema cache is stale or remote database lacks label/source_handle/target_handle columns
    if (
      error &&
      (error.message.includes("schema cache") ||
        error.message.includes("column")) &&
      (insertPayload.label !== undefined ||
        insertPayload.source_handle !== undefined ||
        insertPayload.target_handle !== undefined)
    ) {
      console.warn(
        "workspace_edges schema mismatch. Retrying with base edge payload:",
        error.message,
      );
      const fallbackPayload: Record<string, unknown> = {
        workspace_id: input.workspaceId,
        user_id: userId,
        source_node_id: input.sourceNodeId,
        target_node_id: input.targetNodeId,
      };
      if (hasExplicitId) {
        fallbackPayload.id = input.id;
      }
      const retryResult = hasExplicitId
        ? await supabase
            .from("workspace_edges")
            .upsert(fallbackPayload, { onConflict: "id" })
            .select("*")
            .single()
        : await supabase
            .from("workspace_edges")
            .insert(fallbackPayload)
            .select("*")
            .single();
      data = retryResult.data;
      error = retryResult.error;
    }

    if (
      error &&
      (error.code === "23505" ||
        error.message.includes("workspace_edges_pkey") ||
        error.message.includes("duplicate key")) &&
      hasExplicitId
    ) {
      const { data: existing, error: fetchErr } = await supabase
        .from("workspace_edges")
        .select("*")
        .eq("id", input.id)
        .maybeSingle();
      if (existing && !fetchErr) {
        return existing as WorkspaceEdge;
      }
    }

    if (error) throw new Error(error.message);
    return data as WorkspaceEdge;
  },

  /** Update edge properties such as condition label. */
  updateEdge: async (input: {
    id: string;
    workspaceId: string;
    label?: string | null;
  }): Promise<WorkspaceEdge> => {
    if (isGuest()) {
      return guestWorkspaceStore.updateEdge(input.id, { label: input.label });
    }
    const supabase = createClient();
    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (input.label !== undefined && input.label !== null) {
      updatePayload.label = input.label;
    }

    let { data, error } = await supabase
      .from("workspace_edges")
      .update(updatePayload)
      .eq("id", input.id)
      .select("*")
      .single();

    if (
      error &&
      (error.message.includes("schema cache") ||
        error.message.includes("column")) &&
      updatePayload.label !== undefined
    ) {
      console.warn(
        "workspace_edges schema mismatch on update. Retrying without label:",
        error.message,
      );
      delete updatePayload.label;
      const retryResult = await supabase
        .from("workspace_edges")
        .update(updatePayload)
        .eq("id", input.id)
        .select("*")
        .single();
      data = retryResult.data;
      error = retryResult.error;
    }

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
    const userId = await currentUserId();
    const supabase = createClient();
    const groupPayload: WorkspaceNode = {
      ...input.groupNode,
      user_id: userId,
    };
    const { error: insertError } = await supabase
      .from("workspace_nodes")
      .insert(groupPayload);
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
   * Update the title and/or content of a doc node in display_config.
   */
  updateDocNode: async (
    id: string,
    updates: { title?: string; content?: string },
  ): Promise<void> => {
    if (isGuest()) {
      return guestWorkspaceStore.updateDocNode(id, updates);
    }
    const supabase = createClient();
    const { data: current } = await supabase
      .from("workspace_nodes")
      .select("display_config")
      .eq("id", id)
      .single();
    const displayConfig = {
      ...((current?.display_config as Record<string, unknown>) ?? {}),
      ...updates,
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
   * Update the question and/or description of a decision node in display_config.
   */
  updateDecisionNode: async (
    id: string,
    updates: { question?: string; description?: string },
  ): Promise<void> => {
    if (isGuest()) {
      return guestWorkspaceStore.updateDecisionNode(id, updates);
    }
    const supabase = createClient();
    const { data: current } = await supabase
      .from("workspace_nodes")
      .select("display_config")
      .eq("id", id)
      .single();
    const displayConfig = {
      ...((current?.display_config as Record<string, unknown>) ?? {}),
      ...updates,
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
   * Update the title and/or description of a procedural step node in display_config.
   */
  updateStepNode: async (
    id: string,
    updates: { title?: string; description?: string },
  ): Promise<void> => {
    if (isGuest()) {
      return guestWorkspaceStore.updateStepNode(id, updates);
    }
    const supabase = createClient();
    const { data: current } = await supabase
      .from("workspace_nodes")
      .select("display_config")
      .eq("id", id)
      .single();
    const displayConfig = {
      ...((current?.display_config as Record<string, unknown>) ?? {}),
      ...updates,
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

  /** Update image-node display metadata without modifying the visual asset. */
  updateImageNode: async (
    id: string,
    updates: {
      title?: string;
      role?: string;
      altText?: string;
      versionId?: string | null;
    },
  ): Promise<void> => {
    if (isGuest()) {
      return guestWorkspaceStore.updateImageNode(id, updates);
    }
    const supabase = createClient();
    const { data: current } = await supabase
      .from("workspace_nodes")
      .select("display_config")
      .eq("id", id)
      .single();
    const displayConfig = {
      ...((current?.display_config as Record<string, unknown>) ?? {}),
      ...(updates.title !== undefined ? { title: updates.title } : {}),
      ...(updates.role !== undefined ? { role: updates.role } : {}),
      ...(updates.altText !== undefined ? { altText: updates.altText } : {}),
      ...(updates.versionId !== undefined
        ? { versionId: updates.versionId }
        : {}),
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
