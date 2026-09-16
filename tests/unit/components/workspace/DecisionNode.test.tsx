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
    updateDecisionNode: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
  },
}));

vi.mock("@xyflow/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@xyflow/react")>();
  return {
    ...actual,
    useNodeId: () => "decision-node-1",
    useStore: (selector?: (s: unknown) => unknown) => {
      if (typeof selector === "function") {
        return selector({
          nodeLookup: new Map([
            ["decision-node-1", { id: "decision-node-1", selected: false }],
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

const makeDecisionRow = (
  overrides: Partial<WorkspaceNode> = {},
): WorkspaceNode => ({
  id: "decision-1",
  workspace_id: "ws-1",
  user_id: "guest",
  kind: "decision",
  entity_type: null,
  entity_id: null,
  position_x: 100,
  position_y: 100,
  width: 220,
  height: 110,
  group_id: null,
  display_config: {
    question: "Is user verified?",
    description: "Rule: check KYC status",
  },
  created_at: "2026-09-13T00:00:00.000Z",
  updated_at: "2026-09-13T00:00:00.000Z",
  ...overrides,
});

import {
  workspaceNodeTypes,
  getNodeKindSpec,
} from "@/components/workspace/node-registry";

function renderDecisionNode(row: WorkspaceNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  const DecisionNodeBound = workspaceNodeTypes.decision as React.ComponentType<{
    id: string;
    data: { row: WorkspaceNode };
  }>;

  return render(
    <QueryClientProvider client={queryClient}>
      <DecisionNodeBound id={row.id} data={{ row }} />
    </QueryClientProvider>,
  );
}

describe("DecisionNode component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers decision node with default dimensions 240x120", () => {
    const spec = getNodeKindSpec("decision");
    expect(spec).toBeDefined();
    expect(spec?.defaults.width).toBe(240);
    expect(spec?.defaults.height).toBe(120);
  });

  it("renders condition question, description, native title tooltip and diamond visual styling", () => {
    const row = makeDecisionRow();
    renderDecisionNode(row);

    expect(screen.getByTestId("decision-node")).toBeInTheDocument();
    const questionEl = screen.getByTestId("decision-node-question");
    expect(questionEl).toHaveTextContent("Is user verified?");
    expect(questionEl).toHaveAttribute("title", "Is user verified?");
    expect(screen.getByTestId("decision-node-description")).toHaveTextContent(
      "Rule: check KYC status",
    );
    expect(screen.queryByTestId("decision-node-input")).not.toBeInTheDocument();
  });

  it("renders multi-directional ports: Left (in), Right (out), Top (in-top, out-top), Bottom (in-bottom, out-bottom)", () => {
    const row = makeDecisionRow();
    renderDecisionNode(row);

    const inHandle = screen.getByTestId("handle-in");
    expect(inHandle).toBeInTheDocument();
    expect(inHandle).toHaveAttribute("data-type", "target");
    expect(inHandle).toHaveAttribute("data-position", "left");

    const outHandle = screen.getByTestId("handle-out");
    expect(outHandle).toBeInTheDocument();
    expect(outHandle).toHaveAttribute("data-type", "source");
    expect(outHandle).toHaveAttribute("data-position", "right");

    const inTopHandle = screen.getByTestId("handle-in-top");
    expect(inTopHandle).toBeInTheDocument();
    expect(inTopHandle).toHaveAttribute("data-type", "target");
    expect(inTopHandle).toHaveAttribute("data-position", "top");

    const outTopHandle = screen.getByTestId("handle-out-top");
    expect(outTopHandle).toBeInTheDocument();
    expect(outTopHandle).toHaveAttribute("data-type", "source");
    expect(outTopHandle).toHaveAttribute("data-position", "top");

    const inBottomHandle = screen.getByTestId("handle-in-bottom");
    expect(inBottomHandle).toBeInTheDocument();
    expect(inBottomHandle).toHaveAttribute("data-type", "target");
    expect(inBottomHandle).toHaveAttribute("data-position", "bottom");

    const outBottomHandle = screen.getByTestId("handle-out-bottom");
    expect(outBottomHandle).toBeInTheDocument();
    expect(outBottomHandle).toHaveAttribute("data-type", "source");
    expect(outBottomHandle).toHaveAttribute("data-position", "bottom");
  });

  it("enables in-place editing of question on double-click and persists on Enter", async () => {
    const row = makeDecisionRow();
    renderDecisionNode(row);

    const questionEl = screen.getByTestId("decision-node-question");
    fireEvent.doubleClick(questionEl);

    const input = screen.getByTestId("decision-node-input");
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue("Is user verified?");

    fireEvent.change(input, { target: { value: "Has admin privileges?" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(nodeCommands.updateDecisionNode).toHaveBeenCalledWith(
        expect.anything(),
        {
          workspaceId: "ws-1",
          nodeId: "decision-1",
          question: "Has admin privileges?",
        },
      );
    });
  });

  it("cancels question editing on Escape without persisting", async () => {
    const row = makeDecisionRow();
    renderDecisionNode(row);

    const questionEl = screen.getByTestId("decision-node-question");
    fireEvent.doubleClick(questionEl);

    const input = screen.getByTestId("decision-node-input");
    fireEvent.change(input, { target: { value: "New question that cancels" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(nodeCommands.updateDecisionNode).not.toHaveBeenCalled();
    expect(screen.getByTestId("decision-node-question")).toHaveTextContent(
      "Is user verified?",
    );
  });

  it("renders multi-line question and description without line clamp truncation", () => {
    const longQuestion =
      "是否满足以下准入规则？\n1. 实名认证完成\n2. 信用评分大于700\n3. 无不良操作记录";
    const longDesc = "规则依据：风控策略v2.4标准\n适用于海外及高危地区用户";
    const row = makeDecisionRow({
      display_config: {
        question: longQuestion,
        description: longDesc,
      },
    });
    renderDecisionNode(row);

    const questionEl = screen.getByTestId("decision-node-question");
    expect(questionEl.textContent).toBe(longQuestion);
    expect(questionEl.className).not.toContain("line-clamp-3");
    expect(questionEl.className).toContain("overflow-y-auto");
    expect(questionEl.className).toContain("whitespace-pre-wrap");

    const descEl = screen.getByTestId("decision-node-description");
    expect(descEl.textContent).toBe(longDesc);
    expect(descEl.className).not.toContain("line-clamp-1");
    expect(descEl.className).toContain("whitespace-pre-wrap");
  });

  it("removes decision node when remove button is clicked", async () => {
    const row = makeDecisionRow();
    renderDecisionNode(row);

    const removeBtn = screen.getByTestId("decision-node-remove");
    fireEvent.click(removeBtn);

    await waitFor(() => {
      expect(nodeCommands.remove).toHaveBeenCalledWith(expect.anything(), row);
    });
  });
});
