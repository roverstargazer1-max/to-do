import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import type { QueryClient as QueryClientType } from "@tanstack/react-query";
import type { WorkspaceNode } from "@/lib/types/workspace";
import { workspaceKeys } from "@/lib/queries/workspace-keys";

vi.mock("@/lib/mutations/workspace", () => ({
  workspaceMutations: {
    list: vi.fn(),
    create: vi.fn(),
    rename: vi.fn(),
    delete: vi.fn(),
    listNodes: vi.fn(),
    addNode: vi.fn(),
    updateNodePosition: vi.fn(),
    removeNode: vi.fn(),
    updateNodeSize: vi.fn(),
    createGroup: vi.fn(),
    ungroup: vi.fn(),
    updateGroupTitle: vi.fn(),
    updateDocNode: vi.fn(),
  },
}));

const publishDomainEvent = vi.fn();
vi.mock("@/lib/events/domain-bus", () => ({
  publishDomainEvent: (...args: unknown[]) => publishDomainEvent(...args),
}));

import { workspaceMutations } from "@/lib/mutations/workspace";
import { nodeCommands } from "@/lib/commands/node";

const makeNode = (overrides: Partial<WorkspaceNode> = {}): WorkspaceNode => ({
  id: "node-1",
  workspace_id: "ws-1",
  user_id: "user-1",
  kind: "task",
  entity_type: "task",
  entity_id: "task-1",
  position_x: 100,
  position_y: 200,
  width: 260,
  height: null,
  display_config: null,
  created_at: "2026-09-09T00:00:00.000Z",
  updated_at: "2026-09-09T00:00:00.000Z",
  ...overrides,
});

describe("nodeCommands", () => {
  let queryClient: QueryClientType;
  let invalidateSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    publishDomainEvent.mockClear();
    vi.mocked(workspaceMutations.addNode).mockReset();
    vi.mocked(workspaceMutations.updateNodePosition).mockReset();
    vi.mocked(workspaceMutations.removeNode).mockReset();
    vi.mocked(workspaceMutations.updateNodeSize).mockReset();
    vi.mocked(workspaceMutations.createGroup).mockReset();
    vi.mocked(workspaceMutations.ungroup).mockReset();
    vi.mocked(workspaceMutations.updateGroupTitle).mockReset();
  });

  describe("add", () => {
    it("runs the service, invalidates the nodes family, and publishes node.added", async () => {
      const node = makeNode();
      vi.mocked(workspaceMutations.addNode).mockResolvedValue(node);

      const result = await nodeCommands.add(
        { queryClient, isGuestMode: false },
        {
          workspaceId: "ws-1",
          kind: "task",
          entityType: "task",
          entityId: "task-1",
          position: { x: 100, y: 200 },
          width: 260,
        },
      );

      expect(result).toEqual(node);
      expect(workspaceMutations.addNode).toHaveBeenCalledWith({
        id: expect.any(String),
        workspaceId: "ws-1",
        kind: "task",
        entityType: "task",
        entityId: "task-1",
        positionX: 100,
        positionY: 200,
        width: 260,
        height: null,
        displayConfig: null,
      });
      expect(publishDomainEvent).toHaveBeenCalledWith({
        type: "node.added",
        workspaceId: "ws-1",
        nodeId: node.id,
      });
      await vi.waitFor(() => {
        expect(invalidateSpy).toHaveBeenCalledWith({
          queryKey: workspaceKeys.nodes.all,
        });
      });
    });

    it("publishes nothing and throws when the service fails", async () => {
      vi.mocked(workspaceMutations.addNode).mockRejectedValue(
        new Error("boom"),
      );

      await expect(
        nodeCommands.add(
          { queryClient, isGuestMode: true },
          {
            workspaceId: "ws-1",
            kind: "task",
            entityType: "task",
            entityId: "task-1",
            position: { x: 0, y: 0 },
          },
        ),
      ).rejects.toThrow("boom");

      expect(publishDomainEvent).not.toHaveBeenCalled();
    });
  });

  describe("move", () => {
    it("persists the row-level position patch and publishes node.moved", async () => {
      vi.mocked(workspaceMutations.updateNodePosition).mockResolvedValue(
        undefined,
      );

      await nodeCommands.move(
        { queryClient, isGuestMode: false },
        {
          workspaceId: "ws-1",
          nodeId: "node-1",
          position: { x: 320, y: 480 },
        },
      );

      expect(workspaceMutations.updateNodePosition).toHaveBeenCalledWith(
        "node-1",
        { x: 320, y: 480 },
      );
      expect(publishDomainEvent).toHaveBeenCalledWith({
        type: "node.moved",
        workspaceId: "ws-1",
        nodeId: "node-1",
      });
    });

    it("stays quiet on success — no refetch after the optimistic write", async () => {
      vi.mocked(workspaceMutations.updateNodePosition).mockResolvedValue(
        undefined,
      );

      await nodeCommands.move(
        { queryClient, isGuestMode: false },
        { workspaceId: "ws-1", nodeId: "node-1", position: { x: 1, y: 2 } },
      );

      expect(invalidateSpy).not.toHaveBeenCalled();
    });

    it("invalidates (falls back to persisted truth) and publishes nothing when the patch fails", async () => {
      vi.mocked(workspaceMutations.updateNodePosition).mockRejectedValue(
        new Error("boom"),
      );

      await expect(
        nodeCommands.move(
          { queryClient, isGuestMode: false },
          { workspaceId: "ws-1", nodeId: "node-1", position: { x: 1, y: 2 } },
        ),
      ).rejects.toThrow("boom");

      expect(publishDomainEvent).not.toHaveBeenCalled();
      await vi.waitFor(() => {
        expect(invalidateSpy).toHaveBeenCalledWith({
          queryKey: workspaceKeys.nodes.all,
        });
      });
    });
  });

  describe("remove", () => {
    it("removes only the node row, invalidates, and publishes node.removed", async () => {
      vi.mocked(workspaceMutations.removeNode).mockResolvedValue(undefined);

      await nodeCommands.remove(
        { queryClient, isGuestMode: false },
        { id: "node-1", workspace_id: "ws-1" },
      );

      expect(workspaceMutations.removeNode).toHaveBeenCalledWith("node-1");
      expect(publishDomainEvent).toHaveBeenCalledWith({
        type: "node.removed",
        workspaceId: "ws-1",
        nodeId: "node-1",
      });
      await vi.waitFor(() => {
        expect(invalidateSpy).toHaveBeenCalledWith({
          queryKey: workspaceKeys.nodes.all,
        });
      });
    });

    it("publishes nothing when the delete fails", async () => {
      vi.mocked(workspaceMutations.removeNode).mockRejectedValue(
        new Error("boom"),
      );

      await expect(
        nodeCommands.remove(
          { queryClient, isGuestMode: false },
          { id: "node-1", workspace_id: "ws-1" },
        ),
      ).rejects.toThrow("boom");

      expect(publishDomainEvent).not.toHaveBeenCalled();
    });

    it("auto-dissolves empty group when its last member is removed", async () => {
      const groupNode = makeNode({
        id: "group-1",
        kind: "group",
        entity_type: null,
        entity_id: null,
      });
      const memberNode = makeNode({
        id: "member-1",
        group_id: "group-1",
      });

      // Pre-seed query cache with group and 1 member
      queryClient.setQueryData(workspaceKeys.nodes.list("ws-1", false), [
        groupNode,
        memberNode,
      ]);

      vi.mocked(workspaceMutations.removeNode).mockResolvedValue(undefined);

      await nodeCommands.remove(
        { queryClient, isGuestMode: false },
        { id: "member-1", workspace_id: "ws-1" },
      );

      expect(workspaceMutations.removeNode).toHaveBeenCalledWith("member-1");
      expect(publishDomainEvent).toHaveBeenCalledWith({
        type: "node.removed",
        workspaceId: "ws-1",
        nodeId: "member-1",
      });
      expect(publishDomainEvent).toHaveBeenCalledWith({
        type: "node.removed",
        workspaceId: "ws-1",
        nodeId: "group-1",
      });
    });
  });

  describe("resize", () => {
    it("persists width and height patch and publishes node.resized", async () => {
      vi.mocked(workspaceMutations.updateNodeSize).mockResolvedValue(undefined);

      await nodeCommands.resize(
        { queryClient, isGuestMode: false },
        {
          workspaceId: "ws-1",
          nodeId: "node-1",
          width: 320,
          height: 180,
        },
      );

      expect(workspaceMutations.updateNodeSize).toHaveBeenCalledWith("node-1", {
        width: 320,
        height: 180,
      });
      expect(publishDomainEvent).toHaveBeenCalledWith({
        type: "node.resized",
        workspaceId: "ws-1",
        nodeId: "node-1",
      });
    });

    it("invalidates and throws when resize fails", async () => {
      vi.mocked(workspaceMutations.updateNodeSize).mockRejectedValue(
        new Error("resize failed"),
      );

      await expect(
        nodeCommands.resize(
          { queryClient, isGuestMode: false },
          {
            workspaceId: "ws-1",
            nodeId: "node-1",
            width: 300,
            height: 200,
          },
        ),
      ).rejects.toThrow("resize failed");

      expect(publishDomainEvent).not.toHaveBeenCalled();
      await vi.waitFor(() => {
        expect(invalidateSpy).toHaveBeenCalledWith({
          queryKey: workspaceKeys.nodes.all,
        });
      });
    });
  });

  describe("createGroup", () => {
    it("creates a container node, reparents members, and publishes node.added + node.grouped", async () => {
      vi.mocked(workspaceMutations.createGroup).mockResolvedValue(undefined);

      const result = await nodeCommands.createGroup(
        { queryClient, isGuestMode: false },
        {
          workspaceId: "ws-1",
          group: {
            id: "group-1",
            title: "Sprint Goals",
            position: { x: 100, y: 100 },
            width: 500,
            height: 400,
          },
          members: [
            { id: "node-1", position: { x: 20, y: 40 } },
            { id: "node-2", position: { x: 250, y: 40 } },
          ],
        },
      );

      expect(result.id).toBe("group-1");
      expect(result.kind).toBe("group");
      expect(result.display_config).toEqual({ title: "Sprint Goals" });

      expect(workspaceMutations.createGroup).toHaveBeenCalledWith({
        groupNode: expect.objectContaining({
          id: "group-1",
          kind: "group",
          position_x: 100,
          position_y: 100,
          width: 500,
          height: 400,
        }),
        members: [
          { id: "node-1", position_x: 20, position_y: 40, group_id: "group-1" },
          {
            id: "node-2",
            position_x: 250,
            position_y: 40,
            group_id: "group-1",
          },
        ],
      });

      expect(publishDomainEvent).toHaveBeenCalledWith({
        type: "node.added",
        workspaceId: "ws-1",
        nodeId: "group-1",
      });
      expect(publishDomainEvent).toHaveBeenCalledWith({
        type: "node.grouped",
        workspaceId: "ws-1",
        nodeId: "node-1",
        groupId: "group-1",
      });
      expect(publishDomainEvent).toHaveBeenCalledWith({
        type: "node.grouped",
        workspaceId: "ws-1",
        nodeId: "node-2",
        groupId: "group-1",
      });
    });
  });

  describe("ungroup", () => {
    it("dissolves the container, restores member absolute coordinates, and publishes events", async () => {
      const groupNode = makeNode({
        id: "group-1",
        kind: "group",
        position_x: 100,
        position_y: 100,
      });
      const member1 = makeNode({
        id: "node-1",
        group_id: "group-1",
        position_x: 20,
        position_y: 40,
      });

      queryClient.setQueryData(workspaceKeys.nodes.list("ws-1", false), [
        groupNode,
        member1,
      ]);

      vi.mocked(workspaceMutations.ungroup).mockResolvedValue(undefined);

      await nodeCommands.ungroup(
        { queryClient, isGuestMode: false },
        {
          workspaceId: "ws-1",
          groupId: "group-1",
        },
      );

      expect(workspaceMutations.ungroup).toHaveBeenCalledWith({
        groupId: "group-1",
        members: [
          {
            id: "node-1",
            position_x: 120, // 100 + 20
            position_y: 140, // 100 + 40
          },
        ],
      });

      expect(publishDomainEvent).toHaveBeenCalledWith({
        type: "node.removed",
        workspaceId: "ws-1",
        nodeId: "group-1",
      });
      expect(publishDomainEvent).toHaveBeenCalledWith({
        type: "node.ungrouped",
        workspaceId: "ws-1",
        nodeId: "node-1",
        groupId: "group-1",
      });
    });
  });

  describe("renameGroup", () => {
    it("updates group title in store", async () => {
      vi.mocked(workspaceMutations.updateGroupTitle).mockResolvedValue(
        undefined,
      );

      await nodeCommands.renameGroup(
        { queryClient, isGuestMode: false },
        {
          workspaceId: "ws-1",
          groupId: "group-1",
          title: "New Title",
        },
      );

      expect(workspaceMutations.updateGroupTitle).toHaveBeenCalledWith(
        "group-1",
        "New Title",
      );
    });
  });

  describe("updateDocNode", () => {
    it("updates title and content in cache and calls mutation", async () => {
      const docNode = makeNode({
        id: "doc-1",
        kind: "doc",
        entity_type: null,
        entity_id: null,
        display_config: { title: "Old Title", content: "Old Content" },
      });
      queryClient.setQueryData(workspaceKeys.nodes.list("ws-1", false), [
        docNode,
      ]);
      vi.mocked(workspaceMutations.updateDocNode).mockResolvedValue(undefined);

      await nodeCommands.updateDocNode(
        { queryClient, isGuestMode: false },
        {
          workspaceId: "ws-1",
          nodeId: "doc-1",
          title: "New Title",
          content: "New Content",
        },
      );

      const cached = queryClient.getQueryData<WorkspaceNode[]>(
        workspaceKeys.nodes.list("ws-1", false),
      );
      expect(cached?.[0].display_config).toEqual({
        title: "New Title",
        content: "New Content",
      });
      expect(workspaceMutations.updateDocNode).toHaveBeenCalledWith("doc-1", {
        title: "New Title",
        content: "New Content",
      });
    });

    it("invalidates cache and rethrows on mutation failure", async () => {
      vi.mocked(workspaceMutations.updateDocNode).mockRejectedValue(
        new Error("Network Error"),
      );

      await expect(
        nodeCommands.updateDocNode(
          { queryClient, isGuestMode: false },
          {
            workspaceId: "ws-1",
            nodeId: "doc-1",
            title: "Failed Title",
          },
        ),
      ).rejects.toThrow("Network Error");

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: workspaceKeys.nodes.all,
      });
    });
  });
});
