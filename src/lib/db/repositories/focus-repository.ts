import type Database from "better-sqlite3";
import { getDatabase } from "../index";

export interface FocusLog {
  id: string;
  user_id: string;
  task_id: string | null;
  start_time: string;
  end_time: string | null;
  duration_seconds: number;
  session_type: string;
  notes: string | null;
  created_at: string;
}

export class FocusRepository {
  constructor(private db?: Database.Database) {}

  private get connection(): Database.Database {
    return this.db || getDatabase();
  }

  logSession(input: {
    id?: string;
    user_id?: string;
    task_id?: string | null;
    start_time: string;
    end_time?: string | null;
    duration_seconds: number;
    session_type?: string;
    notes?: string | null;
  }): FocusLog {
    const id = input.id || crypto.randomUUID();
    const userId = input.user_id || "local_user";
    const now = new Date().toISOString();

    this.connection
      .prepare(
        `INSERT INTO focus_logs (id, user_id, task_id, start_time, end_time, duration_seconds, session_type, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        userId,
        input.task_id || null,
        input.start_time,
        input.end_time,
        input.duration_seconds,
        input.session_type || "focus",
        input.notes || null,
        now,
      );

    return this.getById(id)!;
  }

  create(input: {
    id?: string;
    user_id?: string;
    task_id?: string | null;
    start_time: string;
    end_time?: string | null;
    duration_seconds: number;
    session_type?: string;
    notes?: string | null;
  }): FocusLog {
    return this.logSession(input);
  }

  getById(id: string): FocusLog | null {
    const row = this.connection
      .prepare(`SELECT * FROM focus_logs WHERE id = ?`)
      .get(id) as FocusLog | undefined;
    return row || null;
  }

  list(userId = "local_user", limit = 50): FocusLog[] {
    let query = `SELECT * FROM focus_logs`;
    const params: unknown[] = [];
    if (userId && userId !== "local_user" && userId !== "guest") {
      query += ` WHERE user_id = ?`;
      params.push(userId);
    }
    query += ` ORDER BY start_time DESC LIMIT ?`;
    params.push(limit);
    return this.connection.prepare(query).all(...params) as FocusLog[];
  }

  getTotalFocusSeconds(userId = "local_user"): number {
    let query = `SELECT SUM(duration_seconds) as total FROM focus_logs`;
    const params: unknown[] = [];
    if (userId && userId !== "local_user" && userId !== "guest") {
      query += ` WHERE user_id = ?`;
      params.push(userId);
    }
    const row = this.connection.prepare(query).get(...params) as
      { total: number | null } | undefined;
    return row?.total ?? 0;
  }

  getByTaskId(taskId: string): FocusLog[] {
    return this.connection
      .prepare(
        `SELECT * FROM focus_logs WHERE task_id = ? ORDER BY start_time DESC`,
      )
      .all(taskId) as FocusLog[];
  }
}

export const focusRepository = new FocusRepository();
