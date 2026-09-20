import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { WorkspaceNode } from "@/lib/types/workspace";
import { workspaceKeys } from "@/lib/queries/workspace-keys";

const mockSetNodes = vi.fn();
const mockQueuePositionWrite = vi.fn();
const mockQueueSizeWrite = vi.fn();

type ResizeParams = {
  x: number;
  y: number;
  width: number;
  height: number;
  direction?: number[];
};

let resizeControlCallbacks: {
  onResizeStart?: () => void;
  onResize?: (e: unknown, params: ResizeParams) => void;
  onResizeEnd?: (e: unknown, params: ResizeParams) => void;
} = {};

vi.mock("@xyflow/react", () => {
  return {
    useNodeId: () => "group-1",
    useReactFlow: () => ({ setNodes: mockSetNodes }),
    ResizeControlVariant: { Line: "line", Handle: "handle" },
    NodeResizeControl: (props: {
      variant?: string;
      position?: string;
      className?: string;
      onResizeStart?: () => void;
      onResize?: (e: unknown, params: ResizeParams) => void;
      onResizeEnd?: (e: unknown, params: ResizeParams) => void;
    }) => {
      const testId = `resize-control-${props.variant ?? "handle"}-${props.position}`;
      return (
        <button
          type="button"
          data-testid={testId}
          data-position={props.position}
          data-variant={props.variant ?? "handle"}
          className={props.className}
          onClick={() => {
            props.onResizeStart?.();
            resizeControlCallbacks = {
              onResizeStart: props.onResizeStart,
              onResize: props.onResize,
              onResizeEnd: props.onResizeEnd,
            };
          }}
        />
      );
    },
  };
});

vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => ({ isGuestMode: true }),
}));

vi.mock("@/components/workspace/useNodePositionWrites", () => ({
  useNodePositionWrites: () => ({ queuePositionWrite: mockQueuePositionWrite }),
}));

vi.mock("@/components/workspace/useNodeSizeWrites", () => ({
  useNodeSizeWrites: () => ({ queueSizeWrite: mockQueueSizeWrite }),
}));

vi.mock("@/lib/commands/node", () => ({
  nodeCommands: {
    renameGroup: vi.fn(async () => {}),
    ungroup: vi.fn(async () => {}),
  },
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

import { GroupNode } from "@/components/workspace/GroupNode";

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
  display_config: { title: "Test Container" },
  created_at: "2026-09-11T00:00:00.000Z",
  updated_at: "2026-09-11T00:00:00.000Z",
  ...overrides,
});

function renderTestGroup(
  groupRow: WorkspaceNode,
  allNodes: WorkspaceNode[] = [groupRow],
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  queryClient.setQueryData(
    workspaceKeys.nodes.list(groupRow.workspace_id, false),
    allNodes,
  );
  queryClient.setQueryData(
    workspaceKeys.nodes.list(groupRow.workspace_id, true),
    allNodes,
  );
  queryClient.setQueryData(
    workspaceKeys.nodes.of(groupRow.workspace_id),
    allNodes,
  );

  const GroupNodeBound = GroupNode as unknown as React.ComponentType<{
    id: string;
    data: { row: WorkspaceNode };
  }>;

  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <GroupNodeBound id={groupRow.id} data={{ row: groupRow }} />
      </QueryClientProvider>,
    ),
  };
}

describe("GroupNode Resize and Coordinate Synchronization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resizeControlCallbacks = {};
  });

  it("renders 4 corner handles, 4 edge handles, and 4 resize line controls", () => {
    const groupRow = makeGroupRow();
    renderTestGroup(groupRow);

    // 4 Corner handles
    for (const pos of [
      "top-left",
      "top-right",
      "bottom-left",
      "bottom-right",
    ]) {
      const handle = screen.getByTestId(`resize-control-handle-${pos}`);
      expect(handle).toBeInTheDocument();
      expect(handle.className).toContain("ws-resize-handle--corner");
    }

    // 4 Edge handles
    for (const pos of ["top", "bottom", "left", "right"]) {
      const handle = screen.getByTestId(`resize-control-handle-${pos}`);
      expect(handle).toBeInTheDocument();
      expect(handle.className).toContain("ws-resize-handle--edge");
    }

    // 4 Resize lines
    for (const pos of ["top", "bottom", "left", "right"]) {
      const line = screen.getByTestId(`resize-control-line-${pos}`);
      expect(line).toBeInTheDocument();
      expect(line.className).toContain("ws-resize-line");
    }
  });

  it("handles pure height resize (bottom edge) without shifting child positions", () => {
    const groupRow = makeGroupRow({
      position_x: 100,
      position_y: 100,
      width: 400,
      height: 300,
    });
    const memberChild: WorkspaceNode = {
      ...groupRow,
      id: "child-1",
      kind: "task",
      group_id: "group-1",
      position_x: 20,
      position_y: 30,
    };

    const { queryClient } = renderTestGroup(groupRow, [groupRow, memberChild]);

    // Activate bottom handle
    const bottomHandle = screen.getByTestId("resize-control-handle-bottom");
    fireEvent.click(bottomHandle);

    // Simulate resizing bottom handle (height expands from 300 to 450, position stays 100, 100)
    resizeControlCallbacks.onResize?.(null, {
      x: 100,
      y: 100,
      width: 400,
      height: 450,
    });

    // Check setNodes call: group height is 450, child position is unchanged
    expect(mockSetNodes).toHaveBeenCalled();
    const updateFn = mockSetNodes.mock.calls[0][0];
    const initialNodes = [
      {
        id: "group-1",
        position: { x: 100, y: 100 },
        style: { width: 400, height: 300 },
      },
      { id: "child-1", parentId: "group-1", position: { x: 20, y: 30 } },
    ];
    const updated = updateFn(initialNodes);
    expect(updated[0].style).toEqual(
      expect.objectContaining({ width: 400, height: 450 }),
    );
    expect(updated[1].position).toEqual({ x: 20, y: 30 }); // Unchanged

    // Trigger onResizeEnd
    resizeControlCallbacks.onResizeEnd?.(null, {
      x: 100,
      y: 100,
      width: 400,
      height: 450,
    });

    // Queue size write is called for group
    expect(mockQueueSizeWrite).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      nodeId: "group-1",
      width: 400,
      height: 450,
    });

    // No position write since x and y did not change
    expect(mockQueuePositionWrite).not.toHaveBeenCalled();

    // Cache updated with new height
    const cachedNodes = queryClient.getQueryData<WorkspaceNode[]>(
      workspaceKeys.nodes.list("ws-1", true),
    );
    const cachedGroup = cachedNodes?.find((n) => n.id === "group-1");
    expect(cachedGroup?.height).toBe(450);
  });

  it("handles top/left resize with inverse compensation for member children", () => {
    const groupRow = makeGroupRow({
      position_x: 100,
      position_y: 100,
      width: 400,
      height: 300,
    });
    const memberChild: WorkspaceNode = {
      ...groupRow,
      id: "child-1",
      kind: "task",
      group_id: "group-1",
      position_x: 50,
      position_y: 60,
    };

    const { queryClient } = renderTestGroup(groupRow, [groupRow, memberChild]);

    // Activate top-left handle
    const topLeftHandle = screen.getByTestId("resize-control-handle-top-left");
    fireEvent.click(topLeftHandle);

    // Drag top-left: x moves from 100 to 80 (dx = -20), y moves from 100 to 70 (dy = -30)
    // Width increases by 20 (420), height increases by 30 (330)
    resizeControlCallbacks.onResize?.(null, {
      x: 80,
      y: 70,
      width: 420,
      height: 330,
    });

    expect(mockSetNodes).toHaveBeenCalled();
    const updateFn = mockSetNodes.mock.calls[0][0];
    const initialNodes = [
      {
        id: "group-1",
        position: { x: 100, y: 100 },
        style: { width: 400, height: 300 },
      },
      { id: "child-1", parentId: "group-1", position: { x: 50, y: 60 } },
    ];
    const updated = updateFn(initialNodes);

    // Parent group position shifts to new origin (80, 70)
    expect(updated[0].position).toEqual({ x: 80, y: 70 });
    expect(updated[0].style).toEqual(
      expect.objectContaining({ width: 420, height: 330 }),
    );

    // Child relative position is compensated: orig - dx = 50 - (-20) = 70; orig - dy = 60 - (-30) = 90
    // Absolute canvas position = 80 + 70 = 150, 70 + 90 = 160 (exact same as 100 + 50, 100 + 60!)
    expect(updated[1].position).toEqual({ x: 70, y: 90 });

    // Trigger onResizeEnd
    resizeControlCallbacks.onResizeEnd?.(null, {
      x: 80,
      y: 70,
      width: 420,
      height: 330,
    });

    // 1. Group size write
    expect(mockQueueSizeWrite).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      nodeId: "group-1",
      width: 420,
      height: 330,
    });

    // 2. Group position write
    expect(mockQueuePositionWrite).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      nodeId: "group-1",
      position: { x: 80, y: 70 },
    });

    // 3. Child position write with compensated coordinates
    expect(mockQueuePositionWrite).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      nodeId: "child-1",
      position: { x: 70, y: 90 },
    });

    // 4. Query cache optimistic update
    const cachedNodes = queryClient.getQueryData<WorkspaceNode[]>(
      workspaceKeys.nodes.list("ws-1", true),
    );
    const cachedGroup = cachedNodes?.find((n) => n.id === "group-1");
    const cachedChild = cachedNodes?.find((n) => n.id === "child-1");

    expect(cachedGroup?.position_x).toBe(80);
    expect(cachedGroup?.position_y).toBe(70);
    expect(cachedGroup?.width).toBe(420);
    expect(cachedGroup?.height).toBe(330);

    expect(cachedChild?.position_x).toBe(70);
    expect(cachedChild?.position_y).toBe(90);
  });
});
