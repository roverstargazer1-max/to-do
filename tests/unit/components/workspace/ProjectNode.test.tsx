import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProjectNode } from "@/components/workspace/ProjectNode";
import { getNodeKindSpec } from "@/components/workspace/node-registry";
import type { WorkspaceNode } from "@/lib/types/workspace";
import type { Project, Task } from "@/lib/types/task";
import type { ToggleTaskResult } from "@/lib/commands/task";
import type { NodeKindSpec } from "@/components/workspace/node-registry";

const removeNodeFn = vi.hoisted(() => vi.fn(async () => {}));
const toggleFn = vi.hoisted(() =>
  vi.fn(async () => ({}) as unknown as ToggleTaskResult),
);

vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => ({ isGuestMode: true }),
}));

vi.mock("@/lib/commands/node", () => ({
  nodeCommands: {
    add: vi.fn(),
    remove: removeNodeFn,
    updatePosition: vi.fn(),
    updateSize: vi.fn(),
  },
}));

vi.mock("@/lib/commands/task", () => ({
  taskCommands: {
    toggle: toggleFn,
    create: vi.fn(),
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

const mockData = vi.hoisted(() => ({
  projects: [] as Project[],
  tasks: [] as Task[],
}));

vi.mock("@/lib/hooks/useProjects", () => ({
  useProjects: () => ({ data: mockData.projects, isLoading: false }),
}));

vi.mock("@/lib/hooks/useTasks", () => ({
  useTasks: () => ({ data: mockData.tasks, isLoading: false }),
}));

const makeProjectRow = (
  overrides: Partial<WorkspaceNode> = {},
): WorkspaceNode => ({
  id: "node-p1",
  workspace_id: "ws-1",
  user_id: "guest",
  kind: "project",
  entity_type: "project",
  entity_id: "project-1",
  position_x: 0,
  position_y: 0,
  width: 280,
  height: null,
  display_config: null,
  created_at: "2026-09-09T00:00:00.000Z",
  updated_at: "2026-09-09T00:00:00.000Z",
  ...overrides,
});

function renderProjectNode(row: WorkspaceNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const spec = getNodeKindSpec("project")!;

  return render(
    <QueryClientProvider client={queryClient}>
      <ProjectNode
        id={row.id}
        data={{ row }}
        spec={spec as unknown as NodeKindSpec}
      />
    </QueryClientProvider>,
  );
}

describe("ProjectNode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockData.projects = [
      {
        id: "project-1",
        user_id: "guest",
        name: "Website Redesign",
        color: "#10b981",
        view_style: "list",
        is_inbox: false,
        is_archived: false,
        created_at: "2026-09-09T00:00:00.000Z",
        updated_at: "2026-09-09T00:00:00.000Z",
      },
    ];
    mockData.tasks = [
      {
        id: "task-1",
        user_id: "guest",
        project_id: "project-1",
        parent_id: null,
        content: "Design mockups",
        description: null,
        priority: 1,
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
        id: "task-2",
        user_id: "guest",
        project_id: "project-1",
        parent_id: null,
        content: "Initial setup",
        description: null,
        priority: 2,
        due_date: null,
        do_date: null,
        is_evening: false,
        is_completed: true,
        completed_at: "2026-09-09T10:00:00.000Z",
        day_order: 1,
        recurrence: null,
        recurring_series_id: null,
        google_event_id: null,
        google_etag: null,
        created_at: "2026-09-09T00:00:00.000Z",
        updated_at: "2026-09-09T00:00:00.000Z",
      },
    ];
  });

  it("renders project title, completion ratio and tasks", () => {
    const row = makeProjectRow();
    renderProjectNode(row);

    expect(screen.getByText("Website Redesign")).toBeInTheDocument();
    expect(
      screen.getByText(/1\/2 (completed|任务完成) \(50%\)/),
    ).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText("Design mockups")).toBeInTheDocument();
  });

  it("toggles task completion when clicking task checkbox in project card", async () => {
    const row = makeProjectRow();
    renderProjectNode(row);

    const checkbox = screen.getByTestId("project-task-toggle-task-1");
    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(toggleFn).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          id: "task-1",
          is_completed: true,
        }),
      );
    });
  });

  it("dispatches workspace:open-task-detail when clicking task text", () => {
    const row = makeProjectRow();
    renderProjectNode(row);

    const eventSpy = vi.fn();
    window.addEventListener("workspace:open-task-detail", eventSpy);

    fireEvent.click(screen.getByText("Design mockups"));

    expect(eventSpy).toHaveBeenCalledTimes(1);
    const detail = (eventSpy.mock.calls[0][0] as CustomEvent).detail;
    expect(detail).toEqual({ taskId: "task-1" });

    window.removeEventListener("workspace:open-task-detail", eventSpy);
  });

  it("renders orphan body when project does not exist", () => {
    const row = makeProjectRow({ entity_id: "missing-project-id" });
    renderProjectNode(row);

    expect(screen.getByTestId("node-orphan-body")).toBeInTheDocument();
  });

  it("calls nodeCommands.remove when clicking remove button", async () => {
    const row = makeProjectRow();
    renderProjectNode(row);

    const removeBtn = screen.getByTestId("project-node-remove-project-1");
    fireEvent.click(removeBtn);

    await waitFor(() => {
      expect(removeNodeFn).toHaveBeenCalledWith(expect.anything(), row);
    });
  });
});
