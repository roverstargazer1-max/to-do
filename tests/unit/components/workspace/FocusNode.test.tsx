import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * The focus node's contract (ticket 07, ADR 0020): a projection of the
 * timer singleton, never a second timer. It reads the same store every
 * timer surface reads, its countdown agrees with the focus page's
 * sub-second (both derive from the server-anchored deadline machinery),
 * and its start/pause/stop call the same provider actions the focus page
 * calls — so task association behaves identically. The timer is not
 * command-ified: no timer Domain Events, ever. Removing the node is a
 * layout write and never touches the timer. Guest mode throughout — the
 * timer store is local, so there is no degradation path to test around.
 *
 * Assertions look only at externally visible behavior — what each surface
 * renders — never store internals.
 */

const removeNode = vi.hoisted(() => vi.fn(async () => {}));
const busEvents = vi.hoisted(() => ({ events: [] as unknown[] }));

// A STABLE supabase client mock: one object identity for the whole suite.
// The real AuthProvider calls createClient() on every render and keys its
// session effect on `supabase.auth` — a fresh object per call would re-run
// that effect on every render, and its setUser(makeGuestUser()) (a new
// object each time) would re-render the provider in a self-sustaining loop.
// The loop tears down and re-arms the timer interval every frame, so it can
// never reach its first tick. One stable identity, no loop, real ticks.
const supabaseMock = vi.hoisted(() => ({
  auth: {
    getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    onAuthStateChange: vi.fn(() => ({
      data: { subscription: { unsubscribe: vi.fn() } },
    })),
  },
  from: vi.fn(),
  rpc: vi.fn(),
  channel: vi.fn(),
  removeChannel: vi.fn(),
}));

// The real AuthProvider wraps the tree (guest mode via initialIsGuest),
// like the consistency harness — only its supabase session plumbing is
// mocked away.

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

vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(() => supabaseMock),
}));

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/"),
}));

// Timer side-effect modules are mocked: these tests exercise state flow,
// not audio, notifications, haptics, or telemetry plumbing.
vi.mock("@/lib/hooks/useFocusSounds", () => ({
  useFocusSounds: vi.fn(() => ({ play: vi.fn() })),
}));

vi.mock("@/lib/hooks/usePushNotifications", () => ({
  usePushNotifications: vi.fn(() => ({
    showNotification: vi.fn(),
    permission: "denied",
    isSupported: false,
  })),
}));

vi.mock("@/lib/hooks/useHaptic", () => ({
  useHaptic: vi.fn(() => ({ trigger: vi.fn(), isPhone: false })),
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

vi.mock("@/lib/telemetry/client", () => ({
  trackTelemetry: vi.fn(),
}));

import { FocusNode } from "@/components/workspace/FocusNode";
import { getNodeKindSpec } from "@/components/workspace/node-registry";
import { TimerProvider, useTimer } from "@/components/TimerProvider";
import { AuthProvider } from "@/components/AuthProvider";
import { useTimerStore } from "@/lib/store/timerStore";
import { setServerOffset } from "@/lib/store/serverClock";
import { mockStore } from "@/lib/mock/mock-store";
import type { WorkspaceNode } from "@/lib/types/workspace";
import type { TimerState } from "@/lib/types/timer";

const IDLE_TIMER_STATE: TimerState = {
  mode: "focus",
  isRunning: false,
  remainingSeconds: 1500,
  completedSessions: 0,
  activeTaskId: null,
  endsAt: null,
  sourceDeviceId: null,
};

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs
    .toString()
    .padStart(2, "0")}`;
}

/**
 * The focus-page surface: the same provider hook the focus page reads, with
 * its countdown and task association rendered — the visible truth to agree
 * with.
 */
function FocusPageStandIn() {
  const { state, start, pause, stop } = useTimer();
  return (
    <div data-testid="focus-page">
      <span data-testid="focus-page-timer">
        {state.isRunning ? "running" : "paused"}
      </span>
      <span data-testid="focus-page-countdown">
        {formatTime(state.remainingSeconds)}
      </span>
      <span data-testid="focus-page-task">{state.activeTaskId ?? "none"}</span>
      <button
        type="button"
        data-testid="focus-page-start"
        aria-label="Start focus"
        onClick={() => void start()}
      />
      <button
        type="button"
        data-testid="focus-page-pause"
        aria-label="Pause focus"
        onClick={pause}
      />
      <button
        type="button"
        data-testid="focus-page-stop"
        aria-label="Stop focus"
        onClick={stop}
      />
    </div>
  );
}

const FOCUS_NODE_ROW: WorkspaceNode = {
  id: "focus-node-1",
  workspace_id: "ws-1",
  user_id: "guest",
  kind: "focus",
  entity_type: null,
  entity_id: null,
  position_x: 0,
  position_y: 0,
  width: 220,
  height: null,
  display_config: null,
  created_at: "2026-09-09T00:00:00.000Z",
  updated_at: "2026-09-09T00:00:00.000Z",
};

function FocusNodeSurface() {
  const focusSpec = getNodeKindSpec("focus")!;
  return (
    <FocusNode
      id={FOCUS_NODE_ROW.id}
      data={{ row: FOCUS_NODE_ROW }}
      spec={focusSpec}
    />
  );
}

function renderSurfaces() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider initialIsGuest={true}>
        <TimerProvider>
          <FocusPageStandIn />
          <FocusNodeSurface />
        </TimerProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("FocusNode (timer singleton projection)", () => {
  beforeEach(() => {
    localStorage.clear();
    mockStore.clearData();
    localStorage.setItem("kanso_guest_mode", "true");
    setServerOffset(0);
    useTimerStore.setState({ state: { ...IDLE_TIMER_STATE } });
    busEvents.events = [];
    removeNode.mockClear();
  });

  it("renders the singleton's projection: paused, the current countdown, start/stop controls", () => {
    renderSurfaces();

    expect(screen.getByTestId("focus-node-timer")).toHaveTextContent("paused");
    expect(screen.getByTestId("focus-node-countdown")).toHaveTextContent(
      "25:00",
    );
    // Paused: the play affordance, not the pause one.
    expect(screen.getByTestId("focus-node-start")).toBeInTheDocument();
    expect(screen.queryByTestId("focus-node-pause")).not.toBeInTheDocument();
    expect(screen.getByTestId("focus-node-stop")).toBeInTheDocument();
  });

  it("start from the node runs the singleton; both surfaces agree on the countdown as it ticks (server-anchored)", async () => {
    // A partial session: 90 seconds remain from a prior pause.
    useTimerStore.setState({
      state: { ...IDLE_TIMER_STATE, remainingSeconds: 90 },
    });
    renderSurfaces();

    // Both surfaces show the same remaining time before anything runs.
    expect(screen.getByTestId("focus-node-countdown")).toHaveTextContent(
      "01:30",
    );
    expect(screen.getByTestId("focus-page-countdown")).toHaveTextContent(
      "01:30",
    );

    fireEvent.click(screen.getByTestId("focus-node-start"));

    expect(screen.getByTestId("focus-node-timer")).toHaveTextContent("running");
    expect(screen.getByTestId("focus-page-timer")).toHaveTextContent("running");

    // One real tick (~1s) later, both surfaces move together — one
    // deadline, one store, no drift between the node and the page.
    await waitFor(
      () =>
        expect(screen.getByTestId("focus-node-countdown")).toHaveTextContent(
          "01:29",
        ),
      { timeout: 2500 },
    );
    expect(screen.getByTestId("focus-page-countdown")).toHaveTextContent(
      "01:29",
    );
  });

  it("pause from the node pauses everywhere — one timer, no second state", () => {
    renderSurfaces();

    // Start from the focus page, as scenario 3 does.
    fireEvent.click(screen.getByTestId("focus-page-start"));
    expect(screen.getByTestId("focus-node-timer")).toHaveTextContent("running");

    fireEvent.click(screen.getByTestId("focus-node-pause"));

    expect(screen.getByTestId("focus-node-timer")).toHaveTextContent("paused");
    expect(screen.getByTestId("focus-page-timer")).toHaveTextContent("paused");
    // The countdown freezes on the same remaining time on both surfaces.
    expect(screen.getByTestId("focus-node-countdown")).toHaveTextContent(
      screen.getByTestId("focus-page-countdown").textContent ?? "",
    );
  });

  it("stop from the node resets the session to full duration, like the focus page's stop", () => {
    // A partial session: 5 minutes remain.
    useTimerStore.setState({
      state: { ...IDLE_TIMER_STATE, remainingSeconds: 300 },
    });
    renderSurfaces();
    expect(screen.getByTestId("focus-node-countdown")).toHaveTextContent(
      "05:00",
    );

    fireEvent.click(screen.getByTestId("focus-node-start"));
    fireEvent.click(screen.getByTestId("focus-node-stop"));

    expect(screen.getByTestId("focus-node-timer")).toHaveTextContent("paused");
    expect(screen.getByTestId("focus-node-countdown")).toHaveTextContent(
      "25:00",
    );
    expect(screen.getByTestId("focus-page-countdown")).toHaveTextContent(
      "25:00",
    );
  });

  it("task association survives node controls: resuming from the node keeps the active task", () => {
    // A paused session associated with a task, as the focus page leaves it.
    useTimerStore.setState({
      state: {
        ...IDLE_TIMER_STATE,
        remainingSeconds: 300,
        activeTaskId: "task-42",
      },
    });
    renderSurfaces();
    expect(screen.getByTestId("focus-page-task")).toHaveTextContent("task-42");

    // Resume from the node — no task argument, so the store falls back to
    // the active task, exactly as resuming from the focus page does.
    fireEvent.click(screen.getByTestId("focus-node-start"));

    expect(screen.getByTestId("focus-page-task")).toHaveTextContent("task-42");
    expect(screen.getByTestId("focus-node-timer")).toHaveTextContent("running");

    // Stop clears the association, as the focus page's stop does.
    fireEvent.click(screen.getByTestId("focus-node-stop"));
    expect(screen.getByTestId("focus-page-task")).toHaveTextContent("none");
  });

  it("publishes no timer Domain Events — the timer is not command-ified", () => {
    renderSurfaces();

    fireEvent.click(screen.getByTestId("focus-node-start"));
    fireEvent.click(screen.getByTestId("focus-node-pause"));
    fireEvent.click(screen.getByTestId("focus-node-start"));
    fireEvent.click(screen.getByTestId("focus-node-stop"));

    // No node row was written, and no timer event exists to publish.
    expect(busEvents.events).toEqual([]);
  });

  it("removing the node never touches the timer", async () => {
    renderSurfaces();

    // The timer is running when the node is removed.
    fireEvent.click(screen.getByTestId("focus-page-start"));
    expect(screen.getByTestId("focus-node-timer")).toHaveTextContent("running");

    fireEvent.click(screen.getByTestId("focus-node-remove"));

    await vi.waitFor(() => {
      expect(removeNode).toHaveBeenCalledWith(FOCUS_NODE_ROW.id);
      expect(busEvents.events).toContainEqual({
        type: "node.removed",
        workspaceId: "ws-1",
        nodeId: FOCUS_NODE_ROW.id,
      });
    });
    // The singleton keeps running — removing a lens stops nothing.
    expect(screen.getByTestId("focus-page-timer")).toHaveTextContent("running");
  });
});
