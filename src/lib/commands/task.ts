/**
 * Task Domain Commands (ADR 0016): the single write funnel for interactive
 * task state changes. A command is a named plain async function any caller
 * can execute — React hook, Workspace canvas, future agent — and it owns the
 * whole write policy: mutation-service call, optimistic update, rollback,
 * cache invalidation, and Domain Event publication (ADR 0017).
 *
 * Commands are a funnel, never a source: reads trust only the Query cache,
 * and the bypass write paths (migration, backup restore, imports, profile,
 * the calendar sync engine) stay outside this layer by design.
 *
 * Event vocabulary (one name per outcome, entity reference + at most a
 * minimal change summary, never a full row):
 *   toggle   → task.completed / task.uncompleted (+ task.created for a
 *              spawned recurring instance)
 *   create   → task.created
 *   update   → task.updated
 *   reorder  → task.updated per moved task
 *   delete   → task.deleted
 *   restore  → task.created (the row lands again)
 *   duplicate→ task.created
 *   clearCompleted → nothing: the service deletes by predicate and returns
 *              no ids, so the landed set cannot be enumerated honestly.
 */
import type { QueryClient } from "@tanstack/react-query";
import { taskMutations } from "@/lib/mutations/task";
import { mockStore } from "@/lib/mock/mock-store";
import { taskKeys } from "@/lib/queries/task-keys";
import { trackTelemetry } from "@/lib/telemetry/client";
import { publishDomainEvent } from "@/lib/events/domain-bus";
import { useUiStore } from "@/lib/store/uiStore";
import { notify } from "@/lib/notify";
import { tr } from "@/lib/i18n/tr";
import {
  removeNodesReferencing,
  reinsertNodes,
} from "@/lib/commands/node-cleanup";
import type { HapticSignature } from "@/lib/hooks/useHaptic";
import type { Task, CreateTaskInput, UpdateTaskInput } from "@/lib/types/task";
import type { WorkspaceNode } from "@/lib/types/workspace";

/**
 * Everything a command needs from its calling context: the QueryClient whose
 * caches the write policy targets, the guest flag that shapes optimistic
 * keys and telemetry gating (mirrors useAuth().isGuestMode), and the
 * calling surface's haptic trigger (useHaptic().trigger) for the commands
 * whose UX includes feedback — absent (no-op) for non-React callers.
 */
export interface TaskCommandContext {
  readonly queryClient: QueryClient;
  readonly isGuestMode: boolean;
  readonly hapticTrigger?: (signature: HapticSignature) => void;
}

export type ToggleTaskInput = { id: string; is_completed: boolean };

export type ToggleTaskResult = { task: Task; newRecurringTask?: Task };

export type CreateTaskInputWithClientId = CreateTaskInput & {
  _clientId?: string;
};

export type DuplicateTaskInput = {
  sourceTask: Task;
  overrides?: Partial<Task>;
};

// Matches the Undo toast duration — keyboard undo shouldn't outlive it.
const UNDO_TOAST_DURATION_MS = 5000;

/**
 * Cache families every landed task write invalidates, via the key factory —
 * the same six invalidations the hooks fired in onSettled.
 */
function invalidateTaskCaches(queryClient: QueryClient): void {
  void Promise.all([
    queryClient.invalidateQueries({ queryKey: taskKeys.all }),
    queryClient.invalidateQueries({ queryKey: taskKeys.subtasks.all }),
    queryClient.invalidateQueries({ queryKey: taskKeys.calendarTasks }),
    queryClient.invalidateQueries({ queryKey: taskKeys.statsDashboard }),
    queryClient.invalidateQueries({ queryKey: taskKeys.focusTasks }),
    queryClient.invalidateQueries({ queryKey: taskKeys.taskSeries }),
  ]);
}

export const taskCommands = {
  /**
   * `task.toggle` — flip a task's (or step's) completion, keeping the
   * recurrence expansion in the mutation service and the whole optimistic /
   * rollback / invalidation policy that previously lived in useToggleTask.
   */
  toggle: async (
    ctx: TaskCommandContext,
    { id, is_completed }: ToggleTaskInput,
  ): Promise<ToggleTaskResult> => {
    const { queryClient } = ctx;

    // Optimistic update (moved verbatim from useToggleTask.onMutate).
    await queryClient.cancelQueries({ queryKey: taskKeys.all });
    await queryClient.cancelQueries({ queryKey: taskKeys.subtasks.all });

    const queryKey = taskKeys.defaultList(ctx.isGuestMode);
    const previousTasks = queryClient.getQueryData<Task[]>(queryKey);

    const patch = (old: Task[] | undefined) =>
      old?.map((task) => {
        if (task.id === id) {
          return {
            ...task,
            is_completed,
            completed_at: is_completed ? new Date().toISOString() : null,
          };
        }
        if (task.subtasks?.some((st) => st.id === id)) {
          return {
            ...task,
            subtasks: task.subtasks.map((st) =>
              st.id === id ? { ...st, is_completed } : st,
            ),
          };
        }
        return task;
      });

    queryClient.setQueryData<Task[]>(queryKey, patch);

    // SubtaskList reads from the ["subtasks", parentId] cache, not ["tasks"] —
    // patch it too so a subtask checkbox reflects immediately.
    const previousSubtaskQueries = queryClient.getQueriesData<Task[]>({
      queryKey: taskKeys.subtasks.all,
    });
    queryClient.setQueriesData<Task[]>(
      { queryKey: taskKeys.subtasks.all },
      patch,
    );

    try {
      const result = await taskMutations.toggle({ id, is_completed });

      // Telemetry (moved verbatim from useToggleTask.onSuccess): guests get
      // a year of pre-seeded demo tasks; interacting with them shouldn't
      // inflate the "Engagement & Throughput" KPI.
      if (!(ctx.isGuestMode && mockStore.isSeedId(id))) {
        if (is_completed) {
          trackTelemetry("task_action", { action: "completed" });
        }
      }

      // Domain Events: past-tense facts, published after the write lands,
      // entity reference + minimal summary only — never a full row.
      publishDomainEvent(
        is_completed
          ? { type: "task.completed", taskId: result.task.id }
          : { type: "task.uncompleted", taskId: result.task.id },
      );
      if (result.newRecurringTask) {
        publishDomainEvent({
          type: "task.created",
          taskId: result.newRecurringTask.id,
          parentId: result.newRecurringTask.parent_id ?? null,
        });
      }

      return result;
    } catch (err) {
      // Rollback (moved verbatim from useToggleTask.onError).
      if (previousTasks) {
        queryClient.setQueryData(queryKey, previousTasks);
      }
      previousSubtaskQueries.forEach(([cachedKey, data]) => {
        queryClient.setQueryData(cachedKey, data);
      });
      throw err;
    } finally {
      invalidateTaskCaches(queryClient);
    }
  },

  /**
   * `task.create` — create a task (or step), keeping the optimistic
   * `_clientId` idempotency and rollback policy from useCreateTask.
   */
  create: async (
    ctx: TaskCommandContext,
    newTask: CreateTaskInputWithClientId,
  ): Promise<Task> => {
    const { queryClient } = ctx;

    // Optimistic update (moved verbatim from useCreateTask.onMutate).
    await queryClient.cancelQueries({ queryKey: taskKeys.all });

    const queryKey = taskKeys.defaultList(ctx.isGuestMode);
    const previousTasks = queryClient.getQueryData<Task[]>(queryKey);

    const clientId = newTask._clientId || crypto.randomUUID();
    newTask._clientId = clientId;

    const optimisticTask: Task = {
      id: clientId,
      user_id: ctx.isGuestMode ? "guest" : "",
      project_id: newTask.project_id || null,
      parent_id: newTask.parent_id || null,
      content: newTask.content,
      description: newTask.description || null,
      priority: newTask.priority || 4,
      due_date: newTask.due_date || null,
      do_date: newTask.do_date || null,
      is_evening: newTask.is_evening || false,
      is_completed: false,
      completed_at: null,
      day_order: 0,
      recurrence: null,
      recurring_series_id: null,
      google_event_id: null,
      google_etag: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    queryClient.setQueryData<Task[]>(queryKey, (old) =>
      newTask.parent_id
        ? // A step belongs on its parent's progress badge, not in the list.
          old?.map((task) =>
            task.id === newTask.parent_id
              ? {
                  ...task,
                  subtasks: [
                    ...(task.subtasks || []),
                    { id: clientId, is_completed: false },
                  ],
                }
              : task,
          )
        : [optimisticTask, ...(old || [])],
    );

    try {
      const task = await taskMutations.create(newTask);

      // Telemetry (moved verbatim from useCreateTask.onSuccess).
      trackTelemetry("task_action", { action: "created" });

      publishDomainEvent({
        type: "task.created",
        taskId: task.id,
        parentId: task.parent_id ?? null,
      });

      return task;
    } catch (err) {
      // Rollback (moved verbatim from useCreateTask.onError).
      if (previousTasks) {
        queryClient.setQueryData(queryKey, previousTasks);
      }
      throw err;
    } finally {
      invalidateTaskCaches(queryClient);
      if (newTask.parent_id) {
        queryClient.invalidateQueries({
          queryKey: taskKeys.subtasks.of(newTask.parent_id),
        });
      }
    }
  },

  /**
   * `task.update` — edit a task (or step) in place, keeping the patch-all-
   * task-and-subtask-queries optimistic policy from useUpdateTask.
   */
  update: async (
    ctx: TaskCommandContext,
    updates: UpdateTaskInput,
  ): Promise<Task> => {
    const { queryClient } = ctx;

    // Optimistic update (moved verbatim from useUpdateTask.onMutate).
    await queryClient.cancelQueries({ queryKey: taskKeys.all });
    await queryClient.cancelQueries({ queryKey: taskKeys.subtasks.all });

    const allTaskQueries = [
      ...queryClient.getQueriesData<Task[]>({ queryKey: taskKeys.all }),
      // SubtaskList reads from ["subtasks", parentId], not ["tasks"].
      ...queryClient.getQueriesData<Task[]>({
        queryKey: taskKeys.subtasks.all,
      }),
    ];

    for (const [queryKey] of allTaskQueries) {
      queryClient.setQueryData<Task[]>(queryKey, (old) =>
        old?.map((task) =>
          task.id === updates.id ? { ...task, ...updates } : task,
        ),
      );
    }

    try {
      const task = await taskMutations.update(updates);

      publishDomainEvent({ type: "task.updated", taskId: updates.id });

      return task;
    } catch (err) {
      // Rollback (moved verbatim from useUpdateTask.onError).
      allTaskQueries.forEach(([queryKey, data]) => {
        queryClient.setQueryData(queryKey, data);
      });
      throw err;
    } finally {
      invalidateTaskCaches(queryClient);
    }
  },

  /**
   * `task.delete` — hard-delete a task. tasks.parent_id cascades at the DB
   * level, so subtasks are destroyed along with it; the service returns them
   * so Undo can restore the whole subtree. The Undo toast, keyboard-undo
   * binding, and expiry timer move here verbatim from useDeleteTask's
   * onSuccess — undo is part of the delete write policy, and its restore
   * path routes through the `task.restore` command.
   */
  delete: async (ctx: TaskCommandContext, id: string): Promise<Task[]> => {
    const { queryClient } = ctx;
    const trigger = ctx.hapticTrigger ?? (() => {});

    // Optimistic removal (moved verbatim from useDeleteTask.onMutate).
    await queryClient.cancelQueries({ queryKey: taskKeys.all });
    await queryClient.cancelQueries({ queryKey: taskKeys.subtasks.all });

    const allTaskQueries = [
      ...queryClient.getQueriesData<Task[]>({ queryKey: taskKeys.all }),
      // A deleted subtask must also disappear from its parent's
      // ["subtasks", parentId] list.
      ...queryClient.getQueriesData<Task[]>({
        queryKey: taskKeys.subtasks.all,
      }),
    ];
    let deletedTask: Task | undefined;

    for (const [, data] of allTaskQueries) {
      if (data) {
        const found = data.find((task) => task.id === id);
        if (found) {
          deletedTask = found;
          break;
        }
      }
    }

    for (const [queryKey] of allTaskQueries) {
      queryClient.setQueryData<Task[]>(queryKey, (old) =>
        old
          ?.filter((task) => task.id !== id)
          .map((task) =>
            task.subtasks?.some((st) => st.id === id)
              ? {
                  ...task,
                  subtasks: task.subtasks.filter((st) => st.id !== id),
                }
              : task,
          ),
      );
    }

    // Cascades at the DB level — clear cached subtasks now, not orphaned later.
    for (const [queryKey] of queryClient.getQueriesData<Task[]>({
      queryKey: taskKeys.subtasks.of(id),
    })) {
      queryClient.setQueryData<Task[]>(queryKey, []);
    }

    try {
      // Uses the delete's cascaded subtasks, not the optimistic cache (may
      // be empty); confirmed first so Undo isn't offered for a delete that
      // never landed.
      const deletedSubtasks = await taskMutations.delete(id);

      // The entity fact publishes as soon as the delete lands — the subtree
      // is gone — and the layout consequences (node.removed per cleaned row)
      // follow it, so observers hear the cause before its ripple.
      publishDomainEvent({ type: "task.deleted", taskId: id });

      // ADR 0019: the task subtree is gone, so its nodes go with it — across
      // every workspace. The removed rows ride in the Undo context below;
      // a cleanup failure never fails the landed delete, it degrades the
      // nodes into dismissable orphan placeholders instead.
      const removedNodes = await removeNodesReferencing(
        { queryClient, isGuestMode: ctx.isGuestMode },
        {
          entityType: "task",
          entityIds: [id, ...deletedSubtasks.map((st) => st.id)],
        },
      ).catch((err: unknown) => {
        console.warn(
          "Node cleanup after task delete failed; nodes will surface as orphans:",
          err,
        );
        return [] as WorkspaceNode[];
      });

      if (deletedTask) {
        const taskToRestore = { ...deletedTask };
        const subtasksToRestore = deletedSubtasks;
        const nodesToRestore = removedNodes;

        trigger("success");

        const undoAction = async () => {
          useUiStore.getState().setLastUndoAction(null);
          try {
            await taskCommands.restore(
              ctx,
              taskToRestore,
              subtasksToRestore,
              nodesToRestore,
            );
            trigger("success");
            notify(tr("tasks.toast.restored"));
          } catch (err) {
            console.error("Failed to restore task:", err);
            trigger("thud");
            notify.error(tr("tasks.toast.restoreFailed"));
          }
        };

        useUiStore.getState().setLastUndoAction(undoAction);
        // Reference-equality guard: no-op if already run or replaced by a
        // later delete.
        setTimeout(() => {
          if (useUiStore.getState().lastUndoAction === undoAction) {
            useUiStore.getState().setLastUndoAction(null);
          }
        }, UNDO_TOAST_DURATION_MS);

        // Dropped, not folded into the title — task content is unbounded
        // user text (ADR 0008).
        notify(tr("tasks.toast.deleted"), {
          duration: UNDO_TOAST_DURATION_MS,
          action: {
            label: tr("tasks.undo"),
            onClick: undoAction,
          },
        });
      }

      return deletedSubtasks;
    } catch (err) {
      // Undoes the optimistic removal — the delete never landed, so the
      // subtree is still there (moved verbatim from useDeleteTask.onError).
      queryClient.invalidateQueries({ queryKey: taskKeys.all });
      queryClient.invalidateQueries({ queryKey: taskKeys.subtasks.of(id) });
      throw err;
    } finally {
      invalidateTaskCaches(queryClient);
    }
  },

  /**
   * `task.restore` — re-insert a hard-deleted task (plus its cascaded
   * subtasks) for delete's Undo action. Guest deletes don't cascade, so the
   * guest path re-adds only the parent. Invalidations run even on failure,
   * exactly as the pre-command undo path did. The delete's Undo context also
   * carries the node rows the cleanup removed (ADR 0019): they are
   * re-inserted verbatim after the entity, so undo revives the canvas layout
   * along with the task subtree.
   */
  restore: async (
    ctx: TaskCommandContext,
    task: Task,
    subtasks: Task[] = [],
    removedNodes: WorkspaceNode[] = [],
  ): Promise<void> => {
    const { queryClient } = ctx;

    try {
      if (ctx.isGuestMode) {
        mockStore.addTask(task);
      } else {
        // Parent goes first since subtasks' parent_id references it.
        await taskMutations.restore(task, subtasks);
      }

      // Node revival failure must not surface a failed "Task restored"
      // toast — the entity is back; a missed node re-insert degrades to the
      // same honest state any non-command deletion leaves.
      await reinsertNodes(
        { queryClient, isGuestMode: ctx.isGuestMode },
        removedNodes,
      ).catch((err: unknown) => {
        console.warn("Node revival after undo failed:", err);
      });
    } finally {
      queryClient.invalidateQueries({ queryKey: taskKeys.all });
      if (!ctx.isGuestMode) {
        queryClient.invalidateQueries({
          queryKey: taskKeys.subtasks.of(task.id),
        });
      }
    }

    publishDomainEvent({
      type: "task.created",
      taskId: task.id,
      parentId: task.parent_id ?? null,
    });
  },

  /**
   * `task.reorder` — apply pre-computed {id, day_order} pairs (the
   * slot-value-swap from useReorderTasks.onMutate) optimistically, then
   * persist. Each moved task publishes task.updated.
   */
  reorder: async (
    ctx: TaskCommandContext,
    pairs: { id: string; day_order: number }[],
  ): Promise<void> => {
    const { queryClient } = ctx;

    // Optimistic reorder (moved verbatim from useReorderTasks.onMutate).
    await queryClient.cancelQueries({ queryKey: taskKeys.all });
    await queryClient.cancelQueries({ queryKey: taskKeys.subtasks.all });

    const allTaskQueries = queryClient.getQueriesData<Task[]>({
      queryKey: taskKeys.all,
    });
    const allSubtaskQueries = queryClient.getQueriesData<Task[]>({
      queryKey: taskKeys.subtasks.all,
    });

    const pairById = new Map(pairs.map((p) => [p.id, p.day_order]));

    for (const [queryKey] of allTaskQueries) {
      queryClient.setQueryData<Task[]>(queryKey, (old) => {
        if (!old) return old;

        // Pairs already carry final day_order (computeMoveOrders) — apply as-is.
        return old.map((task) => {
          const newOrder = pairById.get(task.id);
          return newOrder === undefined || task.day_order === newOrder
            ? task
            : { ...task, day_order: newOrder };
        });
      });
    }

    for (const [queryKey] of allSubtaskQueries) {
      queryClient.setQueryData<Task[]>(queryKey, (old) => {
        if (!old) return old;
        return old
          .map((task) => {
            const newOrder = pairById.get(task.id);
            return newOrder === undefined || task.day_order === newOrder
              ? task
              : { ...task, day_order: newOrder };
          })
          .sort(
            (a, b) =>
              (a.day_order ?? 0) - (b.day_order ?? 0) ||
              a.created_at.localeCompare(b.created_at),
          );
      });
    }

    try {
      await taskMutations.reorder(pairs);

      for (const { id } of pairs) {
        publishDomainEvent({ type: "task.updated", taskId: id });
      }
    } catch (err) {
      // Rollback (moved verbatim from useReorderTasks.onError).
      allTaskQueries.forEach(([queryKey, data]) => {
        queryClient.setQueryData(queryKey, data);
      });
      allSubtaskQueries.forEach(([queryKey, data]) => {
        queryClient.setQueryData(queryKey, data);
      });
      throw err;
    } finally {
      // Reorder's settle scope (verbatim): four families, not all six.
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: taskKeys.all }),
        queryClient.invalidateQueries({ queryKey: taskKeys.subtasks.all }),
        queryClient.invalidateQueries({ queryKey: taskKeys.calendarTasks }),
        queryClient.invalidateQueries({ queryKey: taskKeys.statsDashboard }),
      ]);
    }
  },

  /**
   * `task.clearCompleted` — bulk-delete every completed task. Publishes no
   * task Domain Event: the service deletes by predicate and returns no ids,
   * so the landed task set cannot be enumerated honestly (events are facts
   * about landed state, not guesses from a possibly-stale cache). The node
   * rows the cleanup removes ARE enumerable, so each publishes
   * `node.removed` (ADR 0019).
   */
  clearCompleted: async (ctx: TaskCommandContext): Promise<void> => {
    const { queryClient } = ctx;

    // Optimistic filter (moved verbatim from useClearCompletedTasks.onMutate).
    await queryClient.cancelQueries({ queryKey: taskKeys.all });

    const previousTasks = queryClient.getQueriesData<Task[]>({
      queryKey: taskKeys.all,
    });

    // The ids clearCompleted will destroy, from the best client knowledge
    // available before the filter runs (ADR 0019's node cleanup). A task the
    // cache never saw leaves its node behind as a dismissable orphan — the
    // same honest degradation any non-command deletion leaves.
    const completedIds = [
      ...new Set(
        previousTasks.flatMap(([, data]) =>
          (data ?? []).filter((t) => t.is_completed).map((t) => t.id),
        ),
      ),
    ];

    queryClient.setQueriesData<Task[]>(
      { queryKey: taskKeys.all },
      (oldData: Task[] | undefined) => {
        if (!oldData) return oldData;
        if (Array.isArray(oldData)) {
          return oldData.filter((task: Task) => !task.is_completed);
        }
        return oldData;
      },
    );

    try {
      await taskMutations.clearCompleted();

      // The completed tasks are destroyed by predicate; their nodes must go
      // with them (across workspaces, same as task.delete's cleanup). No
      // Undo exists for clearCompleted, so no revival context is kept.
      await removeNodesReferencing(
        { queryClient, isGuestMode: ctx.isGuestMode },
        { entityType: "task", entityIds: completedIds },
      ).catch((err: unknown) => {
        console.warn(
          "Node cleanup after clear-completed failed; nodes will surface as orphans:",
          err,
        );
      });
    } catch (err) {
      // Rollback (moved verbatim from useClearCompletedTasks.onError).
      previousTasks.forEach(([queryKey, data]) => {
        queryClient.setQueryData(queryKey, data);
      });
      throw err;
    } finally {
      // ClearCompleted's settle scope (verbatim): three families, not all six.
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: taskKeys.all }),
        queryClient.invalidateQueries({ queryKey: taskKeys.calendarTasks }),
        queryClient.invalidateQueries({ queryKey: taskKeys.statsDashboard }),
      ]);
    }
  },

  /**
   * `task.duplicate` — copy a task (recursively, with its steps). Recurrence
   * and series identity are stripped in the service so a pasted occurrence
   * never rejoins its source series. Telemetry, haptic, and toast move here
   * verbatim from useDuplicateTask.onSuccess.
   */
  duplicate: async (
    ctx: TaskCommandContext,
    { sourceTask, overrides }: DuplicateTaskInput,
  ): Promise<Task> => {
    const { queryClient } = ctx;
    const trigger = ctx.hapticTrigger ?? (() => {});

    try {
      const newTask = await taskMutations.duplicate(sourceTask, overrides);

      // Guests get a year of pre-seeded demo tasks; interacting with them
      // shouldn't inflate the "Engagement & Throughput" telemetry KPI.
      if (!(ctx.isGuestMode && mockStore.isSeedId(sourceTask.id))) {
        trackTelemetry("task_action", { action: "created" });
      }
      trigger("success");
      notify(tr("tasks.toast.duplicated"));
      if (newTask.parent_id) {
        queryClient.invalidateQueries({
          queryKey: taskKeys.subtasks.of(newTask.parent_id),
        });
      }

      publishDomainEvent({
        type: "task.created",
        taskId: newTask.id,
        parentId: newTask.parent_id ?? null,
      });

      return newTask;
    } finally {
      invalidateTaskCaches(queryClient);
    }
  },
};
