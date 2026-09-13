import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

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

import { AddProjectNodeDialog } from "@/components/workspace/AddProjectNodeDialog";
import { mockStore } from "@/lib/mock/mock-store";
import type { WorkspaceNode } from "@/lib/types/workspace";

function renderDialog(
  onOpenChange: (open: boolean) => void = vi.fn(),
  onNodeAdded: (node: WorkspaceNode) => void = vi.fn(),
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AddProjectNodeDialog
        workspaceId="ws-1"
        position={{ x: 100, y: 200 }}
        open={true}
        onOpenChange={onOpenChange}
        onNodeAdded={onNodeAdded}
      />
    </QueryClientProvider>,
  );
}

let projectId = "";

describe("AddProjectNodeDialog", () => {
  beforeEach(() => {
    localStorage.clear();
    mockStore.clearData();
    localStorage.setItem("kanso_guest_mode", "true");
    busEvents.events = [];
    addNode.mockClear();
    notifyFn.mockClear();

    const p = mockStore.addProject({
      name: "Roadmap 2026",
      color: "#6366f1",
      view_style: "list",
      is_inbox: false,
      is_archived: false,
    });
    projectId = p.id;

    mockStore.addTask({
      id: "task-1",
      content: "First project task",
      project_id: projectId,
      is_completed: false,
    });
  });

  it("lists projects including their active task counts", async () => {
    renderDialog();

    await waitFor(() =>
      expect(
        screen.getByTestId(`add-project-option-${projectId}`),
      ).toBeVisible(),
    );
    expect(screen.getByText("Roadmap 2026")).toBeInTheDocument();
    expect(screen.getByText(/1 (active|个待办)/)).toBeInTheDocument();
  });

  it("selecting a project places a node through the registry's add binding", async () => {
    const onOpenChange = vi.fn();
    const onNodeAdded = vi.fn();
    const expectedNode: WorkspaceNode = {
      id: "node-new",
      workspace_id: "ws-1",
      user_id: "guest",
      kind: "project",
      entity_type: "project",
      entity_id: projectId,
      position_x: 100,
      position_y: 200,
      width: 280,
      height: null,
      display_config: null,
      created_at: "2026-09-09T00:00:00.000Z",
      updated_at: "2026-09-09T00:00:00.000Z",
    };
    addNode.mockResolvedValue(expectedNode);
    renderDialog(onOpenChange, onNodeAdded);

    await waitFor(() =>
      expect(
        screen.getByTestId(`add-project-option-${projectId}`),
      ).toBeVisible(),
    );
    fireEvent.click(screen.getByTestId(`add-project-option-${projectId}`));

    await waitFor(() => {
      expect(addNode).toHaveBeenCalledWith({
        id: expect.any(String),
        workspaceId: "ws-1",
        kind: "project",
        entityType: "project",
        entityId: projectId,
        positionX: 100,
        positionY: 200,
        width: 280,
        height: null,
        displayConfig: null,
      });
    });

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onNodeAdded).toHaveBeenCalledWith(expectedNode);
  });
});
