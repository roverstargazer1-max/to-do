import { tasksClient } from "@/lib/api/tasks-client";
import { calculateNextDueDate } from "@/lib/utils/recurrence";
import type { Task, CreateTaskInput, UpdateTaskInput } from "@/lib/types/task";

function toRestorePayload(task: Task) {
  return {
    id: task.id,
    user_id: task.user_id,
    project_id: task.project_id,
    parent_id: task.parent_id,
    content: task.content,
    description: task.description,
    priority: task.priority,
    due_date: task.due_date,
    do_date: task.do_date,
    is_evening: task.is_evening,
    is_completed: task.is_completed,
    completed_at: task.completed_at,
    day_order: task.day_order,
    recurrence: task.recurrence,
    google_event_id: task.google_event_id,
    google_etag: task.google_etag,
  };
}

function toDuplicatePayload(task: Task, parentId: string | null) {
  return {
    content: task.content,
    description: task.description || null,
    priority: task.priority || 4,
    due_date: task.due_date || null,
    do_date: task.do_date || null,
    is_evening: task.is_evening || false,
    project_id: task.project_id || null,
    parent_id: parentId,
    recurrence: null,
    recurring_series_id: null,
    is_completed: false,
    completed_at: null,
    google_event_id: null,
    google_etag: null,
  };
}

export const taskMutations = {
  create: async (
    input: CreateTaskInput & { _clientId?: string },
  ): Promise<Task> => {
    return tasksClient.create(input);
  },

  toggle: async ({
    id,
    is_completed,
  }: {
    id: string;
    is_completed: boolean;
  }): Promise<{ task: Task; newRecurringTask?: Task }> => {
    const updatedTask = await tasksClient.update(id, {
      is_completed,
      completed_at: is_completed ? new Date().toISOString() : null,
    });

    let newRecurringTask: Task | undefined;
    let recurrenceRule = updatedTask.recurrence;
    if (typeof recurrenceRule === "string") {
      try {
        recurrenceRule = JSON.parse(recurrenceRule);
      } catch {
        recurrenceRule = null;
      }
    }

    if (is_completed && recurrenceRule) {
      const now = new Date();
      const nextDueDateIso = calculateNextDueDate(
        now,
        recurrenceRule,
        updatedTask.due_date,
      ).toISOString();
      const nextDoDateIso = updatedTask.do_date
        ? calculateNextDueDate(
            now,
            recurrenceRule,
            updatedTask.do_date,
          ).toISOString()
        : null;

      let seriesId = updatedTask.recurring_series_id;
      if (!seriesId) {
        seriesId = crypto.randomUUID();
        await tasksClient.update(id, { recurring_series_id: seriesId });
        updatedTask.recurring_series_id = seriesId;
      }

      const existingTasks = await tasksClient.list({
        projectId: updatedTask.project_id,
        showCompleted: false,
      });

      const alreadyExists = existingTasks.some(
        (t) =>
          t.content === updatedTask.content &&
          t.project_id === updatedTask.project_id &&
          t.due_date === nextDueDateIso &&
          !t.is_completed,
      );

      if (!alreadyExists) {
        newRecurringTask = await tasksClient.create({
          project_id: updatedTask.project_id,
          content: updatedTask.content,
          description: updatedTask.description,
          priority: updatedTask.priority,
          due_date: nextDueDateIso,
          do_date: nextDoDateIso,
          is_evening: updatedTask.is_evening || false,
          recurrence: recurrenceRule,
          recurring_series_id: seriesId,
        });
      }
    }

    return { task: updatedTask, newRecurringTask };
  },

  update: async (input: UpdateTaskInput): Promise<Task> => {
    const { id, ...updates } = input;
    return tasksClient.update(id, updates);
  },

  delete: async (id: string): Promise<Task[]> => {
    const all = await tasksClient.list({ showCompleted: true });
    const subtasks = all.filter((t) => t.parent_id === id);
    await tasksClient.delete(id);
    return subtasks;
  },

  restore: async (task: Task, subtasks: Task[] = []): Promise<void> => {
    await tasksClient.create(toRestorePayload(task));
    for (const subtask of subtasks) {
      await tasksClient.create(toRestorePayload(subtask));
    }
  },

  reorder: async (
    pairs: { id: string; day_order: number }[],
  ): Promise<void> => {
    for (const { id, day_order } of pairs) {
      await tasksClient.update(id, { day_order });
    }
  },

  clearCompleted: async (): Promise<void> => {
    const all = await tasksClient.list({ showCompleted: true });
    for (const t of all) {
      if (t.is_completed) {
        await tasksClient.delete(t.id);
      }
    }
  },

  duplicate: async (
    sourceTask: Task,
    overrides?: Partial<Task>,
  ): Promise<Task> => {
    const duplicatedTask = await tasksClient.create({
      ...toDuplicatePayload(sourceTask, sourceTask.parent_id || null),
      ...overrides,
    });

    const allTasks = await tasksClient.list({ showCompleted: true });

    const duplicateSubtasksRecursively = async (
      originalParentId: string,
      newParentId: string,
    ) => {
      const children = allTasks.filter((t) => t.parent_id === originalParentId);
      for (const subtask of children) {
        const newSubtask = await tasksClient.create({
          ...toDuplicatePayload(subtask, newParentId),
        });
        await duplicateSubtasksRecursively(subtask.id, newSubtask.id);
      }
    };

    await duplicateSubtasksRecursively(sourceTask.id, duplicatedTask.id);

    return duplicatedTask;
  },
};
