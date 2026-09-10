import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * The "place a calendar event onto the canvas" flow (ticket 06): the
 * picker lists the same events the calendar reads (the dedicated
 * calendar-events query), and selecting one routes through the event
 * kind's registry binding — `node.add` with the reference pair and the
 * registry defaults. The event itself is never touched: the node is a
 * new, display-only reference.
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

import { AddEventNodeDialog } from "@/components/workspace/AddEventNodeDialog";
import { mockStore } from "@/lib/mock/mock-store";
import type { WorkspaceNode } from "@/lib/types/workspace";

const EVENT_TITLE = "Product review";

function renderDialog(onOpenChange: (open: boolean) => void = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AddEventNodeDialog
        workspaceId="ws-1"
        position={{ x: 100, y: 200 }}
        open={true}
        onOpenChange={onOpenChange}
      />
    </QueryClientProvider>,
  );
}

describe("AddEventNodeDialog", () => {
  let eventId: string;

  beforeEach(() => {
    localStorage.clear();
    mockStore.clearData();
    localStorage.setItem("kanso_guest_mode", "true");
    busEvents.events = [];
    addNode.mockClear();
    notifyFn.mockClear();

    const event = mockStore.addEvent({
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
    eventId = event.id;
  });

  it("lists the same events the calendar reads", async () => {
    renderDialog();

    await waitFor(() =>
      expect(screen.getByTestId(`add-event-option-${eventId}`)).toBeVisible(),
    );
    expect(screen.getByText(EVENT_TITLE)).toBeInTheDocument();
  });

  it("selecting an event places a display-only node through the registry's add binding and never touches the event", async () => {
    const onOpenChange = vi.fn();
    addNode.mockResolvedValue({
      id: "node-new",
      workspace_id: "ws-1",
      user_id: "guest",
      kind: "event",
      entity_type: "event",
      entity_id: eventId,
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
      expect(screen.getByTestId(`add-event-option-${eventId}`)).toBeVisible(),
    );
    fireEvent.click(screen.getByTestId(`add-event-option-${eventId}`));

    await waitFor(() => {
      expect(addNode).toHaveBeenCalledWith({
        id: expect.any(String),
        workspaceId: "ws-1",
        kind: "event",
        entityType: "event",
        entityId: eventId,
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
    expect(notifyFn).toHaveBeenCalledWith("Event added to canvas");
    expect(onOpenChange).toHaveBeenCalledWith(false);

    // The event is untouched — the canvas holds references, not copies.
    expect(mockStore.getEvents().map((e) => e.id)).toEqual([eventId]);
  });
});
