/**
 * Unit tests for the Task Domain Commands (tickets 02 + 03). The mutation
 * service is mocked so these tests assert the commands' own write policy —
 * optimistic update, rollback, invalidation, telemetry, toasts, and Domain
 * Event publication — not the service's guest/cloud plumbing (which is
 * unchanged and covered by the hook-level tests against the real service).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { taskCommands } from "@/lib/commands/task";
import { taskKeys } from "@/lib/queries/task-keys";
import { subscribeToDomainEvents } from "@/lib/events/domain-bus";
import type { DomainEvent } from "@/lib/events/domain-event";
import { taskMutations } from "@/lib/mutations/task";
import { trackTelemetry } from "@/lib/telemetry/client";
import { mockStore } from "@/lib/mock/mock-store";
import { useUiStore } from "@/lib/store/uiStore";
import type { Task } from "@/lib/types/task";
import type { Workspace, WorkspaceNode } from "@/lib/types/workspace";

vi.mock("@/lib/mutations/task", () => ({
  taskMutations: {
    create: vi.fn(),
    toggle: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    restore: vi.fn(),
    reorder: vi.fn(),
    clearCompleted: vi.fn(),
    duplicate: vi.fn(),
  },
}));

// The workspace mutation service is mocked: the delete/clearCompleted
// commands run the shared node-cleanup helper (ADR 0019) after their writes
// land, and these tests assert the commands' cleanup policy — which node
// rows go, which stay, what Undo revives — not the service's storage
// plumbing (unchanged, covered by its own tests).
const workspaceMocks = vi.hoisted(() => ({
  list: vi.fn(),
  listNodes: vi.fn(),
  removeNode: vi.fn(),
  addNode: vi.fn(),
}));
vi.mock("@/lib/mutations/workspace", () => ({
  workspaceMutations: workspaceMocks,
}));

vi.mock("@/lib/telemetry/client", () => ({
  trackTelemetry: vi.fn(),
}));

const notifyFn = vi.hoisted(() => {
  const fn = vi.fn();
  return Object.assign(fn, { error: vi.fn() });
});
vi.mock("@/lib/notify", () => ({ notify: notifyFn }));

const makeTask = (id: string, extra: Partial<Task> = {}): Task => ({
  id,
  user_id: "user-1",
  project_id: null,
  parent_id: null,
  content: `Task ${id}`,
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
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  ...extra,
});

const makeWorkspace = (id: string): Workspace => ({
  id,
  user_id: "user-1",
  name: `Workspace ${id}`,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
});

const makeNode = (
  id: string,
  entityType: string | null,
  entityId: string | null,
  extra: Partial<WorkspaceNode> = {},
): WorkspaceNode => ({
  id,
  workspace_id: "ws-1",
  user_id: "user-1",
  kind: entityType ?? "unknown",
  entity_type: entityType,
  entity_id: entityId,
  position_x: 0,
  position_y: 0,
  width: null,
  height: null,
  display_config: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  ...extra,
});

// Reads the onClick handler off the "Undo" action of the most recent
// "Task deleted" toast, so tests can simulate the user clicking Undo.
function getUndoHandler() {
  const call = vi
    .mocked(notifyFn)
    .mock.calls.find(([message]) => message === "Task deleted");
  if (!call) throw new Error("Expected a 'Task deleted' toast to be fired");
  const options = call[1] as {
    action?: { onClick: () => void | Promise<void> };
  };
  if (!options.action) throw new Error("Expected toast to have an action");
  return options.action.onClick;
}

describe("taskCommands", () => {
  let queryClient: QueryClient;
  let events: DomainEvent[];
  let unsubscribe: () => void;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    events = [];
    unsubscribe = subscribeToDomainEvents((event) => events.push(event));
    vi.clearAllMocks();
    localStorage.clear();
    mockStore.clearData();
    useUiStore.getState().setLastUndoAction(null);
    // Default workspace-service state: no workspaces, no nodes — per-test
    // cleanup scenarios override these (resets implementations set by
    // earlier tests, since clearAllMocks only clears call history).
    workspaceMocks.list.mockResolvedValue([]);
    workspaceMocks.listNodes.mockResolvedValue([]);
    workspaceMocks.removeNode.mockResolvedValue(undefined);
    workspaceMocks.addNode.mockResolvedValue(undefined);
  });

  afterEach(() => {
    unsubscribe();
    useUiStore.getState().setLastUndoAction(null);
  });

  describe("toggle", () => {
    it("publishes task.completed with the entity reference when the write lands", async () => {
      const task = makeTask("task-1");
      queryClient.setQueryData(taskKeys.defaultList(false), [task]);
      vi.mocked(taskMutations.toggle).mockResolvedValue({
        task: { ...task, is_completed: true },
      });

      await taskCommands.toggle(
        { queryClient, isGuestMode: false },
        { id: "task-1", is_completed: true },
      );

      // Exact payload: entity reference + nothing else — never a full row.
      expect(events).toEqual([{ type: "task.completed", taskId: "task-1" }]);
    });

    it("publishes task.uncompleted when toggled back to active", async () => {
      const task = makeTask("task-1", { is_completed: true });
      queryClient.setQueryData(taskKeys.defaultList(false), [task]);
      vi.mocked(taskMutations.toggle).mockResolvedValue({ task });

      await taskCommands.toggle(
        { queryClient, isGuestMode: false },
        { id: "task-1", is_completed: false },
      );

      expect(events).toEqual([{ type: "task.uncompleted", taskId: "task-1" }]);
    });

    it("publishes task.created for the recurring instance spawned by a completing toggle", async () => {
      const task = makeTask("task-1");
      const spawned = makeTask("task-2", { due_date: "2026-09-09" });
      queryClient.setQueryData(taskKeys.defaultList(false), [task]);
      vi.mocked(taskMutations.toggle).mockResolvedValue({
        task: { ...task, is_completed: true },
        newRecurringTask: spawned,
      });

      await taskCommands.toggle(
        { queryClient, isGuestMode: false },
        { id: "task-1", is_completed: true },
      );

      expect(events).toEqual([
        { type: "task.completed", taskId: "task-1" },
        { type: "task.created", taskId: "task-2", parentId: null },
      ]);
    });

    it("optimistically patches the task in the default list cache, incl. subtask entries", async () => {
      const parent = makeTask("parent-1", {
        subtasks: [{ id: "step-1", is_completed: false }],
      });
      queryClient.setQueryData(taskKeys.defaultList(false), [parent]);
      queryClient.setQueryData(
        ["subtasks", "parent-1", false],
        [makeTask("step-1", { parent_id: "parent-1" })],
      );
      let resolveToggle!: (result: { task: Task }) => void;
      vi.mocked(taskMutations.toggle).mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveToggle = resolve;
          }),
      );

      const pending = taskCommands.toggle(
        { queryClient, isGuestMode: false },
        { id: "step-1", is_completed: true },
      );

      // Optimistic state visible before the write lands: the step flips
      // inside its parent's progress badge cache…
      await vi.waitFor(() => {
        const cached = queryClient.getQueryData<Task[]>(
          taskKeys.defaultList(false),
        );
        expect(cached?.[0]?.subtasks?.[0]?.is_completed).toBe(true);
        // …and in the standalone subtasks cache.
        expect(
          queryClient.getQueryData<Task[]>(["subtasks", "parent-1", false]),
        ).toEqual([
          expect.objectContaining({ id: "step-1", is_completed: true }),
        ]);
      });

      resolveToggle({ task: { ...parent, is_completed: true } });
      await pending;
    });

    it("publishes nothing on failure and rolls the optimistic patch back", async () => {
      const task = makeTask("task-1");
      queryClient.setQueryData(taskKeys.defaultList(false), [task]);
      vi.mocked(taskMutations.toggle).mockRejectedValue(
        new Error("network error"),
      );

      await expect(
        taskCommands.toggle(
          { queryClient, isGuestMode: false },
          { id: "task-1", is_completed: true },
        ),
      ).rejects.toThrow("network error");

      expect(events).toEqual([]);
      // Cache rolled back to the pre-command state.
      expect(queryClient.getQueryData(taskKeys.defaultList(false))).toEqual([
        task,
      ]);
    });

    it("keeps firing the task_action completed telemetry with an identical payload", async () => {
      const task = makeTask("task-1");
      queryClient.setQueryData(taskKeys.defaultList(false), [task]);
      vi.mocked(taskMutations.toggle).mockResolvedValue({
        task: { ...task, is_completed: true },
      });

      await taskCommands.toggle(
        { queryClient, isGuestMode: false },
        { id: "task-1", is_completed: true },
      );

      expect(trackTelemetry).toHaveBeenCalledWith("task_action", {
        action: "completed",
      });

      // Uncompleting fires nothing.
      vi.mocked(taskMutations.toggle).mockResolvedValue({ task });
      await taskCommands.toggle(
        { queryClient, isGuestMode: false },
        { id: "task-1", is_completed: false },
      );
      expect(trackTelemetry).toHaveBeenCalledTimes(1);
    });

    it("exempts guest demo-seed toggles from telemetry but still publishes the event", async () => {
      localStorage.setItem("kanso_guest_mode", "true");
      mockStore.reset();
      const seedTaskId = mockStore.getTasks()[0].id;
      const seedTask = mockStore.getTask(seedTaskId);
      vi.mocked(taskMutations.toggle).mockResolvedValue({
        task: { ...(seedTask as Task), is_completed: true },
      });

      await taskCommands.toggle(
        { queryClient, isGuestMode: true },
        { id: seedTaskId, is_completed: true },
      );

      expect(trackTelemetry).not.toHaveBeenCalled();
      expect(events).toEqual([{ type: "task.completed", taskId: seedTaskId }]);
    });

    it("invalidates the task cache families via the key factory", async () => {
      const task = makeTask("task-1");
      queryClient.setQueryData(taskKeys.defaultList(false), [task]);
      vi.mocked(taskMutations.toggle).mockResolvedValue({
        task: { ...task, is_completed: true },
      });
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      await taskCommands.toggle(
        { queryClient, isGuestMode: false },
        { id: "task-1", is_completed: true },
      );

      for (const queryKey of [
        taskKeys.all,
        taskKeys.subtasks.all,
        taskKeys.calendarTasks,
        taskKeys.statsDashboard,
        taskKeys.focusTasks,
        taskKeys.taskSeries,
      ]) {
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey });
      }
    });
  });

  describe("create", () => {
    it("publishes task.created with the landed entity reference", async () => {
      const landed = makeTask("landed-1");
      vi.mocked(taskMutations.create).mockResolvedValue(landed);

      await taskCommands.create(
        { queryClient, isGuestMode: false },
        { content: "New task" },
      );

      expect(events).toEqual([
        { type: "task.created", taskId: "landed-1", parentId: null },
      ]);
      // Telemetry keeps firing with an identical payload.
      expect(trackTelemetry).toHaveBeenCalledWith("task_action", {
        action: "created",
      });
    });

    it("optimistically writes the _clientId row before the write lands", async () => {
      let resolveCreate!: (task: Task) => void;
      vi.mocked(taskMutations.create).mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveCreate = resolve;
          }),
      );

      const pending = taskCommands.create(
        { queryClient, isGuestMode: false },
        { content: "Optimistic task" },
      );

      await vi.waitFor(() => {
        const cached = queryClient.getQueryData<Task[]>(
          taskKeys.defaultList(false),
        );
        expect(cached).toEqual([
          expect.objectContaining({ content: "Optimistic task" }),
        ]);
      });
      const optimisticId = queryClient.getQueryData<Task[]>(
        taskKeys.defaultList(false),
      )?.[0].id;
      expect(optimisticId).toBeTruthy();

      resolveCreate(makeTask("landed-2"));
      await pending;

      // The event references the landed id, not the optimistic one.
      expect(events).toEqual([
        { type: "task.created", taskId: "landed-2", parentId: null },
      ]);
    });

    it("reuses a pre-assigned _clientId instead of minting a new one", async () => {
      const input = { content: "Idempotent task", _clientId: "client-1" };
      const landed = makeTask("client-1");
      vi.mocked(taskMutations.create).mockResolvedValue(landed);

      await taskCommands.create({ queryClient, isGuestMode: false }, input);

      // The service received (and echoed) the caller's _clientId — the
      // offline idempotency contract.
      expect(taskMutations.create).toHaveBeenCalledWith(input);
      expect(input._clientId).toBe("client-1");
    });

    it("creates a step on its parent's progress badge, not in the list", async () => {
      const parent = makeTask("parent-1");
      queryClient.setQueryData(taskKeys.defaultList(false), [parent]);
      const landed = makeTask("step-landed-1", { parent_id: "parent-1" });
      vi.mocked(taskMutations.create).mockResolvedValue(landed);
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      await taskCommands.create(
        { queryClient, isGuestMode: false },
        { content: "New step", parent_id: "parent-1" },
      );

      // The list length is unchanged; the parent's badge gained the step.
      const cached = queryClient.getQueryData<Task[]>(
        taskKeys.defaultList(false),
      );
      expect(cached).toHaveLength(1);
      expect(cached?.[0]?.subtasks).toEqual([
        { id: expect.any(String), is_completed: false },
      ]);
      // The event carries the structural parentId summary.
      expect(events).toEqual([
        { type: "task.created", taskId: "step-landed-1", parentId: "parent-1" },
      ]);
      // The parent's subtasks family was invalidated too.
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: taskKeys.subtasks.of("parent-1"),
      });
    });

    it("publishes nothing on failure and rolls the optimistic row back", async () => {
      const existing = makeTask("existing-1");
      queryClient.setQueryData(taskKeys.defaultList(false), [existing]);
      vi.mocked(taskMutations.create).mockRejectedValue(
        new Error("insert failed"),
      );

      await expect(
        taskCommands.create(
          { queryClient, isGuestMode: false },
          { content: "Doomed task" },
        ),
      ).rejects.toThrow("insert failed");

      expect(events).toEqual([]);
      expect(queryClient.getQueryData(taskKeys.defaultList(false))).toEqual([
        existing,
      ]);
    });
  });

  describe("update", () => {
    it("publishes task.updated and patches the renamed task in the list cache", async () => {
      const task = makeTask("task-1");
      queryClient.setQueryData(taskKeys.defaultList(false), [task]);
      vi.mocked(taskMutations.update).mockResolvedValue({
        ...task,
        content: "Renamed",
      });

      await taskCommands.update(
        { queryClient, isGuestMode: false },
        { id: "task-1", content: "Renamed" },
      );

      expect(events).toEqual([{ type: "task.updated", taskId: "task-1" }]);
      expect(
        queryClient.getQueryData<Task[]>(taskKeys.defaultList(false)),
      ).toEqual([expect.objectContaining({ content: "Renamed" })]);
    });

    it("patches a renamed step in its parent's subtasks cache", async () => {
      const step = makeTask("step-1", { parent_id: "task-1" });
      queryClient.setQueryData(["subtasks", "task-1", false], [step]);
      vi.mocked(taskMutations.update).mockResolvedValue({
        ...step,
        content: "Renamed step",
      });

      await taskCommands.update(
        { queryClient, isGuestMode: false },
        { id: "step-1", content: "Renamed step" },
      );

      expect(events).toEqual([{ type: "task.updated", taskId: "step-1" }]);
      expect(
        queryClient.getQueryData<Task[]>(["subtasks", "task-1", false]),
      ).toEqual([expect.objectContaining({ content: "Renamed step" })]);
    });

    it("publishes nothing on failure and rolls every patched entry back", async () => {
      const task = makeTask("task-1");
      const step = makeTask("step-1", { parent_id: "task-1" });
      queryClient.setQueryData(taskKeys.defaultList(false), [task]);
      queryClient.setQueryData(["subtasks", "task-1", false], [step]);
      vi.mocked(taskMutations.update).mockRejectedValue(
        new Error("update failed"),
      );

      await expect(
        taskCommands.update(
          { queryClient, isGuestMode: false },
          { id: "step-1", content: "Doomed rename" },
        ),
      ).rejects.toThrow("update failed");

      expect(events).toEqual([]);
      expect(queryClient.getQueryData(taskKeys.defaultList(false))).toEqual([
        task,
      ]);
      expect(
        queryClient.getQueryData<Task[]>(["subtasks", "task-1", false]),
      ).toEqual([step]);
    });
  });

  describe("delete", () => {
    it("optimistically removes the row, publishes task.deleted, and offers Undo", async () => {
      const task = makeTask("task-1");
      const subtask = makeTask("step-1", { parent_id: "task-1" });
      queryClient.setQueryData(taskKeys.defaultList(false), [task]);
      vi.mocked(taskMutations.delete).mockResolvedValue([subtask]);

      await taskCommands.delete({ queryClient, isGuestMode: false }, "task-1");

      // Optimistic removal (no observers → invalidation doesn't refetch).
      expect(queryClient.getQueryData(taskKeys.defaultList(false))).toEqual([]);
      expect(events).toEqual([{ type: "task.deleted", taskId: "task-1" }]);
      // The command returns the cascaded subtasks for Undo, as the hook did.
      expect(taskMutations.delete).toHaveBeenCalledWith("task-1");
      // The undo toast carries the action, exactly as before.
      expect(notifyFn).toHaveBeenCalledWith(
        "Task deleted",
        expect.objectContaining({ action: expect.any(Object) }),
      );
      expect(useUiStore.getState().lastUndoAction).not.toBeNull();
    });

    it("Undo restores the subtree via the restore path and publishes task.created", async () => {
      const task = makeTask("task-1");
      const subtask = makeTask("step-1", { parent_id: "task-1" });
      queryClient.setQueryData(taskKeys.defaultList(false), [task]);
      vi.mocked(taskMutations.delete).mockResolvedValue([subtask]);
      vi.mocked(taskMutations.restore).mockResolvedValue(undefined);

      await taskCommands.delete({ queryClient, isGuestMode: false }, "task-1");
      events.length = 0;

      await getUndoHandler()();

      // The task service re-inserts only the entity rows (layering: it never
      // sees nodes); the node rows ride the command's own Undo context.
      expect(taskMutations.restore).toHaveBeenCalledWith(task, [subtask]);
      expect(notifyFn).toHaveBeenCalledWith("Task restored");
      expect(events).toEqual([
        { type: "task.created", taskId: "task-1", parentId: null },
      ]);
    });

    it("a failing restore surfaces the error notice and publishes nothing", async () => {
      const task = makeTask("task-1");
      queryClient.setQueryData(taskKeys.defaultList(false), [task]);
      vi.mocked(taskMutations.delete).mockResolvedValue([]);
      vi.mocked(taskMutations.restore).mockRejectedValue(
        new Error("insert failed"),
      );

      await taskCommands.delete({ queryClient, isGuestMode: false }, "task-1");
      events.length = 0;

      await getUndoHandler()();

      expect(notifyFn.error).toHaveBeenCalledWith("Failed to restore task");
      expect(notifyFn).not.toHaveBeenCalledWith("Task restored");
      expect(events).toEqual([]);
    });

    it("publishes nothing and offers no Undo when the delete itself fails", async () => {
      const task = makeTask("task-1");
      queryClient.setQueryData(taskKeys.defaultList(false), [task]);
      vi.mocked(taskMutations.delete).mockRejectedValue(
        new Error("network error"),
      );

      await expect(
        taskCommands.delete({ queryClient, isGuestMode: false }, "task-1"),
      ).rejects.toThrow("network error");

      expect(events).toEqual([]);
      expect(notifyFn).not.toHaveBeenCalledWith(
        "Task deleted",
        expect.anything(),
      );
      expect(useUiStore.getState().lastUndoAction).toBeNull();
    });

    it("expires the keyboard undo binding once the toast duration elapses", async () => {
      vi.useFakeTimers();
      try {
        const task = makeTask("task-1");
        queryClient.setQueryData(taskKeys.defaultList(false), [task]);
        vi.mocked(taskMutations.delete).mockResolvedValue([]);

        await taskCommands.delete(
          { queryClient, isGuestMode: false },
          "task-1",
        );

        expect(useUiStore.getState().lastUndoAction).not.toBeNull();
        await vi.advanceTimersByTimeAsync(5000);
        expect(useUiStore.getState().lastUndoAction).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    it("removes the deleted task's referencing nodes across workspaces (ADR 0019)", async () => {
      const task = makeTask("task-1");
      const subtask = makeTask("step-1", { parent_id: "task-1" });
      queryClient.setQueryData(taskKeys.defaultList(false), [task]);
      vi.mocked(taskMutations.delete).mockResolvedValue([subtask]);

      workspaceMocks.list.mockResolvedValue([
        makeWorkspace("ws-1"),
        makeWorkspace("ws-2"),
      ]);
      workspaceMocks.listNodes.mockImplementation(
        async (workspaceId: string) =>
          workspaceId === "ws-1"
            ? [
                makeNode("node-a", "task", "task-1"),
                makeNode("node-b", "task", "task-other"),
                makeNode("node-c", "task", null),
              ]
            : [
                // The cascaded subtask's node goes too — it references a row
                // the delete destroyed.
                makeNode("node-d", "task", "step-1", {
                  workspace_id: "ws-2",
                }),
                // Same entity_id but a different entity_type: not a match.
                makeNode("node-h", "habit", "task-1", { workspace_id: "ws-2" }),
              ],
      );

      await taskCommands.delete({ queryClient, isGuestMode: false }, "task-1");

      // Exactly the referencing nodes, across both workspaces.
      expect(workspaceMocks.removeNode).toHaveBeenCalledTimes(2);
      expect(workspaceMocks.removeNode).toHaveBeenCalledWith("node-a");
      expect(workspaceMocks.removeNode).toHaveBeenCalledWith("node-d");
      expect(workspaceMocks.removeNode).not.toHaveBeenCalledWith("node-b");
      expect(workspaceMocks.removeNode).not.toHaveBeenCalledWith("node-h");

      // The delete fact plus one node.removed per cleaned row.
      expect(events).toEqual([
        { type: "task.deleted", taskId: "task-1" },
        { type: "node.removed", workspaceId: "ws-1", nodeId: "node-a" },
        { type: "node.removed", workspaceId: "ws-2", nodeId: "node-d" },
      ]);
    });

    it("Undo revives the removed nodes along with the task subtree", async () => {
      const task = makeTask("task-1");
      const subtask = makeTask("step-1", { parent_id: "task-1" });
      queryClient.setQueryData(taskKeys.defaultList(false), [task]);
      vi.mocked(taskMutations.delete).mockResolvedValue([subtask]);
      vi.mocked(taskMutations.restore).mockResolvedValue(undefined);

      workspaceMocks.list.mockResolvedValue([makeWorkspace("ws-1")]);
      workspaceMocks.listNodes.mockResolvedValue([
        makeNode("node-a", "task", "task-1"),
      ]);

      await taskCommands.delete({ queryClient, isGuestMode: false }, "task-1");
      events.length = 0;

      await getUndoHandler()();

      // The task service re-inserts only the entity rows; the node rows ride
      // the command's Undo context and are re-inserted via the shared helper.
      expect(taskMutations.restore).toHaveBeenCalledWith(task, [subtask]);
      // The rows are re-inserted verbatim — same id, placement, and
      // reference pair — reviving the canvas layout with the entity.
      expect(workspaceMocks.addNode).toHaveBeenCalledTimes(1);
      expect(workspaceMocks.addNode).toHaveBeenCalledWith({
        id: "node-a",
        workspaceId: "ws-1",
        kind: "task",
        entityType: "task",
        entityId: "task-1",
        positionX: 0,
        positionY: 0,
        width: null,
        height: null,
        displayConfig: null,
      });
      expect(events).toEqual([
        { type: "node.added", workspaceId: "ws-1", nodeId: "node-a" },
        { type: "task.created", taskId: "task-1", parentId: null },
      ]);
    });

    it("a cleanup failure never fails the landed delete — nodes degrade to orphans", async () => {
      const warnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => undefined);
      const task = makeTask("task-1");
      queryClient.setQueryData(taskKeys.defaultList(false), [task]);
      vi.mocked(taskMutations.delete).mockResolvedValue([]);
      workspaceMocks.list.mockRejectedValue(new Error("workspace list failed"));

      // The task delete landed; the command resolves and offers Undo even
      // though node cleanup could not run — the leftover nodes surface as
      // dismissable orphan placeholders (derive-at-read), never silent rot.
      await taskCommands.delete({ queryClient, isGuestMode: false }, "task-1");

      expect(events).toEqual([{ type: "task.deleted", taskId: "task-1" }]);
      expect(useUiStore.getState().lastUndoAction).not.toBeNull();
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe("reorder", () => {
    it("applies the pairs optimistically and publishes task.updated per moved task", async () => {
      const first = makeTask("a", { day_order: 0 });
      const second = makeTask("b", { day_order: 1 });
      queryClient.setQueryData(taskKeys.defaultList(false), [first, second]);
      vi.mocked(taskMutations.reorder).mockResolvedValue(undefined);

      await taskCommands.reorder({ queryClient, isGuestMode: false }, [
        { id: "b", day_order: 0 },
        { id: "a", day_order: 1 },
      ]);

      // Slot-value-swap applied optimistically.
      const cached = queryClient.getQueryData<Task[]>(
        taskKeys.defaultList(false),
      );
      expect(cached?.find((t) => t.id === "a")?.day_order).toBe(1);
      expect(cached?.find((t) => t.id === "b")?.day_order).toBe(0);
      expect(events).toEqual([
        { type: "task.updated", taskId: "b" },
        { type: "task.updated", taskId: "a" },
      ]);
    });

    it("publishes nothing on failure and rolls the day_orders back", async () => {
      const first = makeTask("a", { day_order: 0 });
      const second = makeTask("b", { day_order: 1 });
      queryClient.setQueryData(taskKeys.defaultList(false), [first, second]);
      vi.mocked(taskMutations.reorder).mockRejectedValue(
        new Error("network error"),
      );

      await expect(
        taskCommands.reorder({ queryClient, isGuestMode: false }, [
          { id: "b", day_order: 0 },
          { id: "a", day_order: 1 },
        ]),
      ).rejects.toThrow("network error");

      expect(events).toEqual([]);
      expect(queryClient.getQueryData(taskKeys.defaultList(false))).toEqual([
        first,
        second,
      ]);
    });
  });

  describe("clearCompleted", () => {
    it("filters completed rows optimistically and publishes nothing", async () => {
      const active = makeTask("active-1");
      const done = makeTask("done-1", {
        is_completed: true,
        completed_at: "2026-09-07T10:00:00.000Z",
      });
      queryClient.setQueryData(taskKeys.defaultList(false), [active, done]);
      vi.mocked(taskMutations.clearCompleted).mockResolvedValue(undefined);

      await taskCommands.clearCompleted({ queryClient, isGuestMode: false });

      expect(queryClient.getQueryData(taskKeys.defaultList(false))).toEqual([
        active,
      ]);
      // Documented: the service deletes by predicate and returns no ids, so
      // no per-entity events can be published honestly.
      expect(events).toEqual([]);
    });

    it("publishes nothing on failure and rolls the filter back", async () => {
      const active = makeTask("active-1");
      const done = makeTask("done-1", { is_completed: true });
      queryClient.setQueryData(taskKeys.defaultList(false), [active, done]);
      vi.mocked(taskMutations.clearCompleted).mockRejectedValue(
        new Error("network error"),
      );

      await expect(
        taskCommands.clearCompleted({ queryClient, isGuestMode: false }),
      ).rejects.toThrow("network error");

      expect(events).toEqual([]);
      expect(queryClient.getQueryData(taskKeys.defaultList(false))).toEqual([
        active,
        done,
      ]);
    });

    it("removes the completed tasks' referencing nodes, and only theirs (ADR 0019)", async () => {
      const active = makeTask("active-1");
      const done = makeTask("done-1", { is_completed: true });
      queryClient.setQueryData(taskKeys.defaultList(false), [active, done]);
      vi.mocked(taskMutations.clearCompleted).mockResolvedValue(undefined);

      workspaceMocks.list.mockResolvedValue([makeWorkspace("ws-1")]);
      workspaceMocks.listNodes.mockResolvedValue([
        makeNode("node-done", "task", "done-1"),
        makeNode("node-active", "task", "active-1"),
      ]);

      await taskCommands.clearCompleted({ queryClient, isGuestMode: false });

      // The cleared task's node goes; the active task's node stays.
      expect(workspaceMocks.removeNode).toHaveBeenCalledTimes(1);
      expect(workspaceMocks.removeNode).toHaveBeenCalledWith("node-done");
      expect(workspaceMocks.removeNode).not.toHaveBeenCalledWith("node-active");
      // No per-entity task events (predicate delete), one node.removed per
      // cleaned row — the node rows ARE enumerable, so their facts publish.
      expect(events).toEqual([
        { type: "node.removed", workspaceId: "ws-1", nodeId: "node-done" },
      ]);
    });
  });

  describe("duplicate", () => {
    it("publishes task.created and fires the telemetry, haptic, and toast policy", async () => {
      const source = makeTask("source-1");
      const copy = makeTask("copy-1");
      vi.mocked(taskMutations.duplicate).mockResolvedValue(copy);
      const trigger = vi.fn();

      await taskCommands.duplicate(
        { queryClient, isGuestMode: false, hapticTrigger: trigger },
        { sourceTask: source },
      );

      expect(taskMutations.duplicate).toHaveBeenCalledWith(source, undefined);
      expect(trackTelemetry).toHaveBeenCalledWith("task_action", {
        action: "created",
      });
      expect(trigger).toHaveBeenCalledWith("success");
      expect(notifyFn).toHaveBeenCalledWith("Task duplicated");
      expect(events).toEqual([
        { type: "task.created", taskId: "copy-1", parentId: null },
      ]);
    });

    it("exempts guest demo-seed duplicates from telemetry but still publishes", async () => {
      localStorage.setItem("kanso_guest_mode", "true");
      mockStore.reset();
      const seedTaskId = mockStore.getTasks()[0].id;
      const seedTask = mockStore.getTask(seedTaskId);
      vi.mocked(taskMutations.duplicate).mockResolvedValue(makeTask("copy-2"));

      await taskCommands.duplicate(
        { queryClient, isGuestMode: true, hapticTrigger: vi.fn() },
        { sourceTask: seedTask as Task },
      );

      expect(trackTelemetry).not.toHaveBeenCalled();
      expect(events).toEqual([
        { type: "task.created", taskId: "copy-2", parentId: null },
      ]);
    });

    it("invalidates the source parent's subtasks family when the copy is a step", async () => {
      const source = makeTask("source-step", { parent_id: "parent-1" });
      const copy = makeTask("copy-step", { parent_id: "parent-1" });
      vi.mocked(taskMutations.duplicate).mockResolvedValue(copy);
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      await taskCommands.duplicate(
        { queryClient, isGuestMode: false },
        { sourceTask: source },
      );

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: taskKeys.subtasks.of("parent-1"),
      });
    });
  });
});
