import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TaskNode } from "@/components/workspace/TaskNode";
import { getNodeKindSpec } from "@/components/workspace/node-registry";
import type { WorkspaceNode } from "@/lib/types/workspace";
import type { Task } from "@/lib/types/task";
import type { ToggleTaskResult } from "@/lib/commands/task";
import type { NodeKindSpec } from "@/components/workspace/node-registry";

const toggleFn = vi.hoisted(() =>
  vi.fn(async () => ({}) as unknown as ToggleTaskResult),
);

vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => ({ isGuestMode: true }),
}));

const mockTasksData = vi.hoisted(() => ({
  tasks: [] as Task[],
  subtasks: [] as Task[],
}));

vi.mock("@/lib/hooks/useTasks", () => ({
  useTasks: () => ({ data: mockTasksData.tasks, isLoading: false }),
}));

vi.mock("@/lib/hooks/useSubtasks", () => ({
  useSubtasks: (parentId: string | null | undefined) => ({
    data: parentId
      ? mockTasksData.subtasks.filter((s) => s.parent_id === parentId)
      : [],
    isLoading: false,
  }),
}));

const makeRow = (overrides: Partial<WorkspaceNode> = {}): WorkspaceNode => ({
  id: "node-1",
  workspace_id: "ws-1",
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

function renderTaskNode(row: WorkspaceNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const spec = {
    ...getNodeKindSpec("task")!,
    commands: {
      ...getNodeKindSpec("task")!.commands,
      toggle: toggleFn,
    },
  };

  return render(
    <QueryClientProvider client={queryClient}>
      <TaskNode
        id={row.id}
        data={{ row }}
        spec={spec as unknown as NodeKindSpec}
      />
    </QueryClientProvider>,
  );
}

describe("TaskNode subtasks display and toggle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTasksData.tasks = [
      {
        id: "task-1",
        user_id: "guest",
        project_id: null,
        parent_id: null,
        content: "Main Parent Task",
        description: null,
        priority: 2,
        due_date: null,
        do_date: null,
        is_evening: false,
        is_completed: false,
        completed_at: null,
        day_order: 0,
        recurrence: null,
        recurring_series_id: null,
        google_event_id: null,
        google_etag: null,
        created_at: "2026-09-09T00:00:00.000Z",
        updated_at: "2026-09-09T00:00:00.000Z",
      },
    ];
    mockTasksData.subtasks = [];
  });

  it("renders parent task without subtask container when there are no subtasks", () => {
    const row = makeRow();
    renderTaskNode(row);

    expect(screen.getByText("Main Parent Task")).toBeDefined();
    expect(screen.queryByTestId("task-node-subtasks-task-1")).toBeNull();
    expect(screen.queryByTestId("step-progress-badge")).toBeNull();
  });

  it("renders subtasks list and progress badge when subtasks exist", () => {
    mockTasksData.subtasks = [
      {
        id: "subtask-1",
        user_id: "guest",
        project_id: null,
        parent_id: "task-1",
        content: "First Step",
        description: null,
        priority: 4,
        due_date: null,
        do_date: null,
        is_evening: false,
        is_completed: false,
        completed_at: null,
        day_order: 0,
        recurrence: null,
        recurring_series_id: null,
        google_event_id: null,
        google_etag: null,
        created_at: "2026-09-09T00:00:00.000Z",
        updated_at: "2026-09-09T00:00:00.000Z",
      },
      {
        id: "subtask-2",
        user_id: "guest",
        project_id: null,
        parent_id: "task-1",
        content: "Second Step Done",
        description: null,
        priority: 4,
        due_date: null,
        do_date: null,
        is_evening: false,
        is_completed: true,
        completed_at: "2026-09-09T01:00:00.000Z",
        day_order: 1,
        recurrence: null,
        recurring_series_id: null,
        google_event_id: null,
        google_etag: null,
        created_at: "2026-09-09T00:00:00.000Z",
        updated_at: "2026-09-09T00:00:00.000Z",
      },
    ];

    const row = makeRow();
    renderTaskNode(row);

    expect(screen.getByTestId("task-node-subtasks-task-1")).toBeDefined();
    expect(screen.getByText("First Step")).toBeDefined();
    expect(screen.getByText("Second Step Done")).toBeDefined();
    expect(screen.getByTestId("step-progress-badge")).toHaveTextContent("1/2");
  });

  it("toggles subtask completion when its checkbox is clicked", async () => {
    mockTasksData.subtasks = [
      {
        id: "subtask-1",
        user_id: "guest",
        project_id: null,
        parent_id: "task-1",
        content: "First Step",
        description: null,
        priority: 4,
        due_date: null,
        do_date: null,
        is_evening: false,
        is_completed: false,
        completed_at: null,
        day_order: 0,
        recurrence: null,
        recurring_series_id: null,
        google_event_id: null,
        google_etag: null,
        created_at: "2026-09-09T00:00:00.000Z",
        updated_at: "2026-09-09T00:00:00.000Z",
      },
    ];

    const row = makeRow();
    renderTaskNode(row);

    const subtaskCheckbox = screen.getByTestId(
      "task-node-subtask-toggle-subtask-1",
    );
    fireEvent.click(subtaskCheckbox);

    await waitFor(() => {
      expect(toggleFn).toHaveBeenCalledWith(expect.anything(), {
        id: "subtask-1",
        is_completed: true,
      });
    });
  });
});
