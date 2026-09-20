import type Database from "better-sqlite3";
import { getDatabase } from "../index";
import type { Habit, HabitEntry, HabitWithEntries } from "@/lib/types/habit";

interface DbHabitRow {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  color: string;
  icon: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  start_date: string | null;
  sort_order: number;
  habit_type: string;
  frequency_count: number | null;
  frequency_period: string | null;
  target_type: string | null;
  target_value: number | null;
  unit: string | null;
  source_uuid: string | null;
}

interface DbHabitEntryRow {
  id: string;
  habit_id: string;
  date: string;
  value: number;
  created_at: string;
}

function mapHabit(row: DbHabitRow): Habit {
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    description: row.description,
    color: row.color,
    icon: row.icon,
    created_at: row.created_at,
    updated_at: row.updated_at,
    archived_at: row.archived_at,
    start_date: row.start_date,
    sort_order: row.sort_order,
    habit_type: (row.habit_type as "boolean" | "measurable") || "boolean",
    frequency_count: row.frequency_count,
    frequency_period:
      (row.frequency_period as "day" | "week" | "month") || "day",
    target_type: (row.target_type as "at_least" | "at_most") || "at_least",
    target_value: row.target_value,
    unit: row.unit,
    source_uuid: row.source_uuid,
  };
}

function mapEntry(row: DbHabitEntryRow): HabitEntry {
  return {
    id: row.id,
    habit_id: row.habit_id,
    date: row.date,
    value: row.value,
    created_at: row.created_at,
  };
}

export class HabitRepository {
  constructor(private db?: Database.Database) {}

  private get connection(): Database.Database {
    return this.db || getDatabase();
  }

  list(userId = "local_user"): HabitWithEntries[] {
    let habitQuery = `SELECT * FROM habits`;
    const params: unknown[] = [];
    if (userId && userId !== "local_user" && userId !== "guest") {
      habitQuery += ` WHERE user_id = ?`;
      params.push(userId);
    }
    habitQuery += ` ORDER BY sort_order ASC, created_at ASC`;
    const habits = (
      this.connection.prepare(habitQuery).all(...params) as DbHabitRow[]
    ).map(mapHabit);

    let entryQuery = `SELECT he.* FROM habit_entries he
           JOIN habits h ON h.id = he.habit_id`;
    const entryParams: unknown[] = [];
    if (userId && userId !== "local_user" && userId !== "guest") {
      entryQuery += ` WHERE h.user_id = ?`;
      entryParams.push(userId);
    }
    entryQuery += ` ORDER BY he.date ASC`;
    const entries = (
      this.connection
        .prepare(entryQuery)
        .all(...entryParams) as DbHabitEntryRow[]
    ).map(mapEntry);

    const entriesByHabit = new Map<string, HabitEntry[]>();
    for (const e of entries) {
      const list = entriesByHabit.get(e.habit_id) || [];
      list.push(e);
      entriesByHabit.set(e.habit_id, list);
    }

    return habits.map((h) => ({
      ...h,
      entries: entriesByHabit.get(h.id) || [],
    }));
  }

  getById(id: string): HabitWithEntries | null {
    const row = this.connection
      .prepare(`SELECT * FROM habits WHERE id = ?`)
      .get(id) as DbHabitRow | undefined;
    if (!row) return null;

    const habit = mapHabit(row);
    const entryRows = this.connection
      .prepare(
        `SELECT * FROM habit_entries WHERE habit_id = ? ORDER BY date ASC`,
      )
      .all(id) as DbHabitEntryRow[];

    return {
      ...habit,
      entries: entryRows.map(mapEntry),
    };
  }

  create(input: {
    id?: string;
    user_id?: string;
    name: string;
    description?: string | null;
    color?: string | null;
    icon?: string | null;
    start_date?: string | null;
    habitType?: "boolean" | "measurable" | null;
    frequencyCount?: number | null;
    frequencyPeriod?: "day" | "week" | "month" | null;
    targetType?: "at_least" | "at_most" | null;
    targetValue?: number | null;
    unit?: string | null;
    source_uuid?: string | null;
    sort_order?: number;
  }): Habit {
    const id = input.id || crypto.randomUUID();
    const userId = input.user_id || "local_user";
    const now = new Date().toISOString();

    let sortOrder = input.sort_order;
    if (sortOrder === undefined) {
      const maxRow = this.connection
        .prepare(
          `SELECT MAX(sort_order) as max_order FROM habits WHERE user_id = ?`,
        )
        .get(userId) as { max_order: number | null } | undefined;
      sortOrder = (maxRow?.max_order ?? -1) + 1;
    }

    this.connection
      .prepare(
        `INSERT INTO habits (
          id, user_id, name, description, color, icon,
          created_at, updated_at, archived_at, start_date, sort_order,
          habit_type, frequency_count, frequency_period, target_type,
          target_value, unit, source_uuid
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?
        )`,
      )
      .run(
        id,
        userId,
        input.name,
        input.description || null,
        input.color || "#4B6CB7",
        input.icon || null,
        now,
        now,
        null,
        input.start_date || now.split("T")[0],
        sortOrder,
        input.habitType || "boolean",
        input.frequencyCount ?? null,
        input.frequencyPeriod || "day",
        input.targetType || "at_least",
        input.targetValue ?? null,
        input.unit || null,
        input.source_uuid || null,
      );

    return this.getById(id)!;
  }

  update(id: string, updates: Partial<Habit>): Habit | null {
    const existing = this.getById(id);
    if (!existing) return null;

    const sets: string[] = [];
    const values: unknown[] = [];

    const fields: (keyof Habit)[] = [
      "name",
      "description",
      "color",
      "icon",
      "archived_at",
      "start_date",
      "sort_order",
      "habit_type",
      "frequency_count",
      "frequency_period",
      "target_type",
      "target_value",
      "unit",
    ];

    for (const field of fields) {
      if (updates[field] !== undefined) {
        sets.push(`${field} = ?`);
        values.push(updates[field]);
      }
    }

    if (sets.length === 0) return existing;

    sets.push("updated_at = ?");
    values.push(new Date().toISOString());
    values.push(id);

    this.connection
      .prepare(`UPDATE habits SET ${sets.join(", ")} WHERE id = ?`)
      .run(...values);

    return this.getById(id);
  }

  delete(id: string): boolean {
    const res = this.connection
      .prepare(`DELETE FROM habits WHERE id = ?`)
      .run(id);
    return res.changes > 0;
  }

  recordEntry(habitId: string, date: string, value = 1): HabitEntry {
    const entryId = crypto.randomUUID();
    const now = new Date().toISOString();

    this.connection
      .prepare(
        `INSERT INTO habit_entries (id, habit_id, date, value, created_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(habit_id, date) DO UPDATE SET value = excluded.value`,
      )
      .run(entryId, habitId, date, value, now);

    const row = this.connection
      .prepare(`SELECT * FROM habit_entries WHERE habit_id = ? AND date = ?`)
      .get(habitId, date) as DbHabitEntryRow;

    return mapEntry(row);
  }

  upsertEntry(habitId: string, date: string, value = 1): HabitEntry {
    return this.recordEntry(habitId, date, value);
  }

  deleteEntry(habitId: string, date: string): boolean {
    const res = this.connection
      .prepare(`DELETE FROM habit_entries WHERE habit_id = ? AND date = ?`)
      .run(habitId, date);
    return res.changes > 0;
  }

  calculateStreak(habitId: string): {
    currentStreak: number;
    longestStreak: number;
  } {
    const rows = this.connection
      .prepare(
        `SELECT date FROM habit_entries WHERE habit_id = ? AND value > 0 ORDER BY date ASC`,
      )
      .all(habitId) as { date: string }[];

    if (rows.length === 0) return { currentStreak: 0, longestStreak: 0 };

    const dateSet = new Set(rows.map((r) => r.date));
    const sortedDates = Array.from(dateSet).sort();

    let longestStreak = 0;
    let currentStreakCount = 0;
    let prevDate: Date | null = null;

    for (const dateStr of sortedDates) {
      const curDate = new Date(`${dateStr}T00:00:00Z`);
      if (prevDate) {
        const diffDays = Math.round(
          (curDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24),
        );
        if (diffDays === 1) {
          currentStreakCount++;
        } else if (diffDays > 1) {
          currentStreakCount = 1;
        }
      } else {
        currentStreakCount = 1;
      }
      if (currentStreakCount > longestStreak) {
        longestStreak = currentStreakCount;
      }
      prevDate = curDate;
    }

    // Determine current active streak ending today or yesterday
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    const yesterday = new Date(today.getTime() - 86400000);
    const yesterdayStr = yesterday.toISOString().split("T")[0];

    let currentStreak = 0;
    const checkDate = dateSet.has(todayStr)
      ? today
      : dateSet.has(yesterdayStr)
        ? yesterday
        : null;

    if (checkDate) {
      let d = new Date(checkDate);
      while (true) {
        const dStr = d.toISOString().split("T")[0];
        if (dateSet.has(dStr)) {
          currentStreak++;
          d = new Date(d.getTime() - 86400000);
        } else {
          break;
        }
      }
    }

    return { currentStreak, longestStreak };
  }
}

export const habitRepository = new HabitRepository();
