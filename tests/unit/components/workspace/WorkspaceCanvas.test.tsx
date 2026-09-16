import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useWorkspaceUndoStore } from "@/lib/store/workspaceUndoStore";

/**
 * The canvas's externally observable wiring, asserted without React Flow
 * internals: @xyflow/react is replaced with a lightweight fake that (a)
 * echoes the defaultViewport it receives, (b) fires onMoveEnd from a
 * button, and (c) fires onNodeDragStop from a button with a node the test
 * controls — so the tests observe the component↔store/command wiring, not
 * React Flow internals.
 *
 * Viewport persistence is the ticket-04 scenario: arrange → leave →
 * return on the same device → same viewport; switching workspaces swaps
 * the saved canvas. Node drag persistence is the three-layer model
 * (ticket 05): drag end writes the final position into the nodes-list
 * cache entry optimistically, then a debounced row-level PATCH lands via
 * the `node.move` command; a press without movement persists nothing.
 */

const dragNodeState = vi.hoisted(() => ({
  node: null as {
    id: string;
    position: { x: number; y: number };
    data: unknown;
  } | null,
}));

const nodeRows = vi.hoisted(() => ({ rows: [] as WorkspaceRow[] }));
const nodeMoveEvents = vi.hoisted(() => ({ events: [] as unknown[] }));
const updateNodePosition = vi.hoisted(() => vi.fn());
const addNode = vi.hoisted(() => vi.fn());

type WorkspaceRow = import("@/lib/types/workspace").WorkspaceNode;

const mockTasks = vi.hoisted(() => ({
  tasks: [
    {
      id: "task-1",
      content: "Task 1 Content",
      description: "Detailed description",
      priority: 1,
      is_completed: false,
      created_at: "2026-09-09T00:00:00.000Z",
      updated_at: "2026-09-09T00:00:00.000Z",
    },
  ],
}));

vi.mock("@/lib/hooks/useTasks", () => ({
  useTasks: () => ({ data: mockTasks.tasks, isLoading: false }),
  useInboxProject: () => ({ data: null }),
}));

vi.mock("@/lib/hooks/useProjects", () => ({
  useProjects: () => ({ data: [], isLoading: false }),
}));

vi.mock("@/lib/hooks/useTaskMutations", () => ({
  useCreateTask: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateTask: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteTask: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@xyflow/react", async () => {
  const React = await import("react");
  const { useState, useCallback } = React;
  return {
    MarkerType: {
      Arrow: "arrow",
      ArrowClosed: "arrowclosed",
    },
    useNodesState: (initial: unknown[]) => {
      const [nodes, setNodes] = useState(initial);
      const onNodesChange = useCallback(() => {}, []);
      return [nodes, setNodes, onNodesChange];
    },
    ReactFlow: ({
      defaultViewport,
      onMoveEnd,
      onNodeDragStop,
      onNodeDoubleClick,
      onNodesDelete,
      children,
    }: {
      defaultViewport?: { x: number; y: number; zoom: number };
      onMoveEnd?: (
        event: MouseEvent | TouchEvent | null,
        viewport: { x: number; y: number; zoom: number },
      ) => void;
      onNodeDragStop?: (event: unknown, node: unknown) => void;
      onNodeDoubleClick?: (event: unknown, node: unknown) => void;
      onNodesDelete?: (nodes: unknown[]) => void;
      children?: React.ReactNode;
    }) => (
      <div
        data-testid="react-flow"
        data-default-viewport={JSON.stringify(defaultViewport)}
      >
        <button
          type="button"
          data-testid="simulate-pan"
          onClick={() => onMoveEnd?.(null, { x: 123, y: 45, zoom: 1.5 })}
        >
          simulate pan
        </button>
        <button
          type="button"
          data-testid="simulate-drag-stop"
          onClick={() =>
            dragNodeState.node && onNodeDragStop?.(null, dragNodeState.node)
          }
        >
          simulate drag stop
        </button>
        <button
          type="button"
          data-testid="simulate-node-double-click"
          onClick={() =>
            dragNodeState.node &&
            onNodeDoubleClick?.(
              {
                target: document.createElement("div"),
              } as unknown as React.MouseEvent,
              dragNodeState.node,
            )
          }
        >
          simulate node double click
        </button>
        <button
          type="button"
          data-testid="simulate-nodes-delete"
          onClick={() =>
            dragNodeState.node && onNodesDelete?.([dragNodeState.node])
          }
        >
          simulate nodes delete
        </button>
        {children}
      </div>
    ),
    Background: () => null,
    BackgroundVariant: { Dots: "dots", Lines: "lines", Cross: "cross" },
    Controls: () => null,
  };
});

vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => ({ isGuestMode: true }),
}));

vi.mock("@/lib/mutations/workspace", () => ({
  workspaceMutations: {
    list: vi.fn(),
    create: vi.fn(),
    rename: vi.fn(),
    delete: vi.fn(),
    listNodes: vi.fn(async () => nodeRows.rows),
    addNode: addNode,
    updateNodePosition: updateNodePosition,
    removeNode: vi.fn(),
  },
}));

vi.mock("@/lib/events/domain-bus", () => ({
  publishDomainEvent: (event: unknown) => nodeMoveEvents.events.push(event),
}));

vi.mock("@/lib/notify", () => {
  const fn = vi.fn();
  return {
    notify: Object.assign(fn, {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn(),
      loading: vi.fn(),
      dismiss: vi.fn(),
      promise: vi.fn(),
    }),
  };
});

import { WorkspaceCanvas } from "@/components/workspace/WorkspaceCanvas";
import { useWorkspaceViewportStore } from "@/lib/store/workspaceViewportStore";
import { workspaceKeys } from "@/lib/queries/workspace-keys";
import type { WorkspaceNode } from "@/lib/types/workspace";

const readDefaultViewport = () =>
  JSON.parse(
    screen.getByTestId("react-flow").getAttribute("data-default-viewport") ??
      "null",
  );

const makeNode = (overrides: Partial<WorkspaceNode> = {}): WorkspaceNode => ({
  id: "node-1",
  workspace_id: "ws-a",
  user_id: "guest",
  kind: "task",
  entity_type: "task",
  entity_id: "task-1",
  position_x: 0,
  position_y: 0,
  width: 260,
  height: null,
  display_config: null,
  created_at: "2026-09-09T00:00:00.000Z",
  updated_at: "2026-09-09T00:00:00.000Z",
  ...overrides,
});

function renderCanvas(workspaceId: string) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <WorkspaceCanvas workspaceId={workspaceId} />
    </QueryClientProvider>,
  );
  return { queryClient, ...utils };
}

describe("WorkspaceCanvas viewport persistence", () => {
  beforeEach(() => {
    useWorkspaceViewportStore.setState({ viewports: {} });
    window.localStorage.clear();
    nodeRows.rows = [];
    dragNodeState.node = null;
    nodeMoveEvents.events = [];
    updateNodePosition.mockClear();
  });

  it("a fresh canvas starts at the origin viewport", () => {
    renderCanvas("ws-a");

    expect(readDefaultViewport()).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  it("arranging the viewport, leaving, and returning restores the same viewport", () => {
    // First visit: a pan/zoom gesture ends.
    const { unmount: leave } = renderCanvas("ws-a");
    fireEvent.click(screen.getByTestId("simulate-pan"));
    expect(useWorkspaceViewportStore.getState().getViewport("ws-a")).toEqual({
      x: 123,
      y: 45,
      zoom: 1.5,
    });
    leave();

    // Return on the same device: the canvas restores the saved viewport.
    renderCanvas("ws-a");
    expect(readDefaultViewport()).toEqual({ x: 123, y: 45, zoom: 1.5 });
  });

  it("switching workspaces swaps the saved canvas viewport", () => {
    const { unmount: leaveA } = renderCanvas("ws-a");
    fireEvent.click(screen.getByTestId("simulate-pan"));
    leaveA();

    const { unmount: leaveB } = renderCanvas("ws-b");
    // ws-b was never arranged: origin viewport, ws-a's state untouched.
    expect(readDefaultViewport()).toEqual({ x: 0, y: 0, zoom: 1 });
    expect(useWorkspaceViewportStore.getState().getViewport("ws-a")).toEqual({
      x: 123,
      y: 45,
      zoom: 1.5,
    });
    leaveB();

    // Back on ws-a: still its own saved viewport.
    renderCanvas("ws-a");
    expect(readDefaultViewport()).toEqual({ x: 123, y: 45, zoom: 1.5 });
  });
});

describe("WorkspaceCanvas node drag persistence (three-layer model)", () => {
  beforeEach(() => {
    useWorkspaceViewportStore.setState({ viewports: {} });
    window.localStorage.clear();
    nodeRows.rows = [];
    dragNodeState.node = null;
    nodeMoveEvents.events = [];
    updateNodePosition.mockClear();
  });

  it("drag end writes the final position into the cache optimistically, then persists one debounced patch", async () => {
    vi.useFakeTimers();
    try {
      const row = makeNode();
      nodeRows.rows = [row];
      const { queryClient } = renderCanvas("ws-a");
      // The nodes list starts from the query entry the surface reads.
      queryClient.setQueryData(
        workspaceKeys.nodes.list("ws-a", true),
        nodeRows.rows,
      );
      await vi.advanceTimersByTimeAsync(0);

      dragNodeState.node = {
        id: row.id,
        position: { x: 320, y: 480 },
        data: { row },
      };
      fireEvent.click(screen.getByTestId("simulate-drag-stop"));

      // Layer 2 — optimistic: the nodes-list entry shows the final position.
      const cached = queryClient.getQueryData<WorkspaceNode[]>(
        workspaceKeys.nodes.list("ws-a", true),
      );
      expect(cached?.find((n) => n.id === row.id)?.position_x).toBe(320);
      expect(cached?.find((n) => n.id === row.id)?.position_y).toBe(480);

      // Not persisted yet — the patch is debounced.
      expect(updateNodePosition).not.toHaveBeenCalled();

      // Layer 3 — after the debounce window: one row-level PATCH and the
      // node.moved fact, published after the write lands.
      await vi.advanceTimersByTimeAsync(400);
      expect(updateNodePosition).toHaveBeenCalledTimes(1);
      expect(updateNodePosition).toHaveBeenCalledWith(row.id, {
        x: 320,
        y: 480,
      });
      expect(nodeMoveEvents.events).toContainEqual({
        type: "node.moved",
        workspaceId: "ws-a",
        nodeId: row.id,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("a press without movement drags zero pixels — nothing to persist", async () => {
    vi.useFakeTimers();
    try {
      const row = makeNode();
      nodeRows.rows = [row];
      const { queryClient } = renderCanvas("ws-a");
      queryClient.setQueryData(
        workspaceKeys.nodes.list("ws-a", true),
        nodeRows.rows,
      );
      await vi.advanceTimersByTimeAsync(0);

      dragNodeState.node = {
        id: row.id,
        position: { x: row.position_x, y: row.position_y },
        data: { row },
      };
      fireEvent.click(screen.getByTestId("simulate-drag-stop"));

      await vi.advanceTimersByTimeAsync(400);
      expect(updateNodePosition).not.toHaveBeenCalled();
      expect(nodeMoveEvents.events).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  describe("QuickAddMenu interactions", () => {
    it("opens quick add menu on canvas double-click", () => {
      renderCanvas("ws-a");
      const canvas = screen.getByTestId("workspace-canvas");

      fireEvent.doubleClick(canvas, { clientX: 200, clientY: 300 });

      expect(screen.getByTestId("quick-add-menu")).toBeDefined();
      expect(screen.getByTestId("quick-add-task-input")).toBeDefined();
    });

    it("opens quick add menu on canvas context menu (right click)", () => {
      renderCanvas("ws-a");
      const canvas = screen.getByTestId("workspace-canvas");

      fireEvent.contextMenu(canvas, { clientX: 250, clientY: 350 });

      expect(screen.getByTestId("quick-add-menu")).toBeDefined();
    });

    it("creates task and adds node when submitting quick task input", async () => {
      window.localStorage.setItem("kanso_guest_mode", "true");
      addNode.mockResolvedValue({
        id: "node-quick-1",
        workspace_id: "ws-a",
        kind: "task",
        entity_id: "task-quick-1",
        entity_type: "task",
        position_x: 200,
        position_y: 300,
      });

      renderCanvas("ws-a");
      const canvas = screen.getByTestId("workspace-canvas");

      fireEvent.doubleClick(canvas, { clientX: 200, clientY: 300 });

      const input = screen.getByTestId("quick-add-task-input");
      fireEvent.change(input, { target: { value: "Urgent canvas task" } });
      fireEvent.keyDown(input, { key: "Enter" });

      await waitFor(() => {
        expect(addNode).toHaveBeenCalledWith(
          expect.objectContaining({
            workspaceId: "ws-a",
            kind: "task",
          }),
        );
      });
    });
  });

  describe("Task node double click editing", () => {
    it("opens task detail sheet when a task node is double clicked", async () => {
      renderCanvas("ws-a");
      dragNodeState.node = {
        id: "node-1",
        position: { x: 0, y: 0 },
        data: {
          row: makeNode({ id: "node-1", entity_id: "task-1", kind: "task" }),
        },
      };

      const simulateBtn = screen.getByTestId("simulate-node-double-click");
      fireEvent.click(simulateBtn);

      await waitFor(() => {
        expect(screen.getByTestId("workspace-task-detail-sheet")).toBeDefined();
      });
    });
  });

  describe("Undo / Redo toolbar and keyboard deletion", () => {
    it("renders undo and redo buttons and reflects undo stack state", async () => {
      renderCanvas("ws-a");
      const undoBtn = screen.getByTestId("workspace-undo-btn");
      const redoBtn = screen.getByTestId("workspace-redo-btn");

      expect(undoBtn).toBeDisabled();
      expect(redoBtn).toBeDisabled();

      const undoMock = vi.fn().mockResolvedValue(undefined);
      const redoMock = vi.fn().mockResolvedValue(undefined);

      act(() => {
        useWorkspaceUndoStore.getState().pushAction("ws-a", {
          id: "act-1",
          description: "deleted node",
          undo: undoMock,
          redo: redoMock,
        });
      });

      expect(undoBtn).not.toBeDisabled();
      expect(redoBtn).toBeDisabled();

      fireEvent.click(undoBtn);

      await waitFor(() => {
        expect(undoMock).toHaveBeenCalledTimes(1);
        expect(undoBtn).toBeDisabled();
        expect(redoBtn).not.toBeDisabled();
      });

      fireEvent.click(redoBtn);

      await waitFor(() => {
        expect(redoMock).toHaveBeenCalledTimes(1);
        expect(undoBtn).not.toBeDisabled();
        expect(redoBtn).toBeDisabled();
      });
    });

    it("triggers node removal when nodes are deleted via canvas handler", async () => {
      renderCanvas("ws-a");
      dragNodeState.node = {
        id: "node-del-1",
        position: { x: 0, y: 0 },
        data: {
          row: makeNode({
            id: "node-del-1",
            entity_id: "task-1",
            kind: "task",
          }),
        },
      };

      const simulateBtn = screen.getByTestId("simulate-nodes-delete");
      fireEvent.click(simulateBtn);

      await waitFor(() => {
        expect(useWorkspaceUndoStore.getState().canUndo("ws-a")).toBe(true);
      });
    });
  });
});
