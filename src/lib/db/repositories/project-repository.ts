import type Database from "better-sqlite3";
import { getDatabase } from "../index";
import type { Project } from "@/lib/types/task";

interface DbProjectRow {
  id: string;
  user_id: string;
  name: string;
  color: string;
  view_style: string;
  is_inbox: number;
  is_archived: number;
  created_at: string;
  updated_at: string;
}

function mapRow(row: DbProjectRow): Project {
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    color: row.color,
    view_style: (row.view_style as "list" | "board") || "list",
    is_inbox: Boolean(row.is_inbox),
    is_archived: Boolean(row.is_archived),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export class ProjectRepository {
  constructor(private db?: Database.Database) {}

  private get connection(): Database.Database {
    return this.db || getDatabase();
  }

  list(userId = "local_user"): Project[] {
    let query = `SELECT * FROM projects`;
    const params: unknown[] = [];
    if (userId && userId !== "local_user" && userId !== "guest") {
      query += ` WHERE user_id = ?`;
      params.push(userId);
    }
    query += ` ORDER BY is_inbox DESC, created_at ASC`;
    const rows = this.connection
      .prepare(query)
      .all(...params) as DbProjectRow[];
    return rows.map(mapRow);
  }

  getById(id: string): Project | null {
    const row = this.connection
      .prepare(`SELECT * FROM projects WHERE id = ?`)
      .get(id) as DbProjectRow | undefined;
    return row ? mapRow(row) : null;
  }

  create(input: {
    id?: string;
    user_id?: string;
    name: string;
    color?: string;
    view_style?: "list" | "board";
    is_inbox?: boolean;
    is_archived?: boolean;
    created_at?: string;
    updated_at?: string;
  }): Project {
    const now = new Date().toISOString();
    const id = input.id || crypto.randomUUID();
    const userId = input.user_id || "local_user";
    const color = input.color || "#6366f1";
    const viewStyle = input.view_style || "list";
    const isInbox = input.is_inbox ? 1 : 0;
    const isArchived = input.is_archived ? 1 : 0;
    const createdAt = input.created_at || now;
    const updatedAt = input.updated_at || now;

    this.connection
      .prepare(
        `INSERT INTO projects (id, user_id, name, color, view_style, is_inbox, is_archived, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        userId,
        input.name,
        color,
        viewStyle,
        isInbox,
        isArchived,
        createdAt,
        updatedAt,
      );

    return this.getById(id)!;
  }

  update(
    id: string,
    updates: Partial<{
      name: string;
      color: string;
      view_style: "list" | "board";
      is_inbox: boolean;
      is_archived: boolean;
    }>,
  ): Project | null {
    const existing = this.getById(id);
    if (!existing) return null;

    const sets: string[] = [];
    const values: unknown[] = [];

    if (updates.name !== undefined) {
      sets.push("name = ?");
      values.push(updates.name);
    }
    if (updates.color !== undefined) {
      sets.push("color = ?");
      values.push(updates.color);
    }
    if (updates.view_style !== undefined) {
      sets.push("view_style = ?");
      values.push(updates.view_style);
    }
    if (updates.is_inbox !== undefined) {
      sets.push("is_inbox = ?");
      values.push(updates.is_inbox ? 1 : 0);
    }
    if (updates.is_archived !== undefined) {
      sets.push("is_archived = ?");
      values.push(updates.is_archived ? 1 : 0);
    }

    if (sets.length === 0) return existing;

    sets.push("updated_at = ?");
    values.push(new Date().toISOString());
    values.push(id);

    this.connection
      .prepare(`UPDATE projects SET ${sets.join(", ")} WHERE id = ?`)
      .run(...values);

    return this.getById(id);
  }

  delete(id: string): boolean {
    const res = this.connection
      .prepare(`DELETE FROM projects WHERE id = ?`)
      .run(id);
    return res.changes > 0;
  }
}

export const projectRepository = new ProjectRepository();
