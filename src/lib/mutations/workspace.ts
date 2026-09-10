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
        display_config: input.displayConfig,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data as WorkspaceNode;
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

  /** Removing a node never touches the referenced entity — layout only. */
  removeNode: async (id: string): Promise<void> => {
    if (isGuest()) {
      return guestWorkspaceStore.removeNode(id);
    }
    const supabase = createClient();
    const { error } = await supabase
      .from("workspace_nodes")
      .delete()
      .eq("id", id);
    if (error) throw new Error(error.message);
  },
};
