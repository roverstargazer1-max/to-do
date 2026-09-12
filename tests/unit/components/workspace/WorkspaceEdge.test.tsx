import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { Position, type EdgeProps } from "@xyflow/react";

const mockDeleteElements = vi.fn();

vi.mock("@xyflow/react", () => ({
  BaseEdge: (props: {
    selected?: boolean;
    className?: string;
    d?: string;
    path?: string;
  }) => (
    <path
      data-testid="mock-base-edge"
      data-selected={props.selected ? "true" : "false"}
      className={props.className}
      d={props.path}
    />
  ),
  EdgeLabelRenderer: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="mock-edge-label-renderer">{children}</div>
  ),
  getBezierPath: vi.fn(() => ["M0,0 C50,0 50,100 100,100", 50, 50]),
  useReactFlow: () => ({
    deleteElements: mockDeleteElements,
  }),
  Position: {
    Left: "left",
    Right: "right",
    Top: "top",
    Bottom: "bottom",
  },
}));

vi.mock("@/lib/i18n/useTranslation", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      key === "workspace.canvas.disconnect" ? "删除连线" : key,
  }),
}));

import { WorkspaceEdge } from "@/components/workspace/WorkspaceEdge";

describe("WorkspaceEdge", () => {
  const defaultProps = {
    id: "edge-1",
    source: "node-1",
    target: "node-2",
    sourceX: 0,
    sourceY: 0,
    targetX: 100,
    targetY: 100,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    selected: false,
    animated: false,
    data: { edgeId: "edge-1", workspaceId: "ws-1" },
  } as unknown as EdgeProps;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders BaseEdge, invisible hit path, and disconnect button", () => {
    render(<WorkspaceEdge {...defaultProps} />);

    expect(screen.getByTestId("mock-base-edge")).toBeInTheDocument();
    expect(
      screen.getByTestId("workspace-edge-hitbox-edge-1"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("workspace-edge-disconnect-edge-1"),
    ).toBeInTheDocument();
  });

  it("keeps disconnect button hidden by default when unselected", () => {
    render(<WorkspaceEdge {...defaultProps} selected={false} />);

    const button = screen.getByTestId("workspace-edge-disconnect-edge-1");
    const container = button.parentElement!;
    expect(container.className).toContain("opacity-0");
    expect(container.className).toContain("pointer-events-none");
  });

  it("reveals disconnect button when edge is selected", () => {
    render(<WorkspaceEdge {...defaultProps} selected={true} />);

    const button = screen.getByTestId("workspace-edge-disconnect-edge-1");
    const container = button.parentElement!;
    expect(container.className).toContain("opacity-100");
    expect(container.className).toContain("pointer-events-auto");
  });

  it("reveals disconnect button when hovered on hitbox", () => {
    render(<WorkspaceEdge {...defaultProps} selected={false} />);

    const hitbox = screen.getByTestId("workspace-edge-hitbox-edge-1");
    fireEvent.mouseEnter(hitbox);

    const button = screen.getByTestId("workspace-edge-disconnect-edge-1");
    const container = button.parentElement!;
    expect(container.className).toContain("opacity-100");
    expect(container.className).toContain("pointer-events-auto");

    fireEvent.mouseLeave(hitbox);
    expect(container.className).toContain("opacity-0");
  });

  it("calls reactFlow.deleteElements with edge id when disconnect button is clicked", () => {
    render(<WorkspaceEdge {...defaultProps} selected={true} />);

    const button = screen.getByTestId("workspace-edge-disconnect-edge-1");
    fireEvent.click(button);

    expect(mockDeleteElements).toHaveBeenCalledTimes(1);
    expect(mockDeleteElements).toHaveBeenCalledWith({
      edges: [{ id: "edge-1" }],
    });
  });
});
