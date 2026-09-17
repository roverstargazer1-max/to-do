import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import type { QueryClient as QueryClientType } from "@tanstack/react-query";
import type { WorkspaceNode, WorkspaceEdge } from "@/lib/types/workspace";
import { workspaceKeys } from "@/lib/queries/workspace-keys";
import { useWorkspaceUndoStore } from "@/lib/store/workspaceUndoStore";

vi.mock("@/lib/mutations/workspace", () => ({
  workspaceMutations: {
    addNode: vi.fn(),
    removeNode: vi.fn(),
    addEdge: vi.fn(),
    updateNodeGroup: vi.fn(),
  },
}));

const publishDomainEvent = vi.fn();
vi.mock("@/lib/events/domain-bus", () => ({
  publishDomainEvent: (...args: unknown[]) => publishDomainEvent(...args),
}));

const notifyMock = vi.fn();
(notifyMock as unknown as { error: typeof vi.fn }).error = vi.fn();
(notifyMock as unknown as { success: typeof vi.fn }).success = vi.fn();
vi.mock("@/lib/notify", () => ({
  notify: (...args: unknown[]) => notifyMock(...args),
}));

import { workspaceMutations } from "@/lib/mutations/workspace";
import { nodeCommands } from "@/lib/commands/node";

const makeNode = (id: string, kind = "doc"): WorkspaceNode => ({
  id,
  workspace_id: "ws-1",
  user_id: "user-1",
  kind,
  entity_type: null,
  entity_id: null,
  position_x: 100,
  position_y: 200,
  width: 320,
  height: 240,
  group_id: null,
  display_config: { title: "Test Doc", content: "# Markdown notes" },
  created_at: "2026-09-09T00:00:00.000Z",
  updated_at: "2026-09-09T00:00:00.000Z",
});

const makeEdge = (
  id: string,
  source: string,
  target: string,
): WorkspaceEdge => ({
  id,
  workspace_id: "ws-1",
  user_id: "user-1",
  source_node_id: source,
  target_node_id: target,
  label: "connects to",
  source_handle: "out",
  target_handle: "in",
  created_at: "2026-09-09T00:00:00.000Z",
  updated_at: "2026-09-09T00:00:00.000Z",
});

describe("nodeCommands deletion and restoration (Undo/Redo)", () => {
  let queryClient: QueryClientType;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    publishDomainEvent.mockClear();
    notifyMock.mockClear();
    useWorkspaceUndoStore.setState({ undoStacks: {}, redoStacks: {} });

    vi.mocked(workspaceMutations.addNode).mockReset();
    vi.mocked(workspaceMutations.removeNode).mockReset();
    vi.mocked(workspaceMutations.addEdge).mockReset();
    vi.mocked(workspaceMutations.updateNodeGroup).mockReset();
  });

  it("captures node snapshot and incident edges on remove and registers with undoStore", async () => {
    const node1 = makeNode("node-1");
    const node2 = makeNode("node-2");
    const edge1 = makeEdge("edge-1", "node-1", "node-2");

    queryClient.setQueryData(workspaceKeys.nodes.list("ws-1", false), [
      node1,
      node2,
    ]);
    queryClient.setQueryData(workspaceKeys.edges.list("ws-1", false), [edge1]);

    vi.mocked(workspaceMutations.removeNode).mockResolvedValue(undefined);

    const snapshot = await nodeCommands.remove(
      { queryClient, isGuestMode: false },
      { id: "node-1", workspace_id: "ws-1" },
    );

    expect(snapshot.node).toEqual(node1);
    expect(snapshot.connectedEdges).toEqual([edge1]);
    expect(workspaceMutations.removeNode).toHaveBeenCalledWith("node-1");

    // Check that undo stack in store received the action
    expect(useWorkspaceUndoStore.getState().canUndo("ws-1")).toBe(true);
    expect(notifyMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: expect.objectContaining({
          label: expect.anything(),
          onClick: expect.any(Function),
        }),
      }),
    );
  });

  it("restores node, display_config content, and incident edges when restoreNode is called", async () => {
    const node1 = makeNode("node-1");
    const edge1 = makeEdge("edge-1", "node-1", "node-2");

    vi.mocked(workspaceMutations.addNode).mockResolvedValue(node1);
    vi.mocked(workspaceMutations.addEdge).mockResolvedValue(edge1);

    await nodeCommands.restoreNode(
      { queryClient, isGuestMode: false },
      {
        node: node1,
        connectedEdges: [edge1],
      },
    );

    // Verify node was reinserted with full payload
    expect(workspaceMutations.addNode).toHaveBeenCalledWith({
      id: "node-1",
      workspaceId: "ws-1",
      kind: "doc",
      entityType: null,
      entityId: null,
      positionX: 100,
      positionY: 200,
      width: 320,
      height: 240,
      groupId: null,
      displayConfig: { title: "Test Doc", content: "# Markdown notes" },
    });

    // Verify connected edge was reinserted
    expect(workspaceMutations.addEdge).toHaveBeenCalledWith({
      id: "edge-1",
      workspaceId: "ws-1",
      sourceNodeId: "node-1",
      targetNodeId: "node-2",
      label: "connects to",
      sourceHandle: "out",
      targetHandle: "in",
    });

    expect(publishDomainEvent).toHaveBeenCalledWith({
      type: "node.added",
      workspaceId: "ws-1",
      nodeId: "node-1",
    });
    expect(publishDomainEvent).toHaveBeenCalledWith({
      type: "edge.added",
      workspaceId: "ws-1",
      edgeId: "edge-1",
    });
  });

  it("restores dissolved group and preserves member relative coordinates", async () => {
    const groupNode = makeNode("group-1", "group");
    groupNode.display_config = { title: "My Group" };
    const memberNode = makeNode("node-1");
    memberNode.group_id = "group-1";

    vi.mocked(workspaceMutations.addNode).mockResolvedValue(memberNode);
    vi.mocked(workspaceMutations.updateNodeGroup).mockResolvedValue(undefined);

    await nodeCommands.restoreNode(
      { queryClient, isGuestMode: false },
      {
        node: memberNode,
        connectedEdges: [],
        dissolvedGroup: groupNode,
      },
    );

    // Group restored first
    expect(workspaceMutations.addNode).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ id: "group-1", kind: "group" }),
    );
    // Member restored second
    expect(workspaceMutations.addNode).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ id: "node-1", groupId: "group-1" }),
    );
  });

  it("batch removes and restores multiple nodes in an atomic undo step", async () => {
    const nodeA = makeNode("node-a");
    const nodeB = makeNode("node-b");
    queryClient.setQueryData(workspaceKeys.nodes.list("ws-1", false), [
      nodeA,
      nodeB,
    ]);
    queryClient.setQueryData(workspaceKeys.edges.list("ws-1", false), []);

    vi.mocked(workspaceMutations.removeNode).mockResolvedValue(undefined);
    vi.mocked(workspaceMutations.addNode).mockResolvedValue(nodeA);

    const batchSnapshot = await nodeCommands.removeBatch(
      { queryClient, isGuestMode: false },
      "ws-1",
      [
        { id: "node-a", workspace_id: "ws-1" },
        { id: "node-b", workspace_id: "ws-1" },
      ],
    );

    expect(batchSnapshot.snapshots.length).toBe(2);
    expect(workspaceMutations.removeNode).toHaveBeenCalledTimes(2);
    expect(useWorkspaceUndoStore.getState().canUndo("ws-1")).toBe(true);

    // Trigger undo
    await useWorkspaceUndoStore.getState().undo("ws-1");

    expect(workspaceMutations.addNode).toHaveBeenCalledTimes(2);
    expect(useWorkspaceUndoStore.getState().canRedo("ws-1")).toBe(true);
  });

  it("de-duplicates shared edges when restoring a batch of interconnected nodes", async () => {
    const nodeA = makeNode("node-a");
    const nodeB = makeNode("node-b");
    const sharedEdge = makeEdge("edge-ab", "node-a", "node-b");

    vi.mocked(workspaceMutations.addNode).mockResolvedValue(nodeA);
    vi.mocked(workspaceMutations.addEdge).mockResolvedValue(sharedEdge);

    const callOrder: string[] = [];
    vi.mocked(workspaceMutations.addNode).mockImplementation(async (input) => {
      callOrder.push(`node:${input.id}`);
      return makeNode(input.id);
    });
    vi.mocked(workspaceMutations.addEdge).mockImplementation(async (input) => {
      callOrder.push(`edge:${input.id}`);
      return sharedEdge;
    });

    await nodeCommands.restoreBatch(
      { queryClient, isGuestMode: false },
      {
        snapshots: [
          { node: nodeA, connectedEdges: [sharedEdge] },
          { node: nodeB, connectedEdges: [sharedEdge] },
        ],
      },
    );

    // Both nodes restored before the edge
    expect(callOrder).toEqual(["node:node-b", "node:node-a", "edge:edge-ab"]);
    // Edge should only be re-added once even though it appeared in both snapshots
    expect(workspaceMutations.addEdge).toHaveBeenCalledTimes(1);
    expect(workspaceMutations.addEdge).toHaveBeenCalledWith(
      expect.objectContaining({ id: "edge-ab" }),
    );
  });
});
