import { describe, it, expect, vi, beforeEach } from "vitest";

const idbBacking = new Map<string, unknown>();

vi.mock("idb-keyval", () => ({
  get: vi.fn(async (key: string) => idbBacking.get(key)),
  set: vi.fn(async (key: string, value: unknown) => {
    idbBacking.set(key, value);
  }),
  del: vi.fn(async (key: string) => {
    idbBacking.delete(key);
  }),
}));

const mockGetSession = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession: mockGetSession,
    },
    from: mockFrom,
  }),
}));

import { workspaceMutations } from "@/lib/mutations/workspace";
import { guestWorkspaceStore } from "@/lib/workspace/guest-store";

describe("workspaceMutations idempotency & duplicate key recovery", () => {
  beforeEach(() => {
    localStorage.removeItem("kanso_guest_mode");
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: "user-123" } } },
    });
  });

  describe("addEdge", () => {
    it("uses upsert when an explicit UUID id is provided", async () => {
      const edgeId = "550e8400-e29b-41d4-a716-446655440000";
      const mockSelect = vi.fn();
      const mockSingle = vi.fn().mockResolvedValue({
        data: {
          id: edgeId,
          workspace_id: "ws-1",
          source_node_id: "node-1",
          target_node_id: "node-2",
        },
        error: null,
      });
      const mockUpsert = vi.fn().mockReturnValue({ select: mockSelect });
      mockSelect.mockReturnValue({ single: mockSingle });

      mockFrom.mockReturnValue({
        upsert: mockUpsert,
      });

      const result = await workspaceMutations.addEdge({
        id: edgeId,
        workspaceId: "ws-1",
        sourceNodeId: "node-1",
        targetNodeId: "node-2",
      });

      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({ id: edgeId }),
        { onConflict: "id" },
      );
      expect(result.id).toBe(edgeId);
    });

    it("recovers from duplicate key error 23505 by querying existing edge", async () => {
      const edgeId = "550e8400-e29b-41d4-a716-446655440000";
      const existingEdge = {
        id: edgeId,
        workspace_id: "ws-1",
        source_node_id: "node-1",
        target_node_id: "node-2",
      };

      const mockSelect = vi.fn();
      const mockSingle = vi.fn().mockResolvedValue({
        data: null,
        error: {
          code: "23505",
          message:
            'duplicate key value violates unique constraint "workspace_edges_pkey"',
        },
      });
      const mockUpsert = vi.fn().mockReturnValue({ select: mockSelect });
      mockSelect.mockReturnValue({ single: mockSingle });

      // Fallback query chain: .select("*").eq("id", edgeId).maybeSingle()
      const mockFallbackEq = vi.fn();
      const mockFallbackMaybeSingle = vi.fn().mockResolvedValue({
        data: existingEdge,
        error: null,
      });
      mockFallbackEq.mockReturnValue({ maybeSingle: mockFallbackMaybeSingle });
      const mockFallbackSelect = vi
        .fn()
        .mockReturnValue({ eq: mockFallbackEq });

      let callCount = 0;
      mockFrom.mockImplementation((table: string) => {
        expect(table).toBe("workspace_edges");
        callCount++;
        if (callCount === 1) {
          return { upsert: mockUpsert };
        }
        return { select: mockFallbackSelect };
      });

      const result = await workspaceMutations.addEdge({
        id: edgeId,
        workspaceId: "ws-1",
        sourceNodeId: "node-1",
        targetNodeId: "node-2",
      });

      expect(result).toEqual(existingEdge);
      expect(mockFallbackEq).toHaveBeenCalledWith("id", edgeId);
    });
  });

  describe("addNode", () => {
    it("uses upsert when an explicit UUID id is provided", async () => {
      const nodeId = "550e8400-e29b-41d4-a716-446655440001";
      const mockSelect = vi.fn();
      const mockSingle = vi.fn().mockResolvedValue({
        data: {
          id: nodeId,
          workspace_id: "ws-1",
          kind: "doc",
        },
        error: null,
      });
      const mockUpsert = vi.fn().mockReturnValue({ select: mockSelect });
      mockSelect.mockReturnValue({ single: mockSingle });

      mockFrom.mockReturnValue({
        upsert: mockUpsert,
      });

      const result = await workspaceMutations.addNode({
        id: nodeId,
        workspaceId: "ws-1",
        kind: "doc",
        entityType: null,
        entityId: null,
        positionX: 100,
        positionY: 200,
        width: 300,
        height: 200,
        displayConfig: null,
      });

      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({ id: nodeId }),
        { onConflict: "id" },
      );
      expect(result.id).toBe(nodeId);
    });

    it("recovers from duplicate key error 23505 by querying existing node", async () => {
      const nodeId = "550e8400-e29b-41d4-a716-446655440001";
      const existingNode = {
        id: nodeId,
        workspace_id: "ws-1",
        kind: "doc",
      };

      const mockSelect = vi.fn();
      const mockSingle = vi.fn().mockResolvedValue({
        data: null,
        error: {
          code: "23505",
          message:
            'duplicate key value violates unique constraint "workspace_nodes_pkey"',
        },
      });
      const mockUpsert = vi.fn().mockReturnValue({ select: mockSelect });
      mockSelect.mockReturnValue({ single: mockSingle });

      // Fallback query chain
      const mockFallbackEq = vi.fn();
      const mockFallbackMaybeSingle = vi.fn().mockResolvedValue({
        data: existingNode,
        error: null,
      });
      mockFallbackEq.mockReturnValue({ maybeSingle: mockFallbackMaybeSingle });
      const mockFallbackSelect = vi
        .fn()
        .mockReturnValue({ eq: mockFallbackEq });

      let callCount = 0;
      mockFrom.mockImplementation((table: string) => {
        expect(table).toBe("workspace_nodes");
        callCount++;
        if (callCount === 1) {
          return { upsert: mockUpsert };
        }
        return { select: mockFallbackSelect };
      });

      const result = await workspaceMutations.addNode({
        id: nodeId,
        workspaceId: "ws-1",
        kind: "doc",
        entityType: null,
        entityId: null,
        positionX: 100,
        positionY: 200,
        width: 300,
        height: 200,
        displayConfig: null,
      });

      expect(result).toEqual(existingNode);
      expect(mockFallbackEq).toHaveBeenCalledWith("id", nodeId);
    });
  });

  describe("guestWorkspaceStore idempotency", () => {
    beforeEach(() => {
      localStorage.setItem("kanso_guest_mode", "true");
    });

    it("updates existing node instead of creating a duplicate when id matches", async () => {
      const nodeId = "guest-node-1";
      const first = await guestWorkspaceStore.addNode({
        id: nodeId,
        workspaceId: "ws-guest",
        kind: "doc",
        entityType: null,
        entityId: null,
        positionX: 50,
        positionY: 50,
        width: 200,
        height: 100,
        displayConfig: { title: "Initial" },
      });

      expect(first.id).toBe(nodeId);

      const second = await guestWorkspaceStore.addNode({
        id: nodeId,
        workspaceId: "ws-guest",
        kind: "doc",
        entityType: null,
        entityId: null,
        positionX: 150,
        positionY: 250,
        width: 250,
        height: 150,
        displayConfig: { title: "Updated" },
      });

      expect(second.id).toBe(nodeId);
      expect(second.position_x).toBe(150);

      const allNodes = await guestWorkspaceStore.listNodes("ws-guest");
      const matchingNodes = allNodes.filter((n) => n.id === nodeId);
      expect(matchingNodes.length).toBe(1);
    });
  });
});
