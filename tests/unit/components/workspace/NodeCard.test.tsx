import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

let mockNodeId: string | null = null;

vi.mock("@xyflow/react", () => ({
  useNodeId: () => mockNodeId,
  Handle: (props: { id: string; type: string; position: string }) => (
    <div
      data-testid={`handle-${props.id}`}
      data-type={props.type}
      data-position={props.position}
    />
  ),
  Position: {
    Left: "left",
    Right: "right",
    Top: "top",
    Bottom: "bottom",
  },
}));

vi.mock("@/components/workspace/CardResizer", () => ({
  CardResizer: (props: { nodeId: string }) => (
    <div data-testid={`mock-card-resizer-${props.nodeId}`} />
  ),
}));

import { NodeCard } from "@/components/workspace/NodeCard";

describe("NodeCard", () => {
  beforeEach(() => {
    mockNodeId = null;
    vi.clearAllMocks();
  });

  it("renders standalone without React Flow host (zero handles, zero errors)", () => {
    mockNodeId = null;

    render(
      <NodeCard kind="Task" action={<button>Action</button>}>
        <div>Card Content</div>
      </NodeCard>,
    );

    expect(screen.getByText("Task")).toBeInTheDocument();
    expect(screen.getByText("Card Content")).toBeInTheDocument();
    expect(screen.getByText("Action")).toBeInTheDocument();

    // Verify zero handles mounted
    expect(screen.queryByTestId("handle-in")).not.toBeInTheDocument();
    expect(screen.queryByTestId("handle-out")).not.toBeInTheDocument();
    expect(screen.queryByTestId("handle-in-top")).not.toBeInTheDocument();
    expect(screen.queryByTestId("handle-out-bottom")).not.toBeInTheDocument();
    expect(screen.queryByTestId(/mock-card-resizer/)).not.toBeInTheDocument();
  });

  it("renders four-way connection ports when hosted inside React Flow", () => {
    mockNodeId = "test-node-1";

    render(
      <NodeCard kind="Step">
        <div>Step Content</div>
      </NodeCard>,
    );

    expect(
      screen.getByTestId("mock-card-resizer-test-node-1"),
    ).toBeInTheDocument();

    // 1. Horizontal Input: Left (in)
    const inHandle = screen.getByTestId("handle-in");
    expect(inHandle).toBeInTheDocument();
    expect(inHandle).toHaveAttribute("data-type", "target");
    expect(inHandle).toHaveAttribute("data-position", "left");

    // 2. Horizontal Output: Right (out)
    const outHandle = screen.getByTestId("handle-out");
    expect(outHandle).toBeInTheDocument();
    expect(outHandle).toHaveAttribute("data-type", "source");
    expect(outHandle).toHaveAttribute("data-position", "right");

    // 3. Vertical Input: Top (in-top)
    const inTopHandle = screen.getByTestId("handle-in-top");
    expect(inTopHandle).toBeInTheDocument();
    expect(inTopHandle).toHaveAttribute("data-type", "target");
    expect(inTopHandle).toHaveAttribute("data-position", "top");

    // 4. Vertical Output: Bottom (out-bottom)
    const outBottomHandle = screen.getByTestId("handle-out-bottom");
    expect(outBottomHandle).toBeInTheDocument();
    expect(outBottomHandle).toHaveAttribute("data-type", "source");
    expect(outBottomHandle).toHaveAttribute("data-position", "bottom");
  });

  it("renders customHandles when provided, overriding default four-way ports", () => {
    mockNodeId = "custom-node-1";

    render(
      <NodeCard
        kind="Custom"
        customHandles={
          <div data-testid="custom-port-cluster">Custom Ports</div>
        }
      >
        <div>Content</div>
      </NodeCard>,
    );

    expect(screen.getByTestId("custom-port-cluster")).toBeInTheDocument();
    expect(screen.queryByTestId("handle-in")).not.toBeInTheDocument();
    expect(screen.queryByTestId("handle-out")).not.toBeInTheDocument();
  });
});
