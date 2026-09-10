import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * The "place a habit onto the canvas" flow (ticket 06): the picker lists
 * the same habits the habits page reads, and selecting one routes through
 * the habit kind's registry binding — `node.add` with the reference pair
 * and the registry defaults. The habit itself is never touched: the node
 * is a new reference, so re-opening the picker still offers the habit.
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

import { AddHabitNodeDialog } from "@/components/workspace/AddHabitNodeDialog";
import { mockStore } from "@/lib/mock/mock-store";
import type { WorkspaceNode } from "@/lib/types/workspace";

const HABIT_NAME = "Morning run";

function renderDialog(onOpenChange: (open: boolean) => void = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AddHabitNodeDialog
        workspaceId="ws-1"
        position={{ x: 100, y: 200 }}
        open={true}
        onOpenChange={onOpenChange}
      />
    </QueryClientProvider>,
  );
}

describe("AddHabitNodeDialog", () => {
  let habitId: string;

  beforeEach(() => {
    localStorage.clear();
    mockStore.clearData();
    localStorage.setItem("kanso_guest_mode", "true");
    busEvents.events = [];
    addNode.mockClear();
    notifyFn.mockClear();

    const habit = mockStore.addHabit({
      name: HABIT_NAME,
      description: null,
      color: "#10b981",
      icon: "Zap",
      archived_at: null,
      start_date: null,
    });
    habitId = habit.id;
  });

  it("lists the same habits the habits page reads", async () => {
    renderDialog();

    await waitFor(() =>
      expect(screen.getByTestId(`add-habit-option-${habitId}`)).toBeVisible(),
    );
    expect(screen.getByText(HABIT_NAME)).toBeInTheDocument();
  });

  it("selecting a habit places a node through the registry's add binding and never touches the habit", async () => {
    const onOpenChange = vi.fn();
    addNode.mockResolvedValue({
      id: "node-new",
      workspace_id: "ws-1",
      user_id: "guest",
      kind: "habit",
      entity_type: "habit",
      entity_id: habitId,
      position_x: 100,
      position_y: 200,
      width: 240,
      height: null,
      display_config: null,
      created_at: "2026-09-09T00:00:00.000Z",
      updated_at: "2026-09-09T00:00:00.000Z",
    } satisfies WorkspaceNode);
    renderDialog(onOpenChange);

    await waitFor(() =>
      expect(screen.getByTestId(`add-habit-option-${habitId}`)).toBeVisible(),
    );
    fireEvent.click(screen.getByTestId(`add-habit-option-${habitId}`));

    await waitFor(() => {
      expect(addNode).toHaveBeenCalledWith({
        id: expect.any(String),
        workspaceId: "ws-1",
        kind: "habit",
        entityType: "habit",
        entityId: habitId,
        positionX: 100,
        positionY: 200,
        width: 240,
        height: null,
        displayConfig: null,
      });
    });
    expect(busEvents.events).toContainEqual({
      type: "node.added",
      workspaceId: "ws-1",
      nodeId: "node-new",
    });
    expect(notifyFn).toHaveBeenCalledWith("Habit added to canvas");
    expect(onOpenChange).toHaveBeenCalledWith(false);

    // The habit is untouched — the canvas holds references, not copies.
    expect(mockStore.getHabits().map((h) => h.id)).toEqual([habitId]);
  });
});
