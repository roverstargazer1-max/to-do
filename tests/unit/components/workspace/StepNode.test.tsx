import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { WorkspaceNode } from "@/lib/types/workspace";
import { nodeCommands } from "@/lib/commands/node";

vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => ({ isGuestMode: true }),
}));

vi.mock("@/lib/commands/node", () => ({
  nodeCommands: {
    updateStepNode: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
  },
}));

vi.mock("@xyflow/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@xyflow/react")>();
  return {
    ...actual,
    useNodeId: () => "step-node-1",
    useStore: (selector?: (s: unknown) => unknown) => {
      if (typeof selector === "function") {
        return selector({
          nodeLookup: new Map([
            ["step-node-1", { id: "step-node-1", selected: false }],
          ]),
        });
      }
      return false;
    },
    Handle: (props: { id: string; type: string; position: string }) => (
      <div
        data-testid={`handle-${props.id}`}
        data-type={props.type}
        data-position={props.position}
      />
    ),
  };
});

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

const makeStepRow = (
  overrides: Partial<WorkspaceNode> = {},
): WorkspaceNode => ({
  id: "step-node-1",
  workspace_id: "ws-1",
  user_id: "guest",
  kind: "step",
  entity_type: null,
  entity_id: null,
  position_x: 150,
  position_y: 200,
  width: 240,
  height: 80,
  group_id: null,
  display_config: {
    title: "Process Payment",
    description: "Charge stripe token",
  },
  created_at: "2026-09-13T00:00:00.000Z",
  updated_at: "2026-09-13T00:00:00.000Z",
  ...overrides,
});

import {
  workspaceNodeTypes,
  getNodeKindSpec,
} from "@/components/workspace/node-registry";

function renderStepNode(row: WorkspaceNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  const StepNodeBound = workspaceNodeTypes.step as React.ComponentType<{
    id: string;
    data: { row: WorkspaceNode };
  }>;

  return render(
    <QueryClientProvider client={queryClient}>
      <StepNodeBound id={row.id} data={{ row }} />
    </QueryClientProvider>,
  );
}

describe("StepNode component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers step node with default dimensions 240x80", () => {
    const spec = getNodeKindSpec("step");
    expect(spec).toBeDefined();
    expect(spec?.defaults.width).toBe(240);
    expect(spec?.defaults.height).toBe(80);
  });

  it("renders title, description and procedural styling without task checkboxes", () => {
    const row = makeStepRow();
    renderStepNode(row);

    expect(screen.getByTestId("step-node")).toBeInTheDocument();
    expect(screen.getByTestId("step-node-title")).toHaveTextContent(
      "Process Payment",
    );
    expect(screen.getByTestId("step-node-description")).toHaveTextContent(
      "Charge stripe token",
    );
    // Ensure no checkbox input exists
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("renders four-way connection ports: in (Left), out (Right), in-top (Top), out-bottom (Bottom)", () => {
    const row = makeStepRow();
    renderStepNode(row);

    const inPort = screen.getByTestId("handle-in");
    expect(inPort).toBeInTheDocument();
    expect(inPort).toHaveAttribute("data-type", "target");
    expect(inPort).toHaveAttribute("data-position", "left");

    const outPort = screen.getByTestId("handle-out");
    expect(outPort).toBeInTheDocument();
    expect(outPort).toHaveAttribute("data-type", "source");
    expect(outPort).toHaveAttribute("data-position", "right");

    const inTopPort = screen.getByTestId("handle-in-top");
    expect(inTopPort).toBeInTheDocument();
    expect(inTopPort).toHaveAttribute("data-type", "target");
    expect(inTopPort).toHaveAttribute("data-position", "top");

    const outBottomPort = screen.getByTestId("handle-out-bottom");
    expect(outBottomPort).toBeInTheDocument();
    expect(outBottomPort).toHaveAttribute("data-type", "source");
    expect(outBottomPort).toHaveAttribute("data-position", "bottom");
  });

  it("enables in-place editing of title on double-click and persists on Enter", async () => {
    const row = makeStepRow();
    renderStepNode(row);

    const titleEl = screen.getByTestId("step-node-title");
    fireEvent.doubleClick(titleEl);

    const input = screen.getByTestId("step-node-input");
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue("Process Payment");

    fireEvent.change(input, { target: { value: "Send Invoice" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(nodeCommands.updateStepNode).toHaveBeenCalledWith(
        expect.anything(),
        {
          workspaceId: "ws-1",
          nodeId: "step-node-1",
          title: "Send Invoice",
        },
      );
    });
  });

  it("renders multi-line description without line-clamp truncation and allows flexible vertical filling", () => {
    const longDesc =
      "做什么：把凭证、第三方后台等步骤做成向导。\n怎么做：分阶段确认。\n何时用：只有人能完成的操作。";
    const row = makeStepRow({
      display_config: {
        title: "wizard | 把人工外部操作做成向导",
        description: longDesc,
      },
    });
    renderStepNode(row);

    const descEl = screen.getByTestId("step-node-description");
    expect(descEl).toBeInTheDocument();
    expect(descEl.textContent).toBe(longDesc);
    // Ensure line-clamp-2 is NOT applied so text fills available space
    expect(descEl.className).not.toContain("line-clamp-2");
    expect(descEl.className).toContain("overflow-y-auto");
    expect(descEl.className).toContain("whitespace-pre-wrap");
    expect(descEl.className).toContain("flex-1");
  });

  it("enables in-place editing of description on double-click and persists on Enter", async () => {
    const row = makeStepRow();
    renderStepNode(row);

    const descEl = screen.getByTestId("step-node-description");
    fireEvent.doubleClick(descEl);

    const textarea = screen.getByTestId("step-node-desc-input");
    expect(textarea).toBeInTheDocument();
    expect(textarea).toHaveValue("Charge stripe token");

    fireEvent.change(textarea, {
      target: { value: "Line 1\nLine 2\nLine 3" },
    });
    fireEvent.keyDown(textarea, { key: "Enter" });

    await waitFor(() => {
      expect(nodeCommands.updateStepNode).toHaveBeenCalledWith(
        expect.anything(),
        {
          workspaceId: "ws-1",
          nodeId: "step-node-1",
          description: "Line 1\nLine 2\nLine 3",
        },
      );
    });
  });

  it("removes step node when remove button is clicked", async () => {
    const row = makeStepRow();
    renderStepNode(row);

    const removeBtn = screen.getByTestId("step-node-remove");
    fireEvent.click(removeBtn);

    await waitFor(() => {
      expect(nodeCommands.remove).toHaveBeenCalledWith(expect.anything(), row);
    });
  });
});
