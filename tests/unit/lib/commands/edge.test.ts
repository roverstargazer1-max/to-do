import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import type { QueryClient as QueryClientType } from "@tanstack/react-query";
import type { WorkspaceEdge } from "@/lib/types/workspace";
import { workspaceKeys } from "@/lib/queries/workspace-keys";

/**
 * The edge Domain Commands (ADR 0021). Like the node commands' suite, the
 * mutation service is mocked: these tests pin the commands' own policy —
 * what gets written, which family is invalidated, which fact is published —
 * not the service's guest/cloud plumbing.
 *
 * The one behaviour unique to edges is the failure policy of `add`: the
 * canvas has already drawn the connection optimistically, so a refused
 * write has to invalidate *before* it rethrows, or the line would stand
 * for a relationship the database rejected.
 */

vi.mock("@/lib/mutations/workspace", () => ({
  workspaceMutations: {
    list: vi.fn(),
    create: vi.fn(),
    rename: vi.fn(),
    delete: vi.fn(),
    listNodes: vi.fn(),
    addNode: vi.fn(),
    listEdges: vi.fn(),
    addEdge: vi.fn(),
    updateEdge: vi.fn(),
    removeEdge: vi.fn(),
    updateNodePosition: vi.fn(),
    removeNode: vi.fn(),
  },
}));

const publishDomainEvent = vi.fn();
vi.mock("@/lib/events/domain-bus", () => ({
  publishDomainEvent: (...args: unknown[]) => publishDomainEvent(...args),
}));

import { workspaceMutations } from "@/lib/mutations/workspace";
import { edgeCommands } from "@/lib/commands/edge";

const makeEdge = (overrides: Partial<WorkspaceEdge> = {}): WorkspaceEdge => ({
  id: "edge-1",
  workspace_id: "ws-1",
  user_id: "user-1",
  source_node_id: "node-a",
  target_node_id: "node-b",
  created_at: "2026-09-10T00:00:00.000Z",
  updated_at: "2026-09-10T00:00:00.000Z",
  ...overrides,
});

describe("edgeCommands", () => {
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
    vi.mocked(workspaceMutations.addEdge).mockReset();
    vi.mocked(workspaceMutations.updateEdge).mockReset();
    vi.mocked(workspaceMutations.removeEdge).mockReset();
  });

  describe("add", () => {
    it("writes the caller's id, invalidates the edges family, and publishes edge.added", async () => {
      const edge = makeEdge();
      vi.mocked(workspaceMutations.addEdge).mockResolvedValue(edge);

      const result = await edgeCommands.add(
        { queryClient, isGuestMode: false },
        {
          id: "edge-1",
          workspaceId: "ws-1",
          sourceNodeId: "node-a",
          targetNodeId: "node-b",
        },
      );

      expect(result).toEqual(edge);
      // The id is the canvas's, not the command's: the drawn line and the
      // written row have to be the same edge or the line remounts.
      expect(workspaceMutations.addEdge).toHaveBeenCalledWith({
        id: "edge-1",
        workspaceId: "ws-1",
        sourceNodeId: "node-a",
        targetNodeId: "node-b",
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: workspaceKeys.edges.all,
      });
      expect(publishDomainEvent).toHaveBeenCalledWith({
        type: "edge.added",
        workspaceId: "ws-1",
        edgeId: "edge-1",
      });
    });

    it("publishes nothing on failure — and invalidates first, so the optimistically drawn line cannot stand", async () => {
      vi.mocked(workspaceMutations.addEdge).mockRejectedValue(
        new Error("duplicate key value violates unique constraint"),
      );

      await expect(
        edgeCommands.add(
          { queryClient, isGuestMode: false },
          {
            id: "edge-1",
            workspaceId: "ws-1",
            sourceNodeId: "node-a",
            targetNodeId: "node-b",
          },
        ),
      ).rejects.toThrow("duplicate key value violates unique constraint");

      expect(publishDomainEvent).not.toHaveBeenCalled();
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: workspaceKeys.edges.all,
      });
    });
  });

  describe("remove", () => {
    it("cuts the connection, invalidates the edges family, and publishes edge.removed", async () => {
      vi.mocked(workspaceMutations.removeEdge).mockResolvedValue(undefined);

      await edgeCommands.remove(
        { queryClient, isGuestMode: true },
        { id: "edge-1", workspace_id: "ws-1" },
      );

      expect(workspaceMutations.removeEdge).toHaveBeenCalledWith("edge-1");
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: workspaceKeys.edges.all,
      });
      expect(publishDomainEvent).toHaveBeenCalledWith({
        type: "edge.removed",
        workspaceId: "ws-1",
        edgeId: "edge-1",
      });
    });

    it("publishes nothing on failure — a cut that did not land is not a fact", async () => {
      vi.mocked(workspaceMutations.removeEdge).mockRejectedValue(
        new Error("network error"),
      );

      await expect(
        edgeCommands.remove(
          { queryClient, isGuestMode: false },
          { id: "edge-1", workspace_id: "ws-1" },
        ),
      ).rejects.toThrow("network error");

      expect(publishDomainEvent).not.toHaveBeenCalled();
    });
  });

  describe("update", () => {
    it("updates edge label, invalidates edges family, and publishes edge.updated", async () => {
      const updatedEdge = makeEdge({ label: "Yes" });
      vi.mocked(workspaceMutations.updateEdge).mockResolvedValue(updatedEdge);

      const result = await edgeCommands.update(
        { queryClient, isGuestMode: false },
        { id: "edge-1", workspaceId: "ws-1", label: "Yes" },
      );

      expect(result).toEqual(updatedEdge);
      expect(workspaceMutations.updateEdge).toHaveBeenCalledWith({
        id: "edge-1",
        workspaceId: "ws-1",
        label: "Yes",
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: workspaceKeys.edges.all,
      });
      expect(publishDomainEvent).toHaveBeenCalledWith({
        type: "edge.updated",
        workspaceId: "ws-1",
        edgeId: "edge-1",
      });
    });

    it("publishes nothing on failure and invalidates caches", async () => {
      vi.mocked(workspaceMutations.updateEdge).mockRejectedValue(
        new Error("db update failed"),
      );

      await expect(
        edgeCommands.update(
          { queryClient, isGuestMode: false },
          { id: "edge-1", workspaceId: "ws-1", label: "No" },
        ),
      ).rejects.toThrow("db update failed");

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: workspaceKeys.edges.all,
      });
      expect(publishDomainEvent).not.toHaveBeenCalled();
    });
  });
});
