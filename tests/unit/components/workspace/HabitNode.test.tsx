import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { format } from "date-fns";

/**
 * The habit node's dual-surface contract (ticket 06, spec User Stories
 * 8/30): the node shows today's live done state matching the habits page,
 * and check-in from the node performs the same write the habits page
 * performs — the same `useMarkHabitComplete` hook, same idempotent
 * value-set entry semantics — so both surfaces reflect it immediately,
 * in both directions. Guest mode with the real mockStore write path; the
 * write is observed through the store (the externally visible truth),
 * never cache internals.
 */

const removeNode = vi.hoisted(() => vi.fn(async () => {}));
const busEvents = vi.hoisted(() => ({ events: [] as unknown[] }));

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
    addNode: vi.fn(),
    updateNodePosition: vi.fn(),
    removeNode: removeNode,
  },
}));

vi.mock("@/lib/events/domain-bus", () => ({
  publishDomainEvent: (event: unknown) => busEvents.events.push(event),
}));

vi.mock("@/lib/telemetry/client", () => ({
  trackTelemetry: vi.fn(),
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

import { workspaceNodeTypes } from "@/components/workspace/node-registry";
import { useHabits } from "@/lib/hooks/useHabits";
import { useMarkHabitComplete } from "@/lib/hooks/useHabitMutations";
import { getLocalDal } from "@/lib/api/local-dal";
import { mockStore } from "@/lib/mock/mock-store";
import type { WorkspaceNode } from "@/lib/types/workspace";

const HABIT_NAME = "Read 20 pages";

/**
 * The habits-page surface: the same list query and the same check-in hook
 * the habits page uses (the HabitCompactRow wiring: value-set on today's
 * entry).
 */
function HabitsPageStandIn() {
  const { data: habits = [] } = useHabits();
  const markComplete = useMarkHabitComplete();
  const todayStr = format(new Date(), "yyyy-MM-dd");
  return (
    <div data-testid="habits-page">
      {habits.map((habit) => {
        const done =
          (habit.entries.find((e) => e.date === todayStr)?.value ?? 0) >= 1;
        return (
          <div key={habit.id} data-testid={`habits-page-row-${habit.id}`}>
            <span>{habit.name}</span>
            <span data-testid={`habits-page-state-${habit.id}`}>
              {done ? "done" : "not-done"}
            </span>
            <button
              type="button"
              data-testid={`habits-page-checkin-${habit.id}`}
              aria-label="Check in habit from habits page"
              onClick={() =>
                markComplete.mutate({
                  habitId: habit.id,
                  date: todayStr,
                  value: done ? 0 : 1,
                })
              }
            />
          </div>
        );
      })}
    </div>
  );
}

function makeNodeRow(habitId: string): WorkspaceNode {
  return {
    id: "habit-node-1",
    workspace_id: "ws-1",
    user_id: "guest",
    kind: "habit",
    entity_type: "habit",
    entity_id: habitId,
    position_x: 0,
    position_y: 0,
    width: 240,
    height: null,
    display_config: null,
    created_at: "2026-09-09T00:00:00.000Z",
    updated_at: "2026-09-09T00:00:00.000Z",
  };
}

function renderHarness(habitId: string) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const HabitNodeBound = workspaceNodeTypes.habit as React.ComponentType<{
    id: string;
    data: { row: WorkspaceNode };
  }>;
  return render(
    <QueryClientProvider client={queryClient}>
      <HabitsPageStandIn />
      <HabitNodeBound id="habit-node-1" data={{ row: makeNodeRow(habitId) }} />
    </QueryClientProvider>,
  );
}

function storedEntryValue(habitId: string, date: string): number | undefined {
  return getLocalDal()
    ?.habits.getById(habitId)
    ?.entries.find((e) => e.date === date)?.value;
}

describe("HabitNode (dual-surface consistency)", () => {
  let habitId: string;

  beforeEach(() => {
    localStorage.clear();
    mockStore.clearData();
    localStorage.setItem("kanso_guest_mode", "true");
    busEvents.events = [];
    removeNode.mockClear();

    const habit = mockStore.addHabit({
      name: HABIT_NAME,
      description: null,
      color: "#10b981",
      icon: "Book",
      archived_at: null,
      start_date: null,
    });
    habitId = habit.id;
  });

  it("both surfaces start on the same not-done state for today", async () => {
    renderHarness(habitId);

    // The name renders on both surfaces: the habits-page row and the node.
    await waitFor(() =>
      expect(screen.getAllByText(HABIT_NAME)).toHaveLength(2),
    );
    expect(screen.getByTestId(`habit-node-state-${habitId}`)).toHaveTextContent(
      "not-done",
    );
    expect(
      screen.getByTestId(`habits-page-state-${habitId}`),
    ).toHaveTextContent("not-done");
  });

  it("check-in from the habits page updates the node immediately", async () => {
    renderHarness(habitId);

    // The name renders on both surfaces: the habits-page row and the node.
    await waitFor(() =>
      expect(screen.getAllByText(HABIT_NAME)).toHaveLength(2),
    );
    fireEvent.click(screen.getByTestId(`habits-page-checkin-${habitId}`));

    await waitFor(() =>
      expect(
        screen.getByTestId(`habit-node-state-${habitId}`),
      ).toHaveTextContent("done"),
    );
    expect(
      screen.getByTestId(`habits-page-state-${habitId}`),
    ).toHaveTextContent("done");
  });

  it("check-in from the node performs the same idempotent write; the habits page reflects it immediately", async () => {
    renderHarness(habitId);

    // The name renders on both surfaces: the habits-page row and the node.
    await waitFor(() =>
      expect(screen.getAllByText(HABIT_NAME)).toHaveLength(2),
    );

    // Check in from the node — value-set semantics: today 0 → 1.
    fireEvent.click(screen.getByTestId(`habit-node-checkin-${habitId}`));

    await waitFor(() =>
      expect(
        screen.getByTestId(`habits-page-state-${habitId}`),
      ).toHaveTextContent("done"),
    );
    expect(screen.getByTestId(`habit-node-state-${habitId}`)).toHaveTextContent(
      "done",
    );

    // The write itself: the same guest write path the habits page hits — which
    // resolves through the local DAL, so that is where the entry lands.
    const todayStr = format(new Date(), "yyyy-MM-dd");
    expect(storedEntryValue(habitId, todayStr)).toBe(1);

    // Un-check from the node — the same idempotent semantics in reverse.
    fireEvent.click(screen.getByTestId(`habit-node-checkin-${habitId}`));
    await waitFor(() =>
      expect(
        screen.getByTestId(`habits-page-state-${habitId}`),
      ).toHaveTextContent("not-done"),
    );
    expect(storedEntryValue(habitId, todayStr)).toBe(0);
  });

  it("removing the node never touches the habit", async () => {
    renderHarness(habitId);

    // The name renders on both surfaces: the habits-page row and the node.
    await waitFor(() =>
      expect(screen.getAllByText(HABIT_NAME)).toHaveLength(2),
    );
    fireEvent.click(screen.getByTestId(`habit-node-remove-${habitId}`));

    await waitFor(() => {
      expect(removeNode).toHaveBeenCalledWith("habit-node-1");
      expect(busEvents.events).toContainEqual({
        type: "node.removed",
        workspaceId: "ws-1",
        nodeId: "habit-node-1",
      });
    });
    // The habit itself is untouched.
    expect(mockStore.getHabits().map((h) => h.id)).toEqual([habitId]);
  });
});
