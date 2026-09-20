import type Database from "better-sqlite3";
import { getDatabase } from "../index";
import type {
  Task,
  SubtaskSummary,
  CreateTaskInput,
  UpdateTaskInput,
} from "@/lib/types/task";

interface DbTaskRow {
  id: string;
  user_id: string;
  project_id: string | null;
  parent_id: string | null;
  content: string;
  description: string | null;
  priority: number;
  due_date: string | null;
  do_date: string | null;
  is_evening: number;
  is_completed: number;
  completed_at: string | null;
  day_order: number;
  recurrence: string | null;
  recurring_series_id: string | null;
  google_event_id: string | null;
  google_etag: string | null;
  created_at: string;
  updated_at: string;
}

function mapRow(row: DbTaskRow): Task {
  return {
    id: row.id,
    user_id: row.user_id,
    project_id: row.project_id,
    parent_id: row.parent_id,
    content: row.content,
    description: row.description,
    priority: (row.priority as 1 | 2 | 3 | 4) || 4,
    due_date: row.due_date,
    do_date: row.do_date,
    is_evening: Boolean(row.is_evening),
    is_completed: Boolean(row.is_completed),
    completed_at: row.completed_at,
    day_order: row.day_order,
    recurrence: row.recurrence ? JSON.parse(row.recurrence) : null,
    recurring_series_id: row.recurring_series_id,
    google_event_id: row.google_event_id,
    google_etag: row.google_etag,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export interface ListTasksOptions {
  userId?: string;
  projectId?: string | null;
  showCompleted?: boolean;
  filter?: string;
}

export class TaskRepository {
  constructor(private db?: Database.Database) {}

  private get connection(): Database.Database {
    return this.db || getDatabase();
  }

  list(options: ListTasksOptions = {}): Task[] {
    const { projectId, showCompleted = false, filter } = options;
    let query = `SELECT * FROM tasks WHERE 1=1`;
    const params: unknown[] = [];

    if (
      options.userId &&
      options.userId !== "local_user" &&
      options.userId !== "guest"
    ) {
      query += ` AND user_id = ?`;
      params.push(options.userId);
    }

    if (projectId === "inbox") {
      query += ` AND project_id IS NULL`;
    } else if (projectId === "all") {
      query += ` AND (project_id IS NULL OR project_id NOT IN (SELECT id FROM projects WHERE is_archived = 1))`;
    } else if (projectId) {
      query += ` AND project_id = ?`;
      params.push(projectId);
    }

    if (filter === "today") {
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      query += ` AND due_date IS NOT NULL AND due_date <= ?`;
      params.push(today.toISOString());
    } else if (filter === "p1") {
      query += ` AND priority = 1`;
    }

    if (!showCompleted) {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      query += ` AND (is_completed = 0 OR completed_at >= ?)`;
      params.push(todayStart.toISOString());
    }

    query += ` ORDER BY day_order ASC, created_at DESC`;

    const rows = this.connection.prepare(query).all(...params) as DbTaskRow[];
    const tasks = rows.map(mapRow);

    // Fetch subtasks summaries for parents
    let subtasksQuery = `SELECT id, parent_id, is_completed FROM tasks WHERE parent_id IS NOT NULL`;
    const subtaskParams: unknown[] = [];
    if (
      options.userId &&
      options.userId !== "local_user" &&
      options.userId !== "guest"
    ) {
      subtasksQuery += ` AND user_id = ?`;
      subtaskParams.push(options.userId);
    }

    const allChildRows = this.connection
      .prepare(subtasksQuery)
      .all(...subtaskParams) as {
      id: string;
      parent_id: string;
      is_completed: number;
    }[];

    const subtasksByParent = new Map<string, SubtaskSummary[]>();
    for (const child of allChildRows) {
      const list = subtasksByParent.get(child.parent_id) || [];
      list.push({ id: child.id, is_completed: Boolean(child.is_completed) });
      subtasksByParent.set(child.parent_id, list);
    }

    return tasks.map((t) => ({
      ...t,
      subtasks: subtasksByParent.get(t.id) || [],
    }));
  }

  getById(id: string): Task | null {
    const row = this.connection
      .prepare(`SELECT * FROM tasks WHERE id = ?`)
      .get(id) as DbTaskRow | undefined;
    if (!row) return null;

    const task = mapRow(row);
    const subtaskRows = this.connection
      .prepare(`SELECT id, is_completed FROM tasks WHERE parent_id = ?`)
      .all(id) as { id: string; is_completed: number }[];
    task.subtasks = subtaskRows.map((s) => ({
      id: s.id,
      is_completed: Boolean(s.is_completed),
    }));
    return task;
  }

  create(
    input: CreateTaskInput & {
      id?: string;
      user_id?: string;
      day_order?: number;
      is_completed?: boolean;
      completed_at?: string | null;
      recurring_series_id?: string | null;
      google_event_id?: string | null;
      google_etag?: string | null;
      created_at?: string;
      updated_at?: string;
    },
  ): Task {
    const id = input.id || crypto.randomUUID();
    const userId = input.user_id || "local_user";
    const now = new Date().toISOString();
    const createdAt = input.created_at || now;
    const updatedAt = input.updated_at || now;

    let dayOrder = input.day_order;
    if (dayOrder === undefined) {
      const maxRow = this.connection
        .prepare(
          `SELECT MAX(day_order) as max_order FROM tasks WHERE user_id = ?`,
        )
        .get(userId) as { max_order: number | null } | undefined;
      dayOrder = (maxRow?.max_order ?? -1) + 1;
    }

    const seriesId =
      input.recurring_series_id !== undefined
        ? input.recurring_series_id
        : input.recurrence
          ? crypto.randomUUID()
          : null;

    const recurrenceStr = input.recurrence
      ? JSON.stringify(input.recurrence)
      : null;

    this.connection
      .prepare(
        `INSERT INTO tasks (
          id, user_id, project_id, parent_id, content, description,
          priority, due_date, do_date, is_evening, is_completed,
          completed_at, day_order, recurrence, recurring_series_id,
          google_event_id, google_etag, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?
        )`,
      )
      .run(
        id,
        userId,
        input.project_id || null,
        input.parent_id || null,
        input.content,
        input.description || null,
        input.priority || 4,
        input.due_date || null,
        input.do_date || null,
        input.is_evening ? 1 : 0,
        input.is_completed ? 1 : 0,
        input.completed_at || null,
        dayOrder,
        recurrenceStr,
        seriesId,
        input.google_event_id || null,
        input.google_etag || null,
        createdAt,
        updatedAt,
      );

    return this.getById(id)!;
  }

  update(
    id: string,
    updates: Partial<UpdateTaskInput & Partial<Task>>,
  ): Task | null {
    const existing = this.getById(id);
    if (!existing) return null;

    const sets: string[] = [];
    const values: unknown[] = [];

    if (updates.content !== undefined) {
      sets.push("content = ?");
      values.push(updates.content);
    }
    if (updates.description !== undefined) {
      sets.push("description = ?");
      values.push(updates.description);
    }
    if (updates.priority !== undefined) {
      sets.push("priority = ?");
      values.push(updates.priority);
    }
    if (updates.due_date !== undefined) {
      sets.push("due_date = ?");
      values.push(updates.due_date);
    }
    if (updates.do_date !== undefined) {
      sets.push("do_date = ?");
      values.push(updates.do_date);
    }
    if (updates.is_evening !== undefined) {
      sets.push("is_evening = ?");
      values.push(updates.is_evening ? 1 : 0);
    }
    if (updates.project_id !== undefined) {
      sets.push("project_id = ?");
      values.push(updates.project_id);
    }
    if (updates.parent_id !== undefined) {
      sets.push("parent_id = ?");
      values.push(updates.parent_id);
    }
    if (updates.is_completed !== undefined) {
      sets.push("is_completed = ?");
      values.push(updates.is_completed ? 1 : 0);
    }
    if (updates.completed_at !== undefined) {
      sets.push("completed_at = ?");
      values.push(updates.completed_at);
    }
    if (updates.day_order !== undefined) {
      sets.push("day_order = ?");
      values.push(updates.day_order);
    }
    if (updates.recurrence !== undefined) {
      sets.push("recurrence = ?");
      values.push(
        updates.recurrence ? JSON.stringify(updates.recurrence) : null,
      );
    }
    let seriesIdToSet: string | null | undefined = updates.recurring_series_id;
    if (
      seriesIdToSet === undefined &&
      updates.recurrence &&
      !existing.recurring_series_id
    ) {
      seriesIdToSet = crypto.randomUUID();
    }
    if (seriesIdToSet !== undefined) {
      sets.push("recurring_series_id = ?");
      values.push(seriesIdToSet);
    }

    if (sets.length === 0) return existing;

    sets.push("updated_at = ?");
    values.push(new Date().toISOString());
    values.push(id);

    this.connection
      .prepare(`UPDATE tasks SET ${sets.join(", ")} WHERE id = ?`)
      .run(...values);

    return this.getById(id);
  }

  toggleComplete(id: string): Task | null {
    const existing = this.getById(id);
    if (!existing) return null;

    const nextCompleted = !existing.is_completed;
    const completedAt = nextCompleted ? new Date().toISOString() : null;

    return this.update(id, {
      is_completed: nextCompleted,
      completed_at: completedAt,
    });
  }

  delete(id: string): boolean {
    const res = this.connection
      .prepare(`DELETE FROM tasks WHERE id = ?`)
      .run(id);
    return res.changes > 0;
  }

  reorder(taskIds: string[]): void {
    const stmt = this.connection.prepare(
      `UPDATE tasks SET day_order = ?, updated_at = ? WHERE id = ?`,
    );
    const now = new Date().toISOString();
    const runInTransaction = this.connection.transaction(() => {
      for (let i = 0; i < taskIds.length; i++) {
        stmt.run(i, now, taskIds[i]);
      }
    });
    runInTransaction();
  }

  moveProjectTasksToInbox(projectId: string): number {
    const res = this.connection
      .prepare(
        `UPDATE tasks SET project_id = NULL, updated_at = ? WHERE project_id = ?`,
      )
      .run(new Date().toISOString(), projectId);
    return res.changes;
  }

  deleteProjectTasks(projectId: string): number {
    const res = this.connection
      .prepare(`DELETE FROM tasks WHERE project_id = ?`)
      .run(projectId);
    return res.changes;
  }
}

export const taskRepository = new TaskRepository();
