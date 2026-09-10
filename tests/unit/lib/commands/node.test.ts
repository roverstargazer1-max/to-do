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
  });
});
