import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import type { BlueprintPatch } from "@/lib/workspace/blueprint/types";
import { nodeCommands } from "@/lib/commands/node";
import { edgeCommands } from "@/lib/commands/edge";
import { taskCommands } from "@/lib/commands/task";
import { applyWorkspacePatch } from "@/lib/workspace/blueprint/patcher";
import type { WorkspaceNode, WorkspaceEdge } from "@/lib/types/workspace";
import type { Task } from "@/lib/types/task";

vi.mock("@/lib/commands/node", () => ({
  nodeCommands: {
    add: vi.fn(),
    createNode: vi.fn(),
    move: vi.fn(),
    resize: vi.fn(),
    createGroup: vi.fn(),
    ungroup: vi.fn(),
    renameGroup: vi.fn(),
    updateDocNode: vi.fn(),
    updateDecisionNode: vi.fn(),
    updateStepNode: vi.fn(),
    addToGroup: vi.fn(),
    removeFromGroup: vi.fn(),
    remove: vi.fn(),
    deleteNode: vi.fn(),
  },
}));

vi.mock("@/lib/commands/edge", () => ({
  edgeCommands: {
    add: vi.fn(),
    createEdge: vi.fn(),
    remove: vi.fn(),
    deleteEdge: vi.fn(),
  },
}));

vi.mock("@/lib/commands/task", () => ({
  taskCommands: {
    create: vi.fn(),
    createTask: vi.fn(),
    update: vi.fn(),
    toggle: vi.fn(),
    delete: vi.fn(),
  },
}));

describe("Incremental Semantic Patch Engine (patcher.ts)", () => {
  let queryClient: QueryClient;

  // Existing canvas fixture
  const initialGroup: WorkspaceNode = {
    id: "group-1",
    workspace_id: "ws-1",
    user_id: "user-1",
    kind: "group",
    entity_type: null,
    entity_id: null,
    position_x: 100,
    position_y: 100,
    width: 320,
    height: 200,
    group_id: null,
    display_config: { title: "Phase 1" },
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
  };

  const initialMemberDoc: WorkspaceNode = {
    id: "node-doc-1",
    workspace_id: "ws-1",
    user_id: "user-1",
    kind: "doc",
    entity_type: null,
    entity_id: null,
    position_x: 24,
    position_y: 48,
    width: 280,
    height: 120,
    group_id: "group-1",
    display_config: { title: "Original Title", content: "Original Content" },
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
  };

  const initialStandaloneTask: WorkspaceNode = {
    id: "node-task-1",
    workspace_id: "ws-1",
    user_id: "user-1",
    kind: "task",
    entity_type: "task",
    entity_id: "task-1",
    position_x: 500,
    position_y: 100,
    width: 260,
    height: 96,
    group_id: null,
    display_config: null,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
  };

  const initialEdge: WorkspaceEdge = {
    id: "edge-1",
    workspace_id: "ws-1",
    user_id: "user-1",
    source_node_id: "node-doc-1",
    target_node_id: "node-task-1",
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
  };

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    vi.clearAllMocks();

    vi.mocked(nodeCommands.add).mockImplementation(
      async (_ctx, input) =>
        ({
          id: input.id ?? "node-new-created",
          workspace_id: input.workspaceId,
          user_id: "user-1",
          kind: input.kind,
          entity_type: input.entityType,
          entity_id: input.entityId,
          position_x: input.position.x,
          position_y: input.position.y,
          width: input.width ?? null,
          height: input.height ?? null,
          group_id: input.groupId ?? null,
          display_config: input.displayConfig ?? null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }) as WorkspaceNode,
    );

    vi.mocked(edgeCommands.add).mockImplementation(
      async (_ctx, input) =>
        ({
          id: input.id,
          workspace_id: input.workspaceId,
          user_id: "user-1",
          source_node_id: input.sourceNodeId,
          target_node_id: input.targetNodeId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }) as WorkspaceEdge,
    );

    vi.mocked(taskCommands.create).mockImplementation(
      async (_ctx, input) =>
        ({
          id: input._clientId ?? "task-new-1",
          content: input.content,
          project_id: input.project_id ?? null,
          priority: input.priority ?? 4,
          due_date: input.due_date ?? null,
          is_completed: false,
        }) as unknown as Task,
    );

    vi.mocked(nodeCommands.resize).mockResolvedValue(undefined);
    vi.mocked(nodeCommands.updateDocNode).mockResolvedValue(undefined);
    vi.mocked(nodeCommands.remove).mockResolvedValue({} as any);
    vi.mocked(edgeCommands.remove).mockResolvedValue(undefined);
  });

  it("updates doc content without moving its position", async () => {
    const patch: BlueprintPatch = {
      workspaceId: "ws-1",
      updateDocs: [
        {
          nodeId: "node-doc-1",
          title: "Updated Title",
          content: "Updated Content",
        },
      ],
    };

    const result = await applyWorkspacePatch(patch, {
      queryClient,
      nodes: [initialGroup, initialMemberDoc, initialStandaloneTask],
      edges: [initialEdge],
    });

    expect(result.updatedDocNodeIds).toEqual(["node-doc-1"]);
    expect(nodeCommands.updateDocNode).toHaveBeenCalledWith(expect.anything(), {
      workspaceId: "ws-1",
      nodeId: "node-doc-1",
      title: "Updated Title",
      content: "Updated Content",
    });
    expect(nodeCommands.move).not.toHaveBeenCalled();
  });

  it("adds an item to a group, calculating non-overlapping relative position and expanding group bounds if necessary", async () => {
    const patch: BlueprintPatch = {
      workspaceId: "ws-1",
      addItems: [
        {
          targetGroupId: "group-1",
          item: {
            id: "node-task-2",
            kind: "task",
            content: "Second Task in Group",
            priority: 2,
          },
        },
      ],
    };

    const result = await applyWorkspacePatch(patch, {
      queryClient,
      nodes: [initialGroup, initialMemberDoc, initialStandaloneTask],
      edges: [initialEdge],
    });

    expect(result.addedNodes).toHaveLength(1);
    expect(taskCommands.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ content: "Second Task in Group" }),
    );

    // Initial member bottom is y=48 + h=120 = 168.
    // Next item should be placed at rel y = 168 + 40 (CARD_GAP) = 208.
    // New task height is 96. So bottom = 208 + 96 = 304.
    // Group needed height = 304 + 32 (GROUP_PADDING) = 336 > initial height 200.
    // Group resize should be called!
    expect(nodeCommands.resize).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        workspaceId: "ws-1",
        nodeId: "group-1",
        height: 336,
      }),
    );

    // Added node must have group_id and relative coordinate
    expect(nodeCommands.add).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        id: "node-task-2",
        workspaceId: "ws-1",
        kind: "task",
        groupId: "group-1",
        position: { x: 32, y: 208 },
      }),
    );

    // Verify untouched nodes were NEVER moved
    expect(nodeCommands.move).not.toHaveBeenCalled();
  });

  it("adds a standalone item adjacent to existing layout bounding box", async () => {
    const patch: BlueprintPatch = {
      workspaceId: "ws-1",
      addItems: [
        {
          item: {
            id: "node-focus-1",
            kind: "focus",
          },
        },
      ],
    };

    const result = await applyWorkspacePatch(patch, {
      queryClient,
      nodes: [initialGroup, initialMemberDoc, initialStandaloneTask],
      edges: [initialEdge],
    });

    expect(result.addedNodes).toHaveLength(1);

    // Max X of existing root nodes:
    // group-1: x=100, width=320 -> right=420
    // node-task-1: x=500, width=260 -> right=760
    // Max X is 760.
    // New standalone node should be placed at x = 760 + 120 (COLUMN_GAP) = 880.
    expect(nodeCommands.add).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        id: "node-focus-1",
        workspaceId: "ws-1",
        kind: "focus",
        groupId: null,
        position: expect.objectContaining({ x: 880 }),
      }),
    );
  });

  it("deletes nodes and edges cleanly without deleting underlying domain entities", async () => {
    const patch: BlueprintPatch = {
      workspaceId: "ws-1",
      removeNodeIds: ["node-task-1"],
      removeEdgeIds: ["edge-1"],
    };

    const result = await applyWorkspacePatch(patch, {
      queryClient,
      nodes: [initialGroup, initialMemberDoc, initialStandaloneTask],
      edges: [initialEdge],
    });

    expect(result.removedNodeIds).toEqual(["node-task-1"]);
    expect(result.removedEdgeIds).toEqual(["edge-1"]);

    expect(nodeCommands.remove).toHaveBeenCalledWith(expect.anything(), {
      id: "node-task-1",
      workspace_id: "ws-1",
    });

    expect(edgeCommands.remove).toHaveBeenCalledWith(expect.anything(), {
      id: "edge-1",
      workspace_id: "ws-1",
    });

    // Verify domain entity was not deleted (taskCommands.delete should NOT be called)
    expect(taskCommands.delete).not.toHaveBeenCalled();
  });

  it("adds new flows between existing and newly added nodes", async () => {
    const patch: BlueprintPatch = {
      workspaceId: "ws-1",
      addItems: [
        {
          targetGroupId: "group-1",
          item: {
            id: "node-task-new",
            kind: "task",
            content: "Another task",
          },
        },
      ],
      addFlows: [
        {
          fromItemId: "node-doc-1",
          toItemId: "node-task-new",
        },
      ],
    };

    const result = await applyWorkspacePatch(patch, {
      queryClient,
      nodes: [initialGroup, initialMemberDoc, initialStandaloneTask],
      edges: [initialEdge],
    });

    expect(result.addedEdges).toHaveLength(1);
    expect(edgeCommands.add).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        workspaceId: "ws-1",
        sourceNodeId: "node-doc-1",
        targetNodeId: "node-task-new",
      }),
    );
  });

  it("throws descriptive error and makes no changes if invalid IDs are referenced", async () => {
    const invalidPatch: BlueprintPatch = {
      workspaceId: "ws-1",
      updateDocs: [
        {
          nodeId: "non-existent-doc-id",
          title: "Will Fail",
        },
      ],
    };

    await expect(
      applyWorkspacePatch(invalidPatch, {
        queryClient,
        nodes: [initialGroup, initialMemberDoc, initialStandaloneTask],
        edges: [initialEdge],
      }),
    ).rejects.toThrow(/not found/i);

    expect(nodeCommands.updateDocNode).not.toHaveBeenCalled();
    expect(nodeCommands.add).not.toHaveBeenCalled();
    expect(nodeCommands.remove).not.toHaveBeenCalled();
  });

  it("adds Decision, Step nodes and labeled flows via patch", async () => {
    const patch: BlueprintPatch = {
      workspaceId: "ws-1",
      addItems: [
        {
          item: {
            id: "dec-gate",
            kind: "decision",
            question: "Is KYC completed?",
            description: "Check compliance DB",
          },
        },
        {
          item: {
            id: "step-approve",
            kind: "step",
            title: "Issue Virtual Card",
          },
        },
      ],
      addFlows: [
        {
          fromItemId: "dec-gate",
          toItemId: "step-approve",
          label: "Verified",
          fromPort: "out",
        },
      ],
    };

    const result = await applyWorkspacePatch(patch, {
      queryClient,
      nodes: [initialGroup, initialMemberDoc, initialStandaloneTask],
      edges: [initialEdge],
    });

    expect(result.addedNodes).toHaveLength(2);
    expect(result.addedEdges).toHaveLength(1);

    expect(nodeCommands.add).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        id: "dec-gate",
        kind: "decision",
        width: 240,
        height: 120,
        displayConfig: {
          question: "Is KYC completed?",
          description: "Check compliance DB",
        },
      }),
    );

    expect(nodeCommands.add).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        id: "step-approve",
        kind: "step",
        width: 280,
        height: 88,
        displayConfig: {
          title: "Issue Virtual Card",
          description: "",
        },
      }),
    );

    expect(edgeCommands.add).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        sourceNodeId: "dec-gate",
        targetNodeId: "step-approve",
        label: "Verified",
        source_handle: "out",
      }),
    );
  });

  it("updates existing decision and step nodes in place", async () => {
    const existingDecision: WorkspaceNode = {
      id: "node-dec-1",
      workspace_id: "ws-1",
      user_id: "user-1",
      kind: "decision",
      entity_type: null,
      entity_id: null,
      position_x: 200,
      position_y: 200,
      width: 160,
      height: 80,
      group_id: null,
      display_config: { question: "Old Question?", description: "Old Desc" },
      created_at: "2026-09-01T00:00:00Z",
      updated_at: "2026-09-01T00:00:00Z",
    };

    const existingStep: WorkspaceNode = {
      id: "node-step-1",
      workspace_id: "ws-1",
      user_id: "user-1",
      kind: "step",
      entity_type: null,
      entity_id: null,
      position_x: 400,
      position_y: 200,
      width: 240,
      height: 80,
      group_id: null,
      display_config: { title: "Old Step Title", description: "Old Desc" },
      created_at: "2026-09-01T00:00:00Z",
      updated_at: "2026-09-01T00:00:00Z",
    };

    const patch: BlueprintPatch = {
      workspaceId: "ws-1",
      updateDecisions: [
        {
          nodeId: "node-dec-1",
          question: "New KYC Question?",
          description: "New KYC Rule",
        },
      ],
      updateSteps: [
        {
          nodeId: "node-step-1",
          title: "New Automated Step",
          description: "Run automated script",
        },
      ],
    };

    const result = await applyWorkspacePatch(patch, {
      nodes: [existingDecision, existingStep],
      edges: [],
    });

    expect(nodeCommands.updateDecisionNode).toHaveBeenCalledWith(
      expect.anything(),
      {
        workspaceId: "ws-1",
        nodeId: "node-dec-1",
        question: "New KYC Question?",
        description: "New KYC Rule",
      },
    );

    expect(nodeCommands.updateStepNode).toHaveBeenCalledWith(
      expect.anything(),
      {
        workspaceId: "ws-1",
        nodeId: "node-step-1",
        title: "New Automated Step",
        description: "Run automated script",
      },
    );

    expect(result.updatedDecisionNodeIds).toEqual(["node-dec-1"]);
    expect(result.updatedStepNodeIds).toEqual(["node-step-1"]);
  });
});
