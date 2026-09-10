import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * The calendar-event node's contract (ticket 06, spec User Story 9): the
 * node renders the event's title and time through the same
 * calendar-events query the calendar reads, and is display-only — on
 * Guest, where calendar writes are degraded by existing design, the node
 * follows that degradation and invents no new guest write behavior (its
 * only affordance is removing the node, a layout write). Removing the
 * node never touches the event.
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
import { mockStore } from "@/lib/mock/mock-store";
import type { WorkspaceNode } from "@/lib/types/workspace";

const EVENT_TITLE = "Product review";
const ALL_DAY_TITLE = "Deep work day";

function makeNodeRow(entityId: string): WorkspaceNode {
  return {
    id: "event-node-1",
    workspace_id: "ws-1",
    user_id: "guest",
    kind: "event",
    entity_type: "event",
    entity_id: entityId,
    position_x: 0,
    position_y: 0,
    width: 240,
    height: null,
    display_config: null,
    created_at: "2026-09-09T00:00:00.000Z",
    updated_at: "2026-09-09T00:00:00.000Z",
  };
}

function renderEventNode(entityId: string) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const EventNodeBound = workspaceNodeTypes.event as React.ComponentType<{
    id: string;
    data: { row: WorkspaceNode };
  }>;
  return render(
    <QueryClientProvider client={queryClient}>
      <EventNodeBound id="event-node-1" data={{ row: makeNodeRow(entityId) }} />
    </QueryClientProvider>,
  );
}

describe("EventNode", () => {
  let timedEventId: string;
  let allDayEventId: string;

  beforeEach(() => {
    localStorage.clear();
    mockStore.clearData();
    localStorage.setItem("kanso_guest_mode", "true");
    busEvents.events = [];
    removeNode.mockClear();

    const timed = mockStore.addEvent({
      title: EVENT_TITLE,
      description: null,
      location: null,
      start_time: "2026-09-09T14:30:00",
      end_time: "2026-09-09T15:30:00",
      all_day: false,
      color: "#3b82f6",
      category: null,
      recurrence_rule: null,
      remote_id: null,
      remote_calendar_id: null,
      etag: null,
      ics_uid: null,
      sync_state: null,
      is_archived: false,
      metadata: {},
    });
    timedEventId = timed.id;

    const allDay = mockStore.addEvent({
      title: ALL_DAY_TITLE,
      description: null,
      location: null,
      start_time: "2026-09-10T00:00:00",
      end_time: "2026-09-10T23:59:59",
      all_day: true,
      color: "#10b981",
      category: null,
      recurrence_rule: null,
      remote_id: null,
      remote_calendar_id: null,
      etag: null,
      ics_uid: null,
      sync_state: null,
      is_archived: false,
      metadata: {},
    });
    allDayEventId = allDay.id;
  });

  it("renders the event's title and time from the same queries the calendar reads", async () => {
    renderEventNode(timedEventId);

    await waitFor(() =>
      expect(screen.getByText(EVENT_TITLE)).toBeInTheDocument(),
    );
    // A time is shown for a timed event (the user's time-format setting).
    expect(
      screen.getByTestId(`event-node-state-${timedEventId}`),
    ).toHaveTextContent("event");
    expect(document.body.textContent).toMatch(/\d{1,2}:\d{2}/);
  });

  it("renders an all-day event with the all-day label instead of a time", async () => {
    renderEventNode(allDayEventId);

    await waitFor(() =>
      expect(screen.getByText(ALL_DAY_TITLE)).toBeInTheDocument(),
    );
    expect(document.body.textContent).toContain("All day");
  });

  it("is display-only: the node's only control is removing the node — no guest write behavior invented", async () => {
    renderEventNode(timedEventId);

    await waitFor(() =>
      expect(screen.getByText(EVENT_TITLE)).toBeInTheDocument(),
    );
    const node = screen.getByTestId(`event-node-${timedEventId}`);
    const buttons = node.querySelectorAll("button");
    // Exactly one affordance: remove the node (a layout write).
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAccessibleName("Remove event node");
  });

  it("removing the node never touches the event", async () => {
    renderEventNode(timedEventId);

    await waitFor(() =>
      expect(screen.getByText(EVENT_TITLE)).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId(`event-node-remove-${timedEventId}`));

    await waitFor(() => {
      expect(removeNode).toHaveBeenCalledWith("event-node-1");
      expect(busEvents.events).toContainEqual({
        type: "node.removed",
        workspaceId: "ws-1",
        nodeId: "event-node-1",
      });
    });
    // The events themselves are untouched.
    expect(
      mockStore
        .getEvents()
        .map((e) => e.title)
        .sort(),
    ).toEqual([ALL_DAY_TITLE, EVENT_TITLE].sort());
  });

  it("renders the orphan placeholder when the event no longer resolves", async () => {
    renderEventNode("event-that-was-deleted");

    // The orphan body names what was lost (ADR 0019's honest degradation).
    await waitFor(() =>
      expect(
        screen.getByText("Event deleted — this node is orphaned."),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByText("Dismiss removes the node; nothing else changes."),
    ).toBeInTheDocument();

    // Dismiss stays the only affordance: the remove control, nothing else.
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAccessibleName("Remove event node");
  });
});
