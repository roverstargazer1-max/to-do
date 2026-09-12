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
    renameGroup: vi.fn(async () => {}),
    ungroup: vi.fn(async () => {}),
  },
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
  display_config: { title: "Sprint Backlog" },
  created_at: "2026-09-11T00:00:00.000Z",
  updated_at: "2026-09-11T00:00:00.000Z",
  ...overrides,
});

import { workspaceKeys } from "@/lib/queries/workspace-keys";
import { workspaceNodeTypes } from "@/components/workspace/node-registry";

function renderGroupNode(row: WorkspaceNode, nodes: WorkspaceNode[] = [row]) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  // Seed cache for useWorkspaceNodes
  queryClient.setQueryData(workspaceKeys.nodes.list("ws-1", true), nodes);

  const GroupNodeBound = workspaceNodeTypes.group as React.ComponentType<{
    id: string;
    data: { row: WorkspaceNode };
  }>;

  return render(
    <QueryClientProvider client={queryClient}>
      <GroupNodeBound id={row.id} data={{ row }} />
    </QueryClientProvider>,
  );
}

describe("GroupNode component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders container with group title and member count badge", () => {
    const groupRow = makeGroupRow();
    const member1: WorkspaceNode = {
      ...groupRow,
      id: "node-1",
      kind: "task",
      group_id: "group-1",
    };
    const member2: WorkspaceNode = {
      ...groupRow,
      id: "node-2",
      kind: "task",
      group_id: "group-1",
    };

    renderGroupNode(groupRow, [groupRow, member1, member2]);

    expect(screen.getByText("Sprint Backlog")).toBeInTheDocument();
    expect(screen.getByText("02")).toBeInTheDocument();
    expect(
      screen.getByTestId("group-node-ungroup-group-1"),
    ).toBeInTheDocument();
  });

  it("allows double-click inline title editing and commits on Enter", async () => {
    const groupRow = makeGroupRow();
    renderGroupNode(groupRow);

    const titleSpan = screen.getByText("Sprint Backlog");
    fireEvent.doubleClick(titleSpan);

    const input = screen.getByDisplayValue("Sprint Backlog");
    expect(input).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "Updated Sprint" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(nodeCommands.renameGroup).toHaveBeenCalledWith(
        expect.objectContaining({ isGuestMode: true }),
        {
          workspaceId: "ws-1",
          groupId: "group-1",
          title: "Updated Sprint",
        },
      );
    });
  });

  it("cancels inline title editing on Escape and restores initial title", () => {
    const groupRow = makeGroupRow();
    renderGroupNode(groupRow);

    const titleSpan = screen.getByText("Sprint Backlog");
    fireEvent.doubleClick(titleSpan);

    const input = screen.getByDisplayValue("Sprint Backlog");
    fireEvent.change(input, { target: { value: "Should Not Save" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(
      screen.queryByDisplayValue("Should Not Save"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Sprint Backlog")).toBeInTheDocument();
    expect(nodeCommands.renameGroup).not.toHaveBeenCalled();
  });

  it("calls nodeCommands.ungroup when clicking the ungroup button", async () => {
    const groupRow = makeGroupRow();
    renderGroupNode(groupRow);

    const ungroupBtn = screen.getByTestId("group-node-ungroup-group-1");
    fireEvent.click(ungroupBtn);

    await waitFor(() => {
      expect(nodeCommands.ungroup).toHaveBeenCalledWith(
        expect.objectContaining({ isGuestMode: true }),
        {
          workspaceId: "ws-1",
          groupId: "group-1",
        },
      );
    });
  });
});
