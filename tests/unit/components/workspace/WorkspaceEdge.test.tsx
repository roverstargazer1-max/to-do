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
    markerEnd?: unknown;
    style?: React.CSSProperties;
  }) => (
    <path
      data-testid="mock-base-edge"
      data-selected={props.selected ? "true" : "false"}
      data-marker={JSON.stringify(props.markerEnd)}
      data-stroke={props.style?.stroke}
      className={props.className}
      d={props.path}
    />
  ),
  EdgeLabelRenderer: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="mock-edge-label-renderer">{children}</div>
  ),
  getSmoothStepPath: vi.fn(() => ["M0,0 L0,20 L100,80 L100,100", 50, 50]),
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

import { getSmoothStepPath } from "@xyflow/react";
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

  it("calculates path using getSmoothStepPath with borderRadius 8 and offset 20", () => {
    render(<WorkspaceEdge {...defaultProps} />);

    expect(getSmoothStepPath).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceX: 0,
        sourceY: 0,
        targetX: 100,
        targetY: 100,
        borderRadius: 8,
        offset: 20,
      }),
    );
  });

  it("synchronizes markerEnd color and stroke when edge is selected", () => {
    const marker = { type: "arrowclosed", width: 14, height: 14 };
    render(
      <WorkspaceEdge
        {...defaultProps}
        selected={true}
        markerEnd={marker as any}
      />,
    );

    const baseEdge = screen.getByTestId("mock-base-edge");
    expect(baseEdge).toHaveAttribute("data-stroke", "hsl(var(--primary))");
    expect(baseEdge.getAttribute("data-marker")).toContain(
      '"color":"hsl(var(--primary))"',
    );
  });

  it("synchronizes markerEnd color and stroke when hitbox is hovered", () => {
    const marker = { type: "arrowclosed", width: 14, height: 14 };
    render(
      <WorkspaceEdge
        {...defaultProps}
        selected={false}
        markerEnd={marker as any}
      />,
    );

    const hitbox = screen.getByTestId("workspace-edge-hitbox-edge-1");
    fireEvent.mouseEnter(hitbox);

    const baseEdge = screen.getByTestId("mock-base-edge");
    expect(baseEdge).toHaveAttribute("data-stroke", "hsl(var(--foreground))");
    expect(baseEdge.getAttribute("data-marker")).toContain(
      '"color":"hsl(var(--foreground))"',
    );
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

  it("does not render label pill when label is not provided or empty", () => {
    render(<WorkspaceEdge {...defaultProps} />);
    expect(
      screen.queryByTestId("workspace-edge-label-edge-1"),
    ).not.toBeInTheDocument();
  });

  it("renders styled label pill badge when label is provided", () => {
    const propsWithLabel = {
      ...defaultProps,
      data: { edgeId: "edge-1", workspaceId: "ws-1", label: "Pass" },
    } as unknown as EdgeProps;

    render(<WorkspaceEdge {...propsWithLabel} />);
    const labelBadge = screen.getByTestId("workspace-edge-label-edge-1");
    expect(labelBadge).toBeInTheDocument();
    expect(labelBadge).toHaveTextContent("Pass");
    expect(labelBadge.className).toContain("bg-background");
    expect(labelBadge.className).not.toContain("backdrop-blur");
  });

  it("enters edit mode on label double click and saves on Enter", () => {
    const onUpdateLabel = vi.fn();
    const propsWithLabel = {
      ...defaultProps,
      data: {
        edgeId: "edge-1",
        workspaceId: "ws-1",
        label: "Pass",
        onUpdateLabel,
      },
    } as unknown as EdgeProps;

    render(<WorkspaceEdge {...propsWithLabel} />);
    const labelBadge = screen.getByTestId("workspace-edge-label-edge-1");
    fireEvent.doubleClick(labelBadge);

    const input = screen.getByTestId("workspace-edge-label-input-edge-1");
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue("Pass");

    fireEvent.change(input, { target: { value: "Approved" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onUpdateLabel).toHaveBeenCalledWith("Approved");
    expect(
      screen.queryByTestId("workspace-edge-label-input-edge-1"),
    ).not.toBeInTheDocument();
  });

  it("cancels edit on Escape key without saving", () => {
    const onUpdateLabel = vi.fn();
    const propsWithLabel = {
      ...defaultProps,
      data: {
        edgeId: "edge-1",
        workspaceId: "ws-1",
        label: "Pass",
        onUpdateLabel,
      },
    } as unknown as EdgeProps;

    render(<WorkspaceEdge {...propsWithLabel} />);
    const labelBadge = screen.getByTestId("workspace-edge-label-edge-1");
    fireEvent.doubleClick(labelBadge);

    const input = screen.getByTestId("workspace-edge-label-input-edge-1");
    fireEvent.change(input, { target: { value: "Rejected" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(onUpdateLabel).not.toHaveBeenCalled();
    expect(screen.getByTestId("workspace-edge-label-edge-1")).toHaveTextContent(
      "Pass",
    );
  });

  it("allows entering edit mode by double clicking edge hitbox", () => {
    render(<WorkspaceEdge {...defaultProps} />);
    const hitbox = screen.getByTestId("workspace-edge-hitbox-edge-1");
    fireEvent.doubleClick(hitbox);

    expect(
      screen.getByTestId("workspace-edge-label-input-edge-1"),
    ).toBeInTheDocument();
  });
});
