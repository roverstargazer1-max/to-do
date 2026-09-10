import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * The "place an existing task onto the canvas" flow (ticket 05): the
 * picker lists the same tasks the tasks page reads, and selecting one
 * routes through the task kind's registry binding — `node.add` with the
 * reference pair and the registry defaults. The task itself is never
 * touched: the node is a new reference, so re-opening the picker still
 * offers the task.
 */

const addNode = vi.hoisted(() => vi.fn());
const busEvents = vi.hoisted(() => ({ events: [] as unknown[] }));
const notifyFn = vi.hoisted(() => vi.fn());

vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => ({ isGuestMode: true }),
}));

vi.mock("@/lib/mutations/workspace", () => ({
  workspaceMutations: {
    list: vi.fn(),
    create: vi.fn(),
    rename: vi.fn(),
    delete: vi.fn(),
    listNodes: vi.fn(),
    addNode: addNode,
    updateNodePosition: vi.fn(),
    removeNode: vi.fn(),
  },
}));

vi.mock("@/lib/events/domain-bus", () => ({
  publishDomainEvent: (event: unknown) => busEvents.events.push(event),
}));

vi.mock("@/lib/notify", () => ({
  notify: Object.assign(notifyFn, {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
    promise: vi.fn(),
  }),
}));

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/"),
}));

import { AddTaskNodeDialog } from "@/components/workspace/AddTaskNodeDialog";
import { mockStore } from "@/lib/mock/mock-store";
import type { WorkspaceNode } from "@/lib/types/workspace";

const TASK_ID = "picker-task-1";

function renderDialog(onOpenChange: (open: boolean) => void = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AddTaskNodeDialog
        workspaceId="ws-1"
        position={{ x: 100, y: 200 }}
        open={true}
        onOpenChange={onOpenChange}
      />
    </QueryClientProvider>,
  );
}

describe("AddTaskNodeDialog", () => {
  beforeEach(() => {
    localStorage.clear();
    mockStore.clearData();
    localStorage.setItem("kanso_guest_mode", "true");
    busEvents.events = [];
    addNode.mockClear();
    notifyFn.mockClear();

    mockStore.addTask({
      id: TASK_ID,
      content: "Picker task",
      is_completed: false,
    });
  });

  it("lists the same tasks the tasks page reads", async () => {
    renderDialog();

    await waitFor(() =>
      expect(screen.getByTestId(`add-task-option-${TASK_ID}`)).toBeVisible(),
    );
    expect(screen.getByText("Picker task")).toBeInTheDocument();
  });

  it("selecting a task places a node through the registry's add binding and never touches the task", async () => {
    const onOpenChange = vi.fn();
    addNode.mockResolvedValue({
      id: "node-new",
      workspace_id: "ws-1",
      user_id: "guest",
      kind: "task",
      entity_type: "task",
      entity_id: TASK_ID,
      position_x: 100,
      position_y: 200,
      width: 260,
      height: null,
      display_config: null,
      created_at: "2026-09-09T00:00:00.000Z",
      updated_at: "2026-09-09T00:00:00.000Z",
    } satisfies WorkspaceNode);
    renderDialog(onOpenChange);

    await waitFor(() =>
      expect(screen.getByTestId(`add-task-option-${TASK_ID}`)).toBeVisible(),
    );
    fireEvent.click(screen.getByTestId(`add-task-option-${TASK_ID}`));

    await waitFor(() => {
      expect(addNode).toHaveBeenCalledWith({
        id: expect.any(String),
        workspaceId: "ws-1",
        kind: "task",
        entityType: "task",
        entityId: TASK_ID,
        positionX: 100,
        positionY: 200,
        width: 260,
        height: null,
        displayConfig: null,
      });
    });
    expect(busEvents.events).toContainEqual({
      type: "node.added",
      workspaceId: "ws-1",
      nodeId: "node-new",
    });
    expect(notifyFn).toHaveBeenCalledWith("Task added to canvas");
    expect(onOpenChange).toHaveBeenCalledWith(false);

    // The task is untouched — the canvas holds references, not copies.
    expect(mockStore.getTasks().map((t) => t.id)).toEqual([TASK_ID]);
  });
});
