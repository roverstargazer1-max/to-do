import type Database from "better-sqlite3";
import { getDatabase } from "../index";
import type {
  CalendarEvent,
  CreateCalendarEventInput,
  UpdateCalendarEventInput,
} from "@/lib/types/calendar-event";

interface DbCalendarRow {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  location: string | null;
  start_time: string;
  end_time: string;
  all_day: number;
  color: string;
  category: string | null;
  recurrence_rule: string | null;
  remote_id: string | null;
  remote_calendar_id: string | null;
  etag: string | null;
  ics_uid: string | null;
  sync_state: string | null;
  is_archived: number;
  metadata: string | null;
  created_at: string;
  updated_at: string;
}

function mapRow(row: DbCalendarRow): CalendarEvent {
  return {
    id: row.id,
    user_id: row.user_id,
    title: row.title,
    description: row.description,
    location: row.location,
    start_time: row.start_time,
    end_time: row.end_time,
    all_day: Boolean(row.all_day),
    color: row.color,
    category: row.category,
    recurrence_rule: row.recurrence_rule,
    remote_id: row.remote_id,
    remote_calendar_id: row.remote_calendar_id,
    etag: row.etag,
    ics_uid: row.ics_uid,
    sync_state: row.sync_state as CalendarEvent["sync_state"],
    is_archived: Boolean(row.is_archived),
    metadata: row.metadata ? JSON.parse(row.metadata) : {},
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export class CalendarRepository {
  constructor(private db?: Database.Database) {}

  private get connection(): Database.Database {
    return this.db || getDatabase();
  }

  list(
    options: { start?: string; end?: string; userId?: string } = {},
  ): CalendarEvent[] {
    let query = `SELECT * FROM calendar_events WHERE is_archived = 0`;
    const params: unknown[] = [];

    if (
      options.userId &&
      options.userId !== "local_user" &&
      options.userId !== "guest"
    ) {
      query += ` AND user_id = ?`;
      params.push(options.userId);
    }

    if (options.start) {
      query += ` AND end_time >= ?`;
      params.push(options.start);
    }
    if (options.end) {
      query += ` AND start_time <= ?`;
      params.push(options.end);
    }

    query += ` ORDER BY start_time ASC`;
    const rows = this.connection
      .prepare(query)
      .all(...params) as DbCalendarRow[];
    return rows.map(mapRow);
  }

  getById(id: string): CalendarEvent | null {
    const row = this.connection
      .prepare(`SELECT * FROM calendar_events WHERE id = ?`)
      .get(id) as DbCalendarRow | undefined;
    return row ? mapRow(row) : null;
  }

  create(
    input: CreateCalendarEventInput & { id?: string; user_id?: string },
  ): CalendarEvent {
    const id = input.id || crypto.randomUUID();
    const userId = input.user_id || "local_user";
    const now = new Date().toISOString();

    this.connection
      .prepare(
        `INSERT INTO calendar_events (
          id, user_id, title, description, location,
          start_time, end_time, all_day, color, category,
          recurrence_rule, is_archived, metadata, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?
        )`,
      )
      .run(
        id,
        userId,
        input.title,
        input.description || null,
        input.location || null,
        input.start_time,
        input.end_time,
        input.all_day ? 1 : 0,
        input.color || "#4B6CB7",
        input.category || null,
        input.recurrence_rule || null,
        0,
        input.metadata ? JSON.stringify(input.metadata) : null,
        now,
        now,
      );

    return this.getById(id)!;
  }

  update(
    id: string,
    updates: Partial<UpdateCalendarEventInput & Partial<CalendarEvent>>,
  ): CalendarEvent | null {
    const existing = this.getById(id);
    if (!existing) return null;

    const sets: string[] = [];
    const values: unknown[] = [];

    const stringFields: (keyof CalendarEvent)[] = [
      "title",
      "description",
      "location",
      "start_time",
      "end_time",
      "color",
      "category",
      "recurrence_rule",
    ];

    for (const field of stringFields) {
      if (updates[field] !== undefined) {
        sets.push(`${field} = ?`);
        values.push(updates[field]);
      }
    }

    if (updates.all_day !== undefined) {
      sets.push("all_day = ?");
      values.push(updates.all_day ? 1 : 0);
    }

    if (updates.is_archived !== undefined) {
      sets.push("is_archived = ?");
      values.push(updates.is_archived ? 1 : 0);
    }

    if (updates.metadata !== undefined) {
      sets.push("metadata = ?");
      values.push(JSON.stringify(updates.metadata));
    }

    if (sets.length === 0) return existing;

    sets.push("updated_at = ?");
    values.push(new Date().toISOString());
    values.push(id);

    this.connection
      .prepare(`UPDATE calendar_events SET ${sets.join(", ")} WHERE id = ?`)
      .run(...values);

    return this.getById(id);
  }

  delete(id: string): boolean {
    const res = this.connection
      .prepare(`DELETE FROM calendar_events WHERE id = ?`)
      .run(id);
    return res.changes > 0;
  }
}

export const calendarRepository = new CalendarRepository();
