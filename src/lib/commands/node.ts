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
import { notify } from "@/lib/notify";
import { tr } from "@/lib/i18n/tr";
import { useWorkspaceUndoStore } from "@/lib/store/workspaceUndoStore";
import type {
  WorkspaceNode,
  WorkspaceEdge,
  WorkspaceNodeDeletionSnapshot,
  WorkspaceBatchDeletionSnapshot,
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
   *
   * Captures the node snapshot and any incident edges for undo restoration.
   */
  remove: async (
    ctx: NodeCommandContext,
    node: { id: string; workspace_id: string },
    options?: { skipHistory?: boolean; skipNotification?: boolean },
  ): Promise<WorkspaceNodeDeletionSnapshot> => {
    const cachedNodes = ctx.queryClient.getQueryData<WorkspaceNode[]>(
      workspaceKeys.nodes.list(node.workspace_id, ctx.isGuestMode),
    );
    const target = cachedNodes?.find((n) => n.id === node.id);
    const groupId = target?.group_id;

    // Capture incident edges before removal
    const cachedEdges = ctx.queryClient.getQueryData<WorkspaceEdge[]>(
      workspaceKeys.edges.list(node.workspace_id, ctx.isGuestMode),
    );
    const connectedEdges = (cachedEdges ?? []).filter(
      (e) => e.source_node_id === node.id || e.target_node_id === node.id,
    );

    // If target is a group container, capture member relative coordinates
    let groupMembers:
      Array<{ id: string; relativeX: number; relativeY: number }> | undefined;
    if (target?.kind === "group") {
      groupMembers = (cachedNodes ?? [])
        .filter((n) => n.group_id === target.id)
        .map((m) => ({
          id: m.id,
          relativeX: m.position_x,
          relativeY: m.position_y,
        }));
    }

    // If removing the member leaves group empty, capture the dissolved group
    let dissolvedGroup: WorkspaceNode | null = null;
    if (groupId) {
      const remaining = cachedNodes?.filter(
        (n) => n.group_id === groupId && n.id !== node.id,
      );
      if (remaining && remaining.length === 0) {
        dissolvedGroup = cachedNodes?.find((n) => n.id === groupId) ?? null;
      }
    }

    await workspaceMutations.removeNode(node.id);

    // If removing the last member dissolved the group, publish group removal
    if (groupId && dissolvedGroup) {
      publishDomainEvent({
        type: "node.removed",
        workspaceId: node.workspace_id,
        nodeId: groupId,
      });
    }

    invalidateNodeCaches(ctx.queryClient);
    invalidateEdgeCaches(ctx.queryClient);
    publishDomainEvent({
      type: "node.removed",
      workspaceId: node.workspace_id,
      nodeId: node.id,
    });

    const snapshot: WorkspaceNodeDeletionSnapshot = {
      node: target ?? {
        id: node.id,
        workspace_id: node.workspace_id,
        user_id: "",
        kind: "unknown",
        entity_type: null,
        entity_id: null,
        position_x: 0,
        position_y: 0,
        width: null,
        height: null,
        group_id: groupId ?? null,
        display_config: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      connectedEdges,
      dissolvedGroup,
      groupMembers,
    };

    if (!options?.skipHistory) {
      const undoAction = async () => {
        try {
          await nodeCommands.restoreNode(ctx, snapshot);
          notify(tr("workspace.canvas.nodeRestored"));
        } catch (err) {
          console.error("Failed to restore node:", err);
          notify.error(tr("workspace.canvas.restoreFailed"));
        }
      };

      const redoAction = async () => {
        try {
          await nodeCommands.remove(ctx, node, { skipHistory: true });
        } catch (err) {
          console.error("Failed to redo node removal:", err);
          notify.error(tr("workspace.node.removeFailed"));
        }
      };

      useWorkspaceUndoStore.getState().pushAction(node.workspace_id, {
        id: crypto.randomUUID(),
        description: `remove-node-${node.id}`,
        undo: undoAction,
        redo: redoAction,
      });

      if (!options?.skipNotification) {
        notify(tr("workspace.canvas.nodeRemoved"), {
          duration: 7000,
          action: {
            label: tr("workspace.canvas.undo"),
            onClick: undoAction,
          },
        });
      }
    }

    return snapshot;
  },

  /**
   * `node.restoreNode` — restores a previously removed node with its connected
   * edges, group hierarchy, and content.
   */
  restoreNode: async (
    ctx: NodeCommandContext,
    snapshot: WorkspaceNodeDeletionSnapshot,
  ): Promise<void> => {
    const { node, connectedEdges, dissolvedGroup, groupMembers } = snapshot;

    // 1. If group was dissolved, restore the group node first
    if (dissolvedGroup) {
      await workspaceMutations.addNode({
        id: dissolvedGroup.id,
        workspaceId: dissolvedGroup.workspace_id,
        kind: dissolvedGroup.kind,
        entityType: dissolvedGroup.entity_type,
        entityId: dissolvedGroup.entity_id,
        positionX: dissolvedGroup.position_x,
        positionY: dissolvedGroup.position_y,
        width: dissolvedGroup.width,
        height: dissolvedGroup.height,
        groupId: dissolvedGroup.group_id,
        displayConfig: dissolvedGroup.display_config,
      });
      publishDomainEvent({
        type: "node.added",
        workspaceId: dissolvedGroup.workspace_id,
        nodeId: dissolvedGroup.id,
      });
    }

    // 2. Restore the node itself
    await workspaceMutations.addNode({
      id: node.id,
      workspaceId: node.workspace_id,
      kind: node.kind,
      entityType: node.entity_type,
      entityId: node.entity_id,
      positionX: node.position_x,
      positionY: node.position_y,
      width: node.width,
      height: node.height,
      groupId: node.group_id,
      displayConfig: node.display_config,
    });
    publishDomainEvent({
      type: "node.added",
      workspaceId: node.workspace_id,
      nodeId: node.id,
    });

    // 3. If it was a group container with members, restore their relative positions and group_id
    if (node.kind === "group" && groupMembers && groupMembers.length > 0) {
      for (const m of groupMembers) {
        await workspaceMutations.updateNodeGroup({
          nodeId: m.id,
          groupId: node.id,
          position: { x: m.relativeX, y: m.relativeY },
        });
      }
    }

    // 4. Restore incident edges
    if (connectedEdges && connectedEdges.length > 0) {
      for (const edge of connectedEdges) {
        await workspaceMutations.addEdge({
          id: edge.id,
          workspaceId: edge.workspace_id,
          sourceNodeId: edge.source_node_id,
          targetNodeId: edge.target_node_id,
          label: edge.label,
          sourceHandle: edge.source_handle,
          targetHandle: edge.target_handle,
        });
        publishDomainEvent({
          type: "edge.added",
          workspaceId: edge.workspace_id,
          edgeId: edge.id,
        });
      }
    }

    invalidateNodeCaches(ctx.queryClient);
    invalidateEdgeCaches(ctx.queryClient);
  },

  /**
   * `node.removeBatch` — remove multiple nodes in one atomic undo step.
   */
  removeBatch: async (
    ctx: NodeCommandContext,
    workspaceId: string,
    nodes: Array<{ id: string; workspace_id: string }>,
    options?: { skipHistory?: boolean },
  ): Promise<WorkspaceBatchDeletionSnapshot> => {
    const snapshots: WorkspaceNodeDeletionSnapshot[] = [];
    for (const node of nodes) {
      const snap = await nodeCommands.remove(ctx, node, {
        skipHistory: true,
        skipNotification: true,
      });
      snapshots.push(snap);
    }

    if (!options?.skipHistory && snapshots.length > 0) {
      const undoAction = async () => {
        try {
          await nodeCommands.restoreBatch(ctx, { snapshots });
          notify(
            snapshots.length > 1
              ? tr("workspace.canvas.nodesRestored", {
                  count: snapshots.length,
                })
              : tr("workspace.canvas.nodeRestored"),
          );
        } catch (err) {
          console.error("Failed to restore batch nodes:", err);
          notify.error(tr("workspace.canvas.restoreFailed"));
        }
      };

      const redoAction = async () => {
        try {
          await nodeCommands.removeBatch(ctx, workspaceId, nodes, {
            skipHistory: true,
          });
        } catch (err) {
          console.error("Failed to redo batch removal:", err);
          notify.error(tr("workspace.node.removeFailed"));
        }
      };

      useWorkspaceUndoStore.getState().pushAction(workspaceId, {
        id: crypto.randomUUID(),
        description: `remove-batch-${snapshots.length}`,
        undo: undoAction,
        redo: redoAction,
      });

      notify(
        snapshots.length > 1
          ? tr("workspace.canvas.nodesRemoved", { count: snapshots.length })
          : tr("workspace.canvas.nodeRemoved"),
        {
          duration: 7000,
          action: {
            label: tr("workspace.canvas.undo"),
            onClick: undoAction,
          },
        },
      );
    }

    return { snapshots };
  },

  /**
   * `node.restoreBatch` — restores multiple removed nodes in reverse order.
   * Restores all node structures first so both endpoints exist before edges are restored,
   * and de-duplicates any shared incident edges across snapshots.
   */
  restoreBatch: async (
    ctx: NodeCommandContext,
    batchSnapshot: WorkspaceBatchDeletionSnapshot,
  ): Promise<void> => {
    const reversed = [...batchSnapshot.snapshots].reverse();
    const seenGroupIds = new Set<string>();

    // 1. Restore all nodes and dissolved groups first
    for (const snap of reversed) {
      if (snap.dissolvedGroup && !seenGroupIds.has(snap.dissolvedGroup.id)) {
        seenGroupIds.add(snap.dissolvedGroup.id);
        await workspaceMutations.addNode({
          id: snap.dissolvedGroup.id,
          workspaceId: snap.dissolvedGroup.workspace_id,
          kind: snap.dissolvedGroup.kind,
          entityType: snap.dissolvedGroup.entity_type,
          entityId: snap.dissolvedGroup.entity_id,
          positionX: snap.dissolvedGroup.position_x,
          positionY: snap.dissolvedGroup.position_y,
          width: snap.dissolvedGroup.width,
          height: snap.dissolvedGroup.height,
          groupId: snap.dissolvedGroup.group_id,
          displayConfig: snap.dissolvedGroup.display_config,
        });
        publishDomainEvent({
          type: "node.added",
          workspaceId: snap.dissolvedGroup.workspace_id,
          nodeId: snap.dissolvedGroup.id,
        });
      }

      await workspaceMutations.addNode({
        id: snap.node.id,
        workspaceId: snap.node.workspace_id,
        kind: snap.node.kind,
        entityType: snap.node.entity_type,
        entityId: snap.node.entity_id,
        positionX: snap.node.position_x,
        positionY: snap.node.position_y,
        width: snap.node.width,
        height: snap.node.height,
        groupId: snap.node.group_id,
        displayConfig: snap.node.display_config,
      });
      publishDomainEvent({
        type: "node.added",
        workspaceId: snap.node.workspace_id,
        nodeId: snap.node.id,
      });

      if (
        snap.node.kind === "group" &&
        snap.groupMembers &&
        snap.groupMembers.length > 0
      ) {
        for (const m of snap.groupMembers) {
          await workspaceMutations.updateNodeGroup({
            nodeId: m.id,
            groupId: snap.node.id,
            position: { x: m.relativeX, y: m.relativeY },
          });
        }
      }
    }

    // 2. Restore unique incident edges across all snapshots
    const seenEdgeIds = new Set<string>();
    for (const snap of reversed) {
      if (snap.connectedEdges && snap.connectedEdges.length > 0) {
        for (const edge of snap.connectedEdges) {
          if (seenEdgeIds.has(edge.id)) continue;
          seenEdgeIds.add(edge.id);
          await workspaceMutations.addEdge({
            id: edge.id,
            workspaceId: edge.workspace_id,
            sourceNodeId: edge.source_node_id,
            targetNodeId: edge.target_node_id,
            label: edge.label,
            sourceHandle: edge.source_handle,
            targetHandle: edge.target_handle,
          });
          publishDomainEvent({
            type: "edge.added",
            workspaceId: edge.workspace_id,
            edgeId: edge.id,
          });
        }
      }
    }

    invalidateNodeCaches(ctx.queryClient);
    invalidateEdgeCaches(ctx.queryClient);
  },

  /** Alias for `node.remove` */
  deleteNode: (
    ctx: NodeCommandContext,
    node: { id: string; workspace_id: string },
    options?: { skipHistory?: boolean; skipNotification?: boolean },
  ): Promise<WorkspaceNodeDeletionSnapshot> =>
    nodeCommands.remove(ctx, node, options),
};
