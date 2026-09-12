import { render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { describe, expect, it, beforeEach, vi } from "vitest";
import TaskList from "@/components/tasks/TaskList";
import type { Task } from "@/lib/types/task";

const storeState = vi.hoisted(() => ({ tasks: [] as Task[] }));

vi.mock("@/lib/mock/mock-store", () => ({
  mockStore: {
    getTasks: () => storeState.tasks,
    getProjects: () => [],
    updateTask: (id: string, updates: Partial<Task>) => {
      storeState.tasks = storeState.tasks.map((t) =>
        t.id === id ? { ...t, ...updates } : t,
      );
      return storeState.tasks.find((t) => t.id === id) ?? null;
    },
  },
}));

vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => ({ isGuestMode: true }),
}));

vi.mock("@/components/tasks/TaskListView", () => ({
  TaskListView: ({
    activeTasks,
    eveningTasks,
  }: {
    activeTasks: Task[];
    eveningTasks: Task[];
  }) => (
    <div data-testid="task-list-view">
      <div data-testid="active-count">{activeTasks.length}</div>
      <div data-testid="evening-count">{eveningTasks.length}</div>
    </div>
  ),
}));

vi.mock("@/components/tasks/TaskBoard", () => ({
  TaskBoard: () => <div data-testid="task-board-view" />,
}));

vi.mock("@/components/tasks/TaskGhost", () => ({
  TaskGhost: () => <div data-testid="task-ghost" />,
}));

vi.mock("@/components/tasks/TaskSheet", () => ({
  default: () => null,
}));

vi.mock("@/components/TaskActionsProvider", () => ({
  useTaskActions: () => ({ openAddTask: vi.fn(), isAddTaskOpen: false }),
}));

vi.mock("@/components/habits/HabitActionsProvider", () => ({
  useHabitActions: () => ({ openAddHabit: vi.fn(), isHabitSheetOpen: false }),
}));

vi.mock("@/components/ProjectActionsProvider", () => ({
  useProjectActions: () => ({
    openCreateProject: vi.fn(),
    isCreateProjectOpen: false,
  }),
}));

vi.mock("@/lib/calendar/store", () => ({
  useCalendarStore: () => ({
    openCreateEvent: vi.fn(),
    isCreateEventOpen: false,
  }),
}));

vi.mock("@/lib/hooks/useHaptic", () => ({
  useHaptic: () => ({ trigger: vi.fn() }),
}));

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    user_id: "guest",
    project_id: null,
    parent_id: null,
    content: "Test Task",
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
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("TaskList Empty State Guard", () => {
  beforeEach(() => {
    storeState.tasks = [];
    localStorage.clear();
    localStorage.setItem("kanso_guest_mode", "true");
  });

  it("does not show EmptyState when only evening tasks exist", async () => {
    storeState.tasks = [
      makeTask({
        id: "task-evening-1",
        content: "Evening Task",
        is_evening: true,
      }),
    ];

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <TaskList />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.queryByTestId("task-list-view")).not.toBeNull();
    });

    expect(screen.getByTestId("evening-count").textContent).toBe("1");
    expect(screen.getByTestId("active-count").textContent).toBe("0");
    expect(
      screen.queryByRole("heading", { name: /No tasks yet|还没有任务/ }),
    ).toBeNull();
  });

  it("shows EmptyState only when all active, evening, and completed lists are empty", async () => {
    storeState.tasks = [];

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <TaskList />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /No tasks yet|还没有任务/ }),
      ).toBeDefined();
    });

    expect(screen.queryByTestId("task-list-view")).toBeNull();
  });

  it("does not show EmptyState when only completed tasks exist", async () => {
    storeState.tasks = [
      makeTask({
        id: "task-completed-1",
        content: "Done Task",
        is_completed: true,
        completed_at: new Date().toISOString(),
      }),
    ];

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <TaskList />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.queryByTestId("task-list-view")).not.toBeNull();
    });

    expect(
      screen.queryByRole("heading", { name: /No tasks yet|还没有任务/ }),
    ).toBeNull();
  });

  it("does not show EmptyState when tasks exist in groups", async () => {
    storeState.tasks = [
      makeTask({
        id: "task-p1-1",
        content: "P1 Task",
        priority: 1,
        is_evening: false,
      }),
    ];

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <TaskList groupBy="priority" />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.queryByTestId("task-list-view")).not.toBeNull();
    });

    expect(
      screen.queryByRole("heading", { name: /No tasks yet|还没有任务/ }),
    ).toBeNull();
  });
});
