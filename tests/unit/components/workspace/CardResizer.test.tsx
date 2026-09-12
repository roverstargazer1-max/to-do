import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

let mockNodeSelected = false;

vi.mock("@xyflow/react", () => {
  return {
    useStore: (
      selector: (state: {
        nodeLookup: Map<string, { id: string; selected: boolean }>;
      }) => unknown,
    ) =>
      selector({
        nodeLookup: new Map([
          ["node-1", { id: "node-1", selected: mockNodeSelected }],
        ]),
      }),
    ResizeControlVariant: {
      Handle: "handle",
      Line: "line",
    },
    NodeResizeControl: (props: {
      nodeId?: string;
      position?: string;
      variant?: string;
      minWidth?: number;
      minHeight?: number;
      className?: string;
    }) => (
      <div
        data-testid="mock-resize-control"
        data-node-id={props.nodeId}
        data-position={props.position}
        data-variant={props.variant ?? "handle"}
        data-min-width={props.minWidth}
        data-min-height={props.minHeight}
        className={props.className}
      />
    ),
  };
});

import { CardResizer } from "@/components/workspace/CardResizer";

describe("CardResizer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNodeSelected = false;
  });

  it("renders 10 resize controls (4 lines, 4 corners, 2 edge pills) with default min dimensions (200x48)", () => {
    render(<CardResizer nodeId="node-1" selected={true} />);
    const controls = screen.getAllByTestId("mock-resize-control");
    expect(controls).toHaveLength(10);

    // 4 Lines
    const lines = controls.filter(
      (c) => c.getAttribute("data-variant") === "line",
    );
    expect(lines).toHaveLength(4);
    expect(lines.map((l) => l.getAttribute("data-position"))).toEqual([
      "top",
      "bottom",
      "left",
      "right",
    ]);

    // 4 Corners
    const corners = controls.filter((c) =>
      c.className.includes("ws-card-resize-handle--corner"),
    );
    expect(corners).toHaveLength(4);
    expect(corners.map((c) => c.getAttribute("data-position"))).toEqual([
      "top-left",
      "top-right",
      "bottom-left",
      "bottom-right",
    ]);

    // 2 Edge pills (top & bottom)
    const edgePills = controls.filter((c) =>
      c.className.includes("ws-card-resize-handle--edge"),
    );
    expect(edgePills).toHaveLength(2);
    expect(edgePills.map((e) => e.getAttribute("data-position"))).toEqual([
      "top",
      "bottom",
    ]);

    // All controls receive minWidth=200 and minHeight=48
    for (const ctrl of controls) {
      expect(ctrl.getAttribute("data-node-id")).toBe("node-1");
      expect(ctrl.getAttribute("data-min-width")).toBe("200");
      expect(ctrl.getAttribute("data-min-height")).toBe("48");
    }
  });

  it("is not visible (renders nothing) when neither selected prop nor store selected is true", () => {
    mockNodeSelected = false;
    render(<CardResizer nodeId="node-1" />);
    expect(screen.queryByTestId("mock-resize-control")).toBeNull();
  });

  it("becomes visible when store selected is true even without selected prop", () => {
    mockNodeSelected = true;
    render(<CardResizer nodeId="node-1" />);
    const controls = screen.getAllByTestId("mock-resize-control");
    expect(controls).toHaveLength(10);
  });

  it("respects custom minWidth and minHeight props across all controls", () => {
    render(
      <CardResizer
        nodeId="node-1"
        selected={true}
        minWidth={250}
        minHeight={80}
      />,
    );
    const controls = screen.getAllByTestId("mock-resize-control");
    for (const ctrl of controls) {
      expect(ctrl.getAttribute("data-min-width")).toBe("250");
      expect(ctrl.getAttribute("data-min-height")).toBe("80");
    }
  });
});
