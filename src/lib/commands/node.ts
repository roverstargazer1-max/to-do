/**
 * Node Domain Commands (ADR 0016/0018): the single write funnel for canvas
 * layout. Same layer and funnel discipline as the task and workspace
 * commands — a named plain async function any caller can execute (node
 * component, canvas controller, future agent), owning the write, cache
 * invalidation, and publication of the resulting Node event (ADR 0017).
 *
 * Commands are kind-agnostic: the reference pair and placement arrive as
 * input; kind-specific defaults and entity bindings are supplied by the
 * node-kind registry at the call site (the registry is the single
 * declarative source — spec: UI).
 *
 * Write policies, deliberately different per frequency class:
 *   add / remove — low-frequency arrangement writes: write → invalidate →
 *                  publish, no optimistic layer (the workspace CRUD
 *                  convention; offline they fail with a toast, they do
 *                  not queue).
 *   remove       — the node's connections go with it (hard FKs, ADR
 *                  0021), so the edges family is invalidated alongside the
 *                  nodes family; the referenced entity is never touched.
 *   move         — the layer-3 executor of the three-layer drag model: the
 *                  canvas already wrote the position optimistically (layer
 *                  2) before debouncing into the `node.move` mutation, so
 *                  the command persists the row-level PATCH, publishes
 *                  `node.moved` after it lands, and — only on failure —
 *                  invalidates so the cache falls back to server truth.
 *                  No refetch on success: a quiet PATCH, per User Story 16.
 *
 * Events: `node.added` / `node.moved` / `node.removed` — past-tense facts
 * about the arrangement, payload is the node reference (workspace + node
 * ids), never a full row. A command that sat offline-paused publishes on
 * resume, after the write lands (ADR 0017). Nothing publishes on failure.
 */
import type { QueryClient } from "@tanstack/react-query";
import { workspaceMutations } from "@/lib/mutations/workspace";
import { workspaceKeys } from "@/lib/queries/workspace-keys";
import { publishDomainEvent } from "@/lib/events/domain-bus";
import type {
  WorkspaceNode,
  AddNodeInput,
  MoveNodeInput,
  ResizeNodeInput,
  CreateGroupInput,
  UngroupInput,
  RenameGroupInput,
  AddToGroupInput,
  RemoveFromGroupInput,
  UpdateDocNodeInput,
  UpdateDecisionNodeInput,
  UpdateStepNodeInput,
  UpdateImageNodeInput,
} from "@/lib/types/workspace";

export interface NodeCommandContext {
  readonly queryClient: QueryClient;
  readonly isGuestMode: boolean;
}

/** Invalidates the nodes family: every per-workspace list, both modes. */
function invalidateNodeCaches(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: workspaceKeys.nodes.all });
}

/**
 * Invalidates the edges family too. A connection's endpoints are hard FKs
 * (ADR 0021): removing a node removes the connections that touched it, in
 * both backends, by cascade — the cache must not keep drawing them.
 */
function invalidateEdgeCaches(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: workspaceKeys.edges.all });
}

export const nodeCommands = {
  /**
   * `node.add` — place a node (a soft reference plus layout metadata) on a
   * workspace. The entity itself is never touched.
   */
  add: async (
    ctx: NodeCommandContext,
    input: AddNodeInput,
  ): Promise<WorkspaceNode> => {
    const payload: Parameters<typeof workspaceMutations.addNode>[0] = {
      id: input.id ?? crypto.randomUUID(),
      workspaceId: input.workspaceId,
      kind: input.kind,
      entityType: input.entityType,
      entityId: input.entityId,
      positionX: input.position.x,
      positionY: input.position.y,
      width: input.width ?? null,
      height: input.height ?? null,
      displayConfig: input.displayConfig ?? null,
    };
    if (input.groupId !== undefined || input.parentId !== undefined) {
      payload.groupId = input.groupId ?? input.parentId ?? null;
    }
    const node = await workspaceMutations.addNode(payload);

    invalidateNodeCaches(ctx.queryClient);
    publishDomainEvent({
      type: "node.added",
      workspaceId: input.workspaceId,
      nodeId: node.id,
    });

    return node;
  },

  /** Alias for `node.add` */
  createNode: (
    ctx: NodeCommandContext,
    input: AddNodeInput,
  ): Promise<WorkspaceNode> => nodeCommands.add(ctx, input),

  /**
   * `node.move` — persist a node's final position as a row-level PATCH.
   * Executed through the `node.move` mutation (position-specific key), so
   * an offline write parks in the mutation queue and lands on reconnect.
   * Success stays quiet (no refetch — the optimistic cache write is the
   * visible truth); failure invalidates so the cache falls back to the
   * persisted row.
   */
  move: async (
    ctx: NodeCommandContext,
    input: MoveNodeInput,
  ): Promise<void> => {
    try {
      await workspaceMutations.updateNodePosition(input.nodeId, input.position);

      publishDomainEvent({
        type: "node.moved",
        workspaceId: input.workspaceId,
        nodeId: input.nodeId,
      });
    } catch (err) {
      invalidateNodeCaches(ctx.queryClient);
      throw err;
    }
  },

  /**
   * `node.resize` — persist a node's final size as a row-level PATCH,
   * executed through the `node.resize` mutation. Quiet on success,
   * invalidate-and-rethrow on failure.
   */
  resize: async (
    ctx: NodeCommandContext,
    input: ResizeNodeInput,
  ): Promise<void> => {
    try {
      await workspaceMutations.updateNodeSize(input.nodeId, {
        width: input.width,
        height: input.height,
      });

      publishDomainEvent({
        type: "node.resized",
        workspaceId: input.workspaceId,
        nodeId: input.nodeId,
      });
    } catch (err) {
      invalidateNodeCaches(ctx.queryClient);
      throw err;
    }
  },

  /**
   * `node.createGroup` — create a visual container node around multiple member nodes.
   * Member coordinates are converted to parent-relative offsets and saved together.
   */
  createGroup: async (
    ctx: NodeCommandContext,
    input: CreateGroupInput,
  ): Promise<WorkspaceNode> => {
    const groupId = input.group.id ?? crypto.randomUUID();
    const groupNode: WorkspaceNode = {
      id: groupId,
      workspace_id: input.workspaceId,
      user_id: ctx.isGuestMode ? "guest" : "",
      kind: "group",
      entity_type: null,
      entity_id: null,
      position_x: input.group.position.x,
      position_y: input.group.position.y,
      width: input.group.width,
      height: input.group.height,
      group_id: null,
      display_config: { title: input.group.title ?? "组" },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const members = input.members.map((m) => ({
      id: m.id,
      position_x: m.position.x,
      position_y: m.position.y,
      group_id: groupId,
    }));

    // Optimistic cache update
    ctx.queryClient.setQueryData<WorkspaceNode[]>(
      workspaceKeys.nodes.list(input.workspaceId, ctx.isGuestMode),
      (old) => {
        if (!old) return [groupNode];
        const memberMap = new Map(members.map((m) => [m.id, m]));
        const updated = old.map((n) => {
          const m = memberMap.get(n.id);
          if (m) {
            return {
              ...n,
              position_x: m.position_x,
              position_y: m.position_y,
              group_id: groupId,
            };
          }
          return n;
        });
        return [...updated, groupNode];
      },
    );

    try {
      await workspaceMutations.createGroup({
        groupNode,
        members,
      });

      publishDomainEvent({
        type: "node.added",
        workspaceId: input.workspaceId,
        nodeId: groupId,
      });

      for (const m of members) {
        publishDomainEvent({
          type: "node.grouped",
          workspaceId: input.workspaceId,
          nodeId: m.id,
          groupId,
        });
      }

      return groupNode;
    } catch (err) {
      invalidateNodeCaches(ctx.queryClient);
      throw err;
    }
  },

  /**
   * `node.ungroup` — dissolve a group container.
   * Member relative coordinates are converted back to canvas-absolute positions.
   */
  ungroup: async (
    ctx: NodeCommandContext,
    input: UngroupInput,
  ): Promise<void> => {
    const cachedNodes = ctx.queryClient.getQueryData<WorkspaceNode[]>(
      workspaceKeys.nodes.list(input.workspaceId, ctx.isGuestMode),
    );
    const groupNode = cachedNodes?.find((n) => n.id === input.groupId);
    const groupX = groupNode?.position_x ?? 0;
    const groupY = groupNode?.position_y ?? 0;

    const memberNodes =
      cachedNodes?.filter((n) => n.group_id === input.groupId) ?? [];
    const members = memberNodes.map((m) => ({
      id: m.id,
      position_x: groupX + m.position_x,
      position_y: groupY + m.position_y,
    }));

    // Optimistic cache update
    ctx.queryClient.setQueryData<WorkspaceNode[]>(
      workspaceKeys.nodes.list(input.workspaceId, ctx.isGuestMode),
      (old) => {
        if (!old) return [];
        const memberMap = new Map(members.map((m) => [m.id, m]));
        return old
          .filter((n) => n.id !== input.groupId)
          .map((n) => {
            const m = memberMap.get(n.id);
            if (m) {
              return {
                ...n,
                position_x: m.position_x,
                position_y: m.position_y,
                group_id: null,
              };
            }
            return n;
          });
      },
    );

    try {
      await workspaceMutations.ungroup({
        groupId: input.groupId,
        members,
      });

      publishDomainEvent({
        type: "node.removed",
        workspaceId: input.workspaceId,
        nodeId: input.groupId,
      });

      for (const m of members) {
        publishDomainEvent({
          type: "node.ungrouped",
          workspaceId: input.workspaceId,
          nodeId: m.id,
          groupId: input.groupId,
        });
      }
    } catch (err) {
      invalidateNodeCaches(ctx.queryClient);
      throw err;
    }
  },

  /**
   * `node.renameGroup` — update group container title.
   */
  renameGroup: async (
    ctx: NodeCommandContext,
    input: RenameGroupInput,
  ): Promise<void> => {
    ctx.queryClient.setQueryData<WorkspaceNode[]>(
      workspaceKeys.nodes.list(input.workspaceId, ctx.isGuestMode),
      (old) =>
        old?.map((n) =>
          n.id === input.groupId
            ? {
                ...n,
                display_config: {
                  ...(n.display_config ?? {}),
                  title: input.title,
                },
              }
            : n,
        ),
    );

    try {
      await workspaceMutations.updateGroupTitle(input.groupId, input.title);
    } catch (err) {
      invalidateNodeCaches(ctx.queryClient);
      throw err;
    }
  },

  /**
   * `node.updateDocNode` — update title and/or content of a doc node.
   * Optimistically updates React Query cache and writes to backend.
   */
  updateDocNode: async (
    ctx: NodeCommandContext,
    input: UpdateDocNodeInput,
  ): Promise<void> => {
    ctx.queryClient.setQueryData<WorkspaceNode[]>(
      workspaceKeys.nodes.list(input.workspaceId, ctx.isGuestMode),
      (old) =>
        old?.map((n) =>
          n.id === input.nodeId
            ? {
                ...n,
                display_config: {
                  ...(n.display_config ?? {}),
                  ...(input.title !== undefined ? { title: input.title } : {}),
                  ...(input.content !== undefined
                    ? { content: input.content }
                    : {}),
                },
              }
            : n,
        ),
    );

    try {
      await workspaceMutations.updateDocNode(input.nodeId, {
        title: input.title,
        content: input.content,
      });
    } catch (err) {
      invalidateNodeCaches(ctx.queryClient);
      throw err;
    }
  },

  /**
   * `node.updateDecisionNode` — update question and/or description of a decision node.
   * Optimistically updates React Query cache and writes to backend.
   */
  updateDecisionNode: async (
    ctx: NodeCommandContext,
    input: UpdateDecisionNodeInput,
  ): Promise<void> => {
    ctx.queryClient.setQueryData<WorkspaceNode[]>(
      workspaceKeys.nodes.list(input.workspaceId, ctx.isGuestMode),
      (old) =>
        old?.map((n) =>
          n.id === input.nodeId
            ? {
                ...n,
                display_config: {
                  ...(n.display_config ?? {}),
                  ...(input.question !== undefined
                    ? { question: input.question }
                    : {}),
                  ...(input.description !== undefined
                    ? { description: input.description }
                    : {}),
                },
              }
            : n,
        ),
    );

    try {
      await workspaceMutations.updateDecisionNode(input.nodeId, {
        question: input.question,
        description: input.description,
      });
    } catch (err) {
      invalidateNodeCaches(ctx.queryClient);
      throw err;
    }
  },

  /**
   * `node.updateStepNode` — update title and/or description of a procedural step node.
   * Optimistically updates React Query cache and writes to backend.
   */
  updateStepNode: async (
    ctx: NodeCommandContext,
    input: UpdateStepNodeInput,
  ): Promise<void> => {
    ctx.queryClient.setQueryData<WorkspaceNode[]>(
      workspaceKeys.nodes.list(input.workspaceId, ctx.isGuestMode),
      (old) =>
        old?.map((n) =>
          n.id === input.nodeId
            ? {
                ...n,
                display_config: {
                  ...(n.display_config ?? {}),
                  ...(input.title !== undefined ? { title: input.title } : {}),
                  ...(input.description !== undefined
                    ? { description: input.description }
                    : {}),
                },
              }
            : n,
        ),
    );

    try {
      await workspaceMutations.updateStepNode(input.nodeId, {
        title: input.title,
        description: input.description,
      });
    } catch (err) {
      invalidateNodeCaches(ctx.queryClient);
      throw err;
    }
  },

  /** `node.updateImageNode` — metadata only; asset bytes remain immutable. */
  updateImageNode: async (
    ctx: NodeCommandContext,
    input: UpdateImageNodeInput,
  ): Promise<void> => {
    ctx.queryClient.setQueryData<WorkspaceNode[]>(
      workspaceKeys.nodes.list(input.workspaceId, ctx.isGuestMode),
      (old) =>
        old?.map((n) =>
          n.id === input.nodeId
            ? {
                ...n,
                display_config: {
                  ...(n.display_config ?? {}),
                  ...(input.title !== undefined ? { title: input.title } : {}),
                  ...(input.role !== undefined ? { role: input.role } : {}),
                  ...(input.altText !== undefined
                    ? { altText: input.altText }
                    : {}),
                  ...(input.versionId !== undefined
                    ? { versionId: input.versionId }
                    : {}),
                },
              }
            : n,
        ),
    );

    try {
      await workspaceMutations.updateImageNode(input.nodeId, {
        title: input.title,
        role: input.role,
        altText: input.altText,
        versionId: input.versionId,
      });
      publishDomainEvent({
        type: "node.updated",
        workspaceId: input.workspaceId,
        nodeId: input.nodeId,
      });
    } catch (err) {
      invalidateNodeCaches(ctx.queryClient);
      throw err;
    }
  },

  /**
   * `node.addToGroup` — attach an existing node into a group container.
   * Optimistically sets group_id and relative position in React Query cache,
   * writes to database/guest-store, and publishes `node.grouped`.
   */
  addToGroup: async (
    ctx: NodeCommandContext,
    input: AddToGroupInput,
  ): Promise<void> => {
    // Optimistic cache update
    ctx.queryClient.setQueryData<WorkspaceNode[]>(
      workspaceKeys.nodes.list(input.workspaceId, ctx.isGuestMode),
      (old) =>
        old?.map((n) =>
          n.id === input.nodeId
            ? {
                ...n,
                group_id: input.groupId,
                position_x: input.position.x,
                position_y: input.position.y,
              }
            : n,
        ),
    );

    try {
      await workspaceMutations.updateNodeGroup({
        nodeId: input.nodeId,
        groupId: input.groupId,
        position: input.position,
      });

      publishDomainEvent({
        type: "node.grouped",
        workspaceId: input.workspaceId,
        nodeId: input.nodeId,
        groupId: input.groupId,
      });
    } catch (err) {
      invalidateNodeCaches(ctx.queryClient);
      throw err;
    }
  },

  /**
   * `node.removeFromGroup` — detach an existing node from a group container
   * into an independent canvas root node at its absolute position.
   * Optimistically clears group_id and sets absolute position in React Query cache,
   * writes to database/guest-store, and publishes `node.ungrouped`.
   */
  removeFromGroup: async (
    ctx: NodeCommandContext,
    input: RemoveFromGroupInput,
  ): Promise<void> => {
    const cachedNodes = ctx.queryClient.getQueryData<WorkspaceNode[]>(
      workspaceKeys.nodes.list(input.workspaceId, ctx.isGuestMode),
    );
    const target = cachedNodes?.find((n) => n.id === input.nodeId);
    const previousGroupId = target?.group_id ?? "";

    // Optimistic cache update
    ctx.queryClient.setQueryData<WorkspaceNode[]>(
      workspaceKeys.nodes.list(input.workspaceId, ctx.isGuestMode),
      (old) =>
        old?.map((n) =>
          n.id === input.nodeId
            ? {
                ...n,
                group_id: null,
                position_x: input.position.x,
                position_y: input.position.y,
              }
            : n,
        ),
    );

    try {
      await workspaceMutations.updateNodeGroup({
        nodeId: input.nodeId,
        groupId: null,
        position: input.position,
      });

      publishDomainEvent({
        type: "node.ungrouped",
        workspaceId: input.workspaceId,
        nodeId: input.nodeId,
        groupId: previousGroupId,
      });
    } catch (err) {
      invalidateNodeCaches(ctx.queryClient);
      throw err;
    }
  },

  /**
   * `node.remove` — remove a node from the canvas. Removing a node never
   * touches the referenced entity; re-adding it later is possible.
   * If a group container is removed, members revert to absolute coords.
   * If removing a member leaves its group empty (0 members), the group dissolves.
   */
  remove: async (
    ctx: NodeCommandContext,
    node: { id: string; workspace_id: string },
  ): Promise<void> => {
    const cachedNodes = ctx.queryClient.getQueryData<WorkspaceNode[]>(
      workspaceKeys.nodes.list(node.workspace_id, ctx.isGuestMode),
    );
    const target = cachedNodes?.find((n) => n.id === node.id);
    const groupId = target?.group_id;

    await workspaceMutations.removeNode(node.id);

    // If removing the last member dissolved the group, publish group removal
    if (groupId) {
      const remaining = cachedNodes?.filter(
        (n) => n.group_id === groupId && n.id !== node.id,
      );
      if (remaining && remaining.length === 0) {
        publishDomainEvent({
          type: "node.removed",
          workspaceId: node.workspace_id,
          nodeId: groupId,
        });
      }
    }

    invalidateNodeCaches(ctx.queryClient);
    invalidateEdgeCaches(ctx.queryClient);
    publishDomainEvent({
      type: "node.removed",
      workspaceId: node.workspace_id,
      nodeId: node.id,
    });
  },

  /** Alias for `node.remove` */
  deleteNode: (
    ctx: NodeCommandContext,
    node: { id: string; workspace_id: string },
  ): Promise<void> => nodeCommands.remove(ctx, node),
};
