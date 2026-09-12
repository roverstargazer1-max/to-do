import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { WorkspaceNode } from "@/lib/types/workspace";
import { workspaceKeys } from "@/lib/queries/workspace-keys";

type FlowNode = {
  id: string;
  type?: string;
  position: { x: number; y: number };
  parentId?: string;
  style?: Record<string, unknown>;
  data?: Record<string, unknown>;
  [key: string]: unknown;
};

type DragHandler = (event: unknown, node: FlowNode, nodes: FlowNode[]) => void;

const testDragState = {
  activeNode: null as FlowNode | null,
  movedNodes: [] as FlowNode[],
  onNodeDrag: null as DragHandler | null | undefined,
  onNodeDragStop: null as DragHandler | null | undefined,
  lastRenderedNodes: [] as FlowNode[],
};

vi.mock("@xyflow/react", async () => {
  const React = await import("react");
  const { useState, useCallback } = React;
  return {
    useNodesState: (initial: FlowNode[]) => {
      const [nodes, setNodes] = useState(initial);
      const onNodesChange = useCallback(() => {}, []);
      return [nodes, setNodes, onNodesChange];
    },
    ReactFlow: ({
      nodes,
      onNodeDrag,
      onNodeDragStop,
      children,
    }: {
      nodes: FlowNode[];
      onNodeDrag?: DragHandler;
      onNodeDragStop?: DragHandler;
      children?: React.ReactNode;
    }) => {
      testDragState.lastRenderedNodes = nodes;
      testDragState.onNodeDrag = onNodeDrag;
      testDragState.onNodeDragStop = onNodeDragStop;
      return (
        <div data-testid="react-flow-dnd-canvas">
          <button
            type="button"
            data-testid="btn-trigger-drag"
            onClick={() => {
              if (testDragState.activeNode) {
                onNodeDrag?.(
                  null,
                  testDragState.activeNode,
                  testDragState.movedNodes,
                );
              }
            }}
          />
          <button
            type="button"
            data-testid="btn-trigger-drag-stop"
            onClick={() => {
              if (testDragState.activeNode) {
                onNodeDragStop?.(
                  null,
                  testDragState.activeNode,
                  testDragState.movedNodes,
                );
              }
            }}
          />
          {children}
        </div>
      );
    },
    Background: () => null,
    BackgroundVariant: { Dots: "dots", Lines: "lines", Cross: "cross" },
    Controls: () => null,
    Handle: () => null,
    Position: { Left: "left", Right: "right", Top: "top", Bottom: "bottom" },
    useNodeId: () => null,
    useStore: () => false,
  };
});

vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => ({ isGuestMode: true }),
}));

const mockAddToGroup = vi.fn(async () => {});
const mockRemoveFromGroup = vi.fn(async () => {});

vi.mock("@/lib/commands/node", () => ({
  nodeCommands: {
    add: vi.fn(),
    move: vi.fn(),
    remove: vi.fn(),
    resize: vi.fn(),
    createGroup: vi.fn(),
    ungroup: vi.fn(),
    renameGroup: vi.fn(),
    addToGroup: (...args: unknown[]) =>
      (mockAddToGroup as unknown as (...a: unknown[]) => unknown)(...args),
    removeFromGroup: (...args: unknown[]) =>
      (mockRemoveFromGroup as unknown as (...a: unknown[]) => unknown)(...args),
  },
}));

const mockQueueSizeWrite = vi.fn();
const mockQueuePositionWrite = vi.fn();

vi.mock("@/components/workspace/useNodeSizeWrites", () => ({
  useNodeSizeWrites: () => ({ queueSizeWrite: mockQueueSizeWrite }),
}));

vi.mock("@/components/workspace/useNodePositionWrites", () => ({
  useNodePositionWrites: () => ({ queuePositionWrite: mockQueuePositionWrite }),
}));

vi.mock("@/lib/notify", () => ({
  notify: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
    promise: vi.fn(),
  }),
}));

import { WorkspaceCanvas } from "@/components/workspace/WorkspaceCanvas";

const makeGroupRow = (
  overrides: Partial<WorkspaceNode> = {},
): WorkspaceNode => ({
  id: "group-1",
  workspace_id: "ws-1",
  user_id: "guest",
  kind: "group",
  entity_type: null,
  entity_id: null,
  position_x: 100,
  position_y: 100,
  width: 400,
  height: 300,
  group_id: null,
  display_config: { title: "Sprint Goals" },
  created_at: "2026-09-11T00:00:00.000Z",
  updated_at: "2026-09-11T00:00:00.000Z",
  ...overrides,
});

const makeTaskRow = (
  overrides: Partial<WorkspaceNode> = {},
): WorkspaceNode => ({
  id: "task-1",
  workspace_id: "ws-1",
  user_id: "guest",
  kind: "task",
  entity_type: "task",
  entity_id: "t-1",
  position_x: 30,
  position_y: 40,
  width: 260,
  height: 80,
  group_id: null,
  display_config: null,
  created_at: "2026-09-11T00:00:00.000Z",
  updated_at: "2026-09-11T00:00:00.000Z",
  ...overrides,
});

function renderCanvas(initialNodes: WorkspaceNode[]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  queryClient.setQueryData(
    workspaceKeys.nodes.list("ws-1", true),
    initialNodes,
  );
  queryClient.setQueryData(workspaceKeys.edges.list("ws-1", true), []);

  const result = render(
    <QueryClientProvider client={queryClient}>
      <WorkspaceCanvas workspaceId="ws-1" />
    </QueryClientProvider>,
  );
  return { queryClient, ...result };
}

describe("WorkspaceCanvas Grouping Drag and Drop (DnD)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testDragState.activeNode = null;
    testDragState.movedNodes = [];
    testDragState.lastRenderedNodes = [];
  });

  it("detaches card from group when dragged outside group bounds", async () => {
    const group = makeGroupRow({
      id: "group-1",
      position_x: 100,
      position_y: 100,
      width: 400,
      height: 300,
    });
    const member = makeTaskRow({
      id: "task-1",
      group_id: "group-1",
      position_x: 30,
      position_y: 40,
    });

    renderCanvas([group, member]);

    // Card dragged far outside the group (e.g. relative pos 800, 800 -> abs pos 900, 900)
    testDragState.activeNode = {
      id: "task-1",
      parentId: "group-1",
      position: { x: 800, y: 800 },
      measured: { width: 260, height: 80 },
      data: { row: member },
    };
    testDragState.movedNodes = [testDragState.activeNode];

    const stopBtn = screen.getByTestId("btn-trigger-drag-stop");
    fireEvent.click(stopBtn);

    await waitFor(() => {
      expect(mockRemoveFromGroup).toHaveBeenCalledWith(
        expect.objectContaining({ isGuestMode: true }),
        {
          workspaceId: "ws-1",
          nodeId: "task-1",
          position: { x: 900, y: 900 }, // Parent (100) + relative (800)
        },
      );
    });
  });

  it("attaches root card into group when card center point is dragged into group", async () => {
    const group = makeGroupRow({
      id: "group-1",
      position_x: 100,
      position_y: 100,
      width: 400,
      height: 300,
    });
    const rootTask = makeTaskRow({
      id: "task-1",
      group_id: null,
      position_x: 600,
      position_y: 600,
    });

    renderCanvas([group, rootTask]);

    // Drag card to canvas position (150, 150), so center is at (150 + 130, 150 + 40) = (280, 190), inside group (100-500, 100-400)
    testDragState.activeNode = {
      id: "task-1",
      parentId: undefined,
      position: { x: 150, y: 150 },
      measured: { width: 260, height: 80 },
      data: { row: rootTask },
    };
    testDragState.movedNodes = [testDragState.activeNode];

    // Verify hover highlight
    const dragBtn = screen.getByTestId("btn-trigger-drag");
    fireEvent.click(dragBtn);

    // Group should receive isDropTarget: true in displayNodes
    const targetNode = testDragState.lastRenderedNodes.find(
      (n) => n.id === "group-1",
    );
    expect(targetNode?.data?.isDropTarget).toBe(true);

    // Trigger drag stop
    const stopBtn = screen.getByTestId("btn-trigger-drag-stop");
    fireEvent.click(stopBtn);

    await waitFor(() => {
      expect(mockAddToGroup).toHaveBeenCalledWith(
        expect.objectContaining({ isGuestMode: true }),
        {
          workspaceId: "ws-1",
          nodeId: "task-1",
          groupId: "group-1",
          position: { x: 50, y: 50 }, // abs (150) - group (100)
        },
      );
    });
  });

  it("auto-expands group container when member card moves near or past group edge", async () => {
    const group = makeGroupRow({
      id: "group-1",
      position_x: 100,
      position_y: 100,
      width: 400,
      height: 300,
    });
    const member = makeTaskRow({
      id: "task-1",
      group_id: "group-1",
      position_x: 30,
      position_y: 40,
    });

    renderCanvas([group, member]);

    // Move card within group to relative pos (200, 200) with width 260, height 80
    // Right boundary = 200 + 260 + 24 = 484 > group.width (400)
    testDragState.activeNode = {
      id: "task-1",
      parentId: "group-1",
      position: { x: 200, y: 200 },
      measured: { width: 260, height: 80 },
      data: { row: member },
    };
    testDragState.movedNodes = [testDragState.activeNode];

    const stopBtn = screen.getByTestId("btn-trigger-drag-stop");
    fireEvent.click(stopBtn);

    await waitFor(() => {
      expect(mockQueueSizeWrite).toHaveBeenCalledWith({
        workspaceId: "ws-1",
        nodeId: "group-1",
        width: 484,
        height: 304, // 200 + 80 + 24
      });
    });
  });
});
