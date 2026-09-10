/**
 * Dual-surface consistency harness (Workspace feature, ticket 01).
 *
 * DELIBERATE CONVENTION DEVIATION: this directory does not mirror `src/`
 * the way the rest of `tests/unit` does. Cross-surface tests assert that two
 * simultaneously mounted surfaces agree on externally visible state — there
 * is no single source counterpart to mirror. The deviation is recorded in
 * `.scratch/workspace/spec.md` (Testing Decisions).
 *
 * Four named scenarios, all inside one shared provider tree (query client,
 * auth, timer provider), guest mode:
 *   1. tasks-page toggle → task-node reader shows completed
 *   2. task-node reader toggle → tasks page shows completed
 *   3. focus-page start → focus-node subscriber shows running
 *   4. focus-node subscriber pause → focus page shows paused
 *
 * The task reading surface is the REAL TaskNode component (swapped in with
 * ticket 05; assertions unchanged since ticket 01) — it reads the same
 * tasks query family and invokes the same `task.toggle` command the tasks
 * page uses. The timer reading surface is the REAL FocusNode (swapped in
 * with ticket 07 the same way; assertions unchanged) — a projection of
 * the timer singleton.
 *
 * Assertions look only at externally visible behavior — what a user can see
 * on each surface — never cache entries or store internals.
 */
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { useTasks } from "@/lib/hooks/useTasks";
import { useToggleTask } from "@/lib/hooks/useTaskMutations";
import { TaskNode } from "@/components/workspace/TaskNode";
import { FocusNode } from "@/components/workspace/FocusNode";
import { getNodeKindSpec } from "@/components/workspace/node-registry";
import { subscribeToDomainEvents } from "@/lib/events/domain-bus";
import type { DomainEvent } from "@/lib/events/domain-event";
import type { WorkspaceNode } from "@/lib/types/workspace";
import { TimerProvider, useTimer } from "@/components/TimerProvider";
import { AuthProvider } from "@/components/AuthProvider";
import { useTimerStore } from "@/lib/store/timerStore";
import { setServerOffset } from "@/lib/store/serverClock";
import { mockStore } from "@/lib/mock/mock-store";
import type { TimerState } from "@/lib/types/timer";

// A STABLE supabase client mock: one object identity for the whole suite.
// The real AuthProvider calls createClient() on every render and keys its
// session effect on `supabase.auth` — a fresh object per call re-runs that
// effect on every render, and its setUser(makeGuestUser()) (a new object each
// time) then re-renders the provider in a self-sustaining loop, tearing down
// and re-arming the timer interval before it can ever tick. One stable
// identity, no loop, real ticks.
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

vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(() => supabaseMock),
}));

// The workspace mutation service is mocked for the orphan-lifecycle tests:
// dismiss routes through `nodeCommands.remove`, whose service call is
// replaced so the test asserts the command's externally visible contract
// (the row id it removes, the event it publishes) — not storage plumbing.
const removeNode = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/lib/mutations/workspace", () => ({
  workspaceMutations: {
    list: vi.fn(async () => []),
    create: vi.fn(),
    rename: vi.fn(),
    delete: vi.fn(),
    listNodes: vi.fn(async () => []),
    addNode: vi.fn(),
    updateNodePosition: vi.fn(),
    removeNode: removeNode,
  },
}));

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/"),
}));

// Timer side-effect modules are mocked: the harness exercises state flow, not
// audio, notifications, haptics, toasts, or telemetry plumbing.
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

const TASK_ID = "harness-task-1";

const IDLE_TIMER_STATE: TimerState = {
  mode: "focus",
  isRunning: false,
  remainingSeconds: 1500,
  completedSessions: 0,
  activeTaskId: null,
  endsAt: null,
  sourceDeviceId: null,
};

/** Writing surface for task scenarios: the same hooks the tasks page uses. */
function TasksPageStandIn() {
  const { data: tasks = [] } = useTasks();
  const toggle = useToggleTask();
  return (
    <div data-testid="tasks-page">
      {tasks.map((task) => (
        <div key={task.id} data-testid={`tasks-page-row-${task.id}`}>
          <span>{task.content}</span>
          <span data-testid={`tasks-page-state-${task.id}`}>
            {task.is_completed ? "completed" : "active"}
          </span>
          <button
            data-testid={`tasks-page-toggle-${task.id}`}
            aria-label="Toggle task from tasks page"
            onClick={() =>
              toggle.mutate({
                id: task.id,
                is_completed: !task.is_completed,
              })
            }
          />
        </div>
      ))}
    </div>
  );
}

/**
 * The task node surface: the REAL TaskNode (ticket 05) — a live reference
 * rendered through the same tasks query family (the entry that keeps
 * completed tasks visible), whose checkbox invokes the same task command
 * the tasks page uses, routed through the registry binding. Mounted with
 * a minimal node row: only the reference metadata matters.
 */
const HARNESS_TASK_NODE_ROW: WorkspaceNode = {
  id: "harness-node-1",
  workspace_id: "harness-workspace",
  user_id: "guest",
  kind: "task",
  entity_type: "task",
  entity_id: TASK_ID,
  position_x: 0,
  position_y: 0,
  width: null,
  height: null,
  display_config: null,
  created_at: "2026-09-09T00:00:00.000Z",
  updated_at: "2026-09-09T00:00:00.000Z",
};

function TaskNodeSurface() {
  const taskSpec = getNodeKindSpec("task")!;
  return (
    <TaskNode
      id={HARNESS_TASK_NODE_ROW.id}
      data={{ row: HARNESS_TASK_NODE_ROW }}
      spec={taskSpec}
    />
  );
}

/** Writing surface for timer scenarios: the same provider the focus page uses. */
function FocusPageStandIn() {
  const { state, start } = useTimer();
  return (
    <div data-testid="focus-page">
      <span data-testid="focus-page-timer">
        {state.isRunning ? "running" : "paused"}
      </span>
      <button
        data-testid="focus-page-start"
        aria-label="Start focus"
        onClick={() => void start()}
      />
    </div>
  );
}

/**
 * The timer reading surface: the REAL FocusNode (ticket 07) — a projection
 * of the timer singleton reading the same store every timer surface reads,
 * whose pause calls the same provider action the focus page calls, routed
 * through the registry binding. Mounted with a minimal node row: the
 * focus kind carries no entity reference.
 */
const HARNESS_FOCUS_NODE_ROW: WorkspaceNode = {
  id: "harness-focus-node-1",
  workspace_id: "harness-workspace",
  user_id: "guest",
  kind: "focus",
  entity_type: null,
  entity_id: null,
  position_x: 0,
  position_y: 0,
  width: null,
  height: null,
  display_config: null,
  created_at: "2026-09-09T00:00:00.000Z",
  updated_at: "2026-09-09T00:00:00.000Z",
};

function FocusNodeSurface() {
  const focusSpec = getNodeKindSpec("focus")!;
  return (
    <FocusNode
      id={HARNESS_FOCUS_NODE_ROW.id}
      data={{ row: HARNESS_FOCUS_NODE_ROW }}
      spec={focusSpec}
    />
  );
}

/**
 * The shared provider tree: one query client, one auth context, one timer
 * provider — the app shell a workspace route will mount inside.
 */
let harnessQueryClient: QueryClient | null = null;

function renderHarness() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  harnessQueryClient = queryClient;

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider initialIsGuest={true}>
        <TimerProvider>
          <TasksPageStandIn />
          <TaskNodeSurface />
          <FocusPageStandIn />
          <FocusNodeSurface />
        </TimerProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("dual-surface consistency harness", () => {
  beforeEach(() => {
    localStorage.clear();
    mockStore.clearData();
    localStorage.setItem("kanso_guest_mode", "true");
    setServerOffset(0);
    useTimerStore.setState({ state: { ...IDLE_TIMER_STATE } });

    mockStore.addTask({
      id: TASK_ID,
      content: "Harness task",
      is_completed: false,
    });
  });

  it("scenario 1: tasks-page toggle → task-node reader shows completed", async () => {
    renderHarness();

    // Both surfaces start on the uncompleted task.
    await waitFor(() =>
      expect(
        screen.getByTestId(`tasks-page-state-${TASK_ID}`),
      ).toHaveTextContent("active"),
    );
    await waitFor(() =>
      expect(
        screen.getByTestId(`task-node-state-${TASK_ID}`),
      ).toHaveTextContent("active"),
    );

    fireEvent.click(screen.getByTestId(`tasks-page-toggle-${TASK_ID}`));

    // The reading surface — mounted elsewhere in the same tree — now shows
    // the completed state.
    await waitFor(() =>
      expect(
        screen.getByTestId(`task-node-state-${TASK_ID}`),
      ).toHaveTextContent("completed"),
    );
    expect(screen.getByTestId(`tasks-page-state-${TASK_ID}`)).toHaveTextContent(
      "completed",
    );
  });

  it("scenario 2: task-node reader toggle → tasks page shows completed", async () => {
    renderHarness();

    await waitFor(() =>
      expect(
        screen.getByTestId(`tasks-page-state-${TASK_ID}`),
      ).toHaveTextContent("active"),
    );
    await waitFor(() =>
      expect(
        screen.getByTestId(`task-node-state-${TASK_ID}`),
      ).toHaveTextContent("active"),
    );

    fireEvent.click(screen.getByTestId(`task-node-toggle-${TASK_ID}`));

    // The tasks page shows the state the node wrote.
    await waitFor(() =>
      expect(
        screen.getByTestId(`tasks-page-state-${TASK_ID}`),
      ).toHaveTextContent("completed"),
    );
    expect(screen.getByTestId(`task-node-state-${TASK_ID}`)).toHaveTextContent(
      "completed",
    );
  });

  it("scenario 3: focus-page start → focus-node subscriber shows running", async () => {
    renderHarness();

    await waitFor(() =>
      expect(screen.getByTestId("focus-node-timer")).toHaveTextContent(
        "paused",
      ),
    );

    fireEvent.click(screen.getByTestId("focus-page-start"));

    // The subscriber — reading the timer store singleton — shows running.
    await waitFor(() =>
      expect(screen.getByTestId("focus-node-timer")).toHaveTextContent(
        "running",
      ),
    );
    expect(screen.getByTestId("focus-page-timer")).toHaveTextContent("running");
  });

  it("scenario 4: focus-node subscriber pause → focus page shows paused", async () => {
    renderHarness();

    // Start from the focus page so the timer is running first.
    fireEvent.click(screen.getByTestId("focus-page-start"));
    await waitFor(() =>
      expect(screen.getByTestId("focus-node-timer")).toHaveTextContent(
        "running",
      ),
    );

    fireEvent.click(screen.getByTestId("focus-node-pause"));

    // The focus page shows the state the node wrote — one timer, everywhere.
    await waitFor(() =>
      expect(screen.getByTestId("focus-page-timer")).toHaveTextContent(
        "paused",
      ),
    );
    expect(screen.getByTestId("focus-node-timer")).toHaveTextContent("paused");
  });
});

/**
 * Orphan lifecycle (ticket 08, ADR 0019) on the task surface: a delete the
 * command layer never saw (another device, Backup restore pruning, the
 * calendar sync engine) surfaces as a clearly labelled placeholder whose
 * only affordance is dismiss (node.remove) — and an entity that comes back
 * revives the node on the next fetch, with no reconciliation code anywhere.
 */
describe("orphan lifecycle (ticket 08)", () => {
  let events: DomainEvent[];
  let unsubscribe: () => void;

  beforeEach(() => {
    // The same store seeding the harness describe performs — this describe is
    // its sibling, not its child, so its tests seed for themselves: a
    // deterministic guest store with the referenced task present, or every
    // first assertion below rides on whatever the previous test left behind.
    localStorage.clear();
    mockStore.clearData();
    localStorage.setItem("kanso_guest_mode", "true");
    setServerOffset(0);
    useTimerStore.setState({ state: { ...IDLE_TIMER_STATE } });
    mockStore.addTask({
      id: TASK_ID,
      content: "Harness task",
      is_completed: false,
    });

    events = [];
    unsubscribe = subscribeToDomainEvents((event) => events.push(event));
    removeNode.mockClear();
  });

  afterEach(() => {
    unsubscribe();
  });

  /** Simulates the next entity fetch (any write path invalidates this family). */
  const refetchTasks = async () => {
    await harnessQueryClient?.invalidateQueries({ queryKey: ["tasks"] });
  };

  it("an entity query miss renders the orphan placeholder; dismiss removes the node row and nothing else", async () => {
    renderHarness();
    await waitFor(() =>
      expect(
        screen.getByTestId(`task-node-state-${TASK_ID}`),
      ).toHaveTextContent("active"),
    );

    // The entity disappears outside the command layer (another device's
    // delete): the store no longer resolves it, the next fetch misses.
    mockStore.deleteTask(TASK_ID);
    await refetchTasks();

    await waitFor(() =>
      expect(
        screen.getByTestId(`task-node-state-${TASK_ID}`),
      ).toHaveTextContent("missing"),
    );
    // The placeholder names what was lost, and states the one affordance.
    expect(
      screen.getByText("Task deleted — this node is orphaned."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Dismiss removes the node; nothing else changes."),
    ).toBeInTheDocument();
    // No checkbox in the orphan state — dismiss is the only affordance.
    expect(
      screen.queryByTestId(`task-node-toggle-${TASK_ID}`),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId(`task-node-remove-${TASK_ID}`));

    await waitFor(() => {
      // Dismiss is node.remove: the node row goes, the referenced entity is
      // untouched (it is already gone), and the layout fact publishes.
      expect(removeNode).toHaveBeenCalledWith("harness-node-1");
      expect(events).toContainEqual({
        type: "node.removed",
        workspaceId: "harness-workspace",
        nodeId: "harness-node-1",
      });
    });
  });

  it("the entity returning revives the node on the next fetch — no reconciliation code", async () => {
    renderHarness();
    await waitFor(() =>
      expect(
        screen.getByTestId(`task-node-state-${TASK_ID}`),
      ).toHaveTextContent("active"),
    );

    // Orphan first: the entity query misses after a non-command delete.
    mockStore.deleteTask(TASK_ID);
    await refetchTasks();
    await waitFor(() =>
      expect(
        screen.getByTestId(`task-node-state-${TASK_ID}`),
      ).toHaveTextContent("missing"),
    );

    // The entity comes back — an undone delete on the owning device, or a
    // Backup restore. The node row was never touched, so the very same
    // query that missed now resolves: the live body revives for free.
    mockStore.addTask({
      id: TASK_ID,
      content: "Harness task",
      is_completed: false,
    });
    await refetchTasks();

    await waitFor(() =>
      expect(
        screen.getByTestId(`task-node-state-${TASK_ID}`),
      ).toHaveTextContent("active"),
    );
    // Both surfaces tell the revived story: the tasks page row and the node.
    expect(screen.getAllByText("Harness task")).toHaveLength(2);
  });
});
