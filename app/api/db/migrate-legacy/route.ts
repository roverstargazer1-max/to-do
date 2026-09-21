import { NextRequest, NextResponse } from "next/server";
import * as fs from "node:fs";
import * as path from "node:path";
import * as Sentry from "@sentry/nextjs";
import { getDatabase } from "@/lib/db/index";
import { getDatabasePath } from "@/lib/db/config";
import { assetService } from "@/lib/assets/asset-service";
import type { FocusLog } from "@/lib/db/repositories/focus-repository";
import type { Task, Project } from "@/lib/types/task";
import type { Habit, HabitEntry } from "@/lib/types/habit";
import type { CalendarEvent } from "@/lib/types/calendar-event";
import type {
  Workspace,
  WorkspaceNode,
  WorkspaceEdge,
} from "@/lib/types/workspace";

interface LegacyMigrationPayload {
  replace?: boolean;
  createSnapshot?: boolean;
  guestData?: {
    projects?: Project[];
    tasks?: Task[];
    habits?: Habit[];
    habit_entries?: HabitEntry[];
    focus_logs?: Array<Partial<FocusLog>>;
    events?: CalendarEvent[];
  };
  workspaceData?: {
    workspaces?: Workspace[];
    nodes?: WorkspaceNode[];
    edges?: WorkspaceEdge[];
  };
  visualAssets?: Array<{
    fileName: string;
    mimeType: string;
    base64: string;
    width?: number;
    height?: number;
  }>;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as LegacyMigrationPayload;
    const db = getDatabase();

    // Auto-create point-in-time snapshot before replacement if requested
    const targetDbPath = getDatabasePath();
    if (
      body.replace &&
      body.createSnapshot !== false &&
      targetDbPath &&
      targetDbPath !== ":memory:"
    ) {
      try {
        const snapshotDir = path.join(path.dirname(targetDbPath), "snapshots");
        if (!fs.existsSync(snapshotDir)) {
          fs.mkdirSync(snapshotDir, { recursive: true });
        }
        const snapshotFile = path.join(
          snapshotDir,
          `auto-backup-${Date.now()}.db`,
        );
        db.prepare("VACUUM INTO ?").run(snapshotFile);
      } catch (e) {
        console.warn(
          "[migrate-legacy] Auto-snapshot before replace failed:",
          e,
        );
        Sentry.captureException(e);
      }
    }

    const insertAll = db.transaction(() => {
      if (body.replace) {
        // Safe domain-by-domain clearing in FK dependency order before mirror insertion
        if (
          body.workspaceData?.edges !== undefined ||
          body.workspaceData?.nodes !== undefined ||
          body.workspaceData?.workspaces !== undefined
        ) {
          db.exec(
            "DELETE FROM workspace_edges; DELETE FROM workspace_nodes; DELETE FROM workspaces;",
          );
        }
        if (
          body.guestData?.habit_entries !== undefined ||
          body.guestData?.habits !== undefined
        ) {
          db.exec("DELETE FROM habit_entries; DELETE FROM habits;");
        }
        if (body.guestData?.focus_logs !== undefined) {
          db.exec("DELETE FROM focus_logs;");
        }
        if (body.guestData?.tasks !== undefined) {
          db.exec("DELETE FROM tasks;");
        }
        if (body.guestData?.projects !== undefined) {
          db.exec("DELETE FROM projects;");
        }
        if (body.guestData?.events !== undefined) {
          db.exec("DELETE FROM calendar_events;");
        }
      }

      // 1. Projects
      if (body.guestData?.projects) {
        const stmt = db.prepare(
          `INSERT INTO projects (id, user_id, name, color, view_style, is_inbox, is_archived, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             color = excluded.color,
             view_style = excluded.view_style,
             is_inbox = excluded.is_inbox,
             is_archived = excluded.is_archived,
             updated_at = excluded.updated_at`,
        );
        for (const p of body.guestData.projects) {
          stmt.run(
            p.id,
            p.user_id || "local_user",
            p.name,
            p.color || "#6366f1",
            p.view_style || "list",
            p.is_inbox ? 1 : 0,
            p.is_archived ? 1 : 0,
            p.created_at || new Date().toISOString(),
            p.updated_at || new Date().toISOString(),
          );
        }
      }

      // 2. Tasks
      if (body.guestData?.tasks) {
        const stmt = db.prepare(
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
          ) ON CONFLICT(id) DO UPDATE SET
            content = excluded.content,
            description = excluded.description,
            priority = excluded.priority,
            due_date = excluded.due_date,
            do_date = excluded.do_date,
            is_evening = excluded.is_evening,
            is_completed = excluded.is_completed,
            completed_at = excluded.completed_at,
            day_order = excluded.day_order,
            recurrence = excluded.recurrence,
            recurring_series_id = excluded.recurring_series_id,
            updated_at = excluded.updated_at`,
        );
        for (const t of body.guestData.tasks) {
          stmt.run(
            t.id,
            t.user_id || "local_user",
            t.project_id || null,
            t.parent_id || null,
            t.content,
            t.description || null,
            t.priority || 4,
            t.due_date || null,
            t.do_date || null,
            t.is_evening ? 1 : 0,
            t.is_completed ? 1 : 0,
            t.completed_at || null,
            t.day_order || 0,
            t.recurrence ? JSON.stringify(t.recurrence) : null,
            t.recurring_series_id || null,
            t.google_event_id || null,
            t.google_etag || null,
            t.created_at || new Date().toISOString(),
            t.updated_at || new Date().toISOString(),
          );
        }
      }

      // 3. Habits
      if (body.guestData?.habits) {
        const stmt = db.prepare(
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
          ) ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            description = excluded.description,
            color = excluded.color,
            icon = excluded.icon,
            updated_at = excluded.updated_at`,
        );
        for (const h of body.guestData.habits) {
          stmt.run(
            h.id,
            h.user_id || "local_user",
            h.name,
            h.description || null,
            h.color || "#4B6CB7",
            h.icon || null,
            h.created_at || new Date().toISOString(),
            h.updated_at || new Date().toISOString(),
            h.archived_at || null,
            h.start_date || null,
            h.sort_order || 0,
            h.habit_type || "boolean",
            h.frequency_count ?? null,
            h.frequency_period || "day",
            h.target_type || "at_least",
            h.target_value ?? null,
            h.unit || null,
            h.source_uuid || null,
          );
        }
      }

      // 4. Habit Entries
      if (body.guestData?.habit_entries) {
        const stmt = db.prepare(
          `INSERT INTO habit_entries (id, habit_id, date, value, created_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(habit_id, date) DO UPDATE SET value = excluded.value`,
        );
        for (const e of body.guestData.habit_entries) {
          stmt.run(
            e.id || crypto.randomUUID(),
            e.habit_id,
            e.date,
            e.value ?? 1,
            e.created_at || new Date().toISOString(),
          );
        }
      }

      // 5. Focus Logs
      if (body.guestData?.focus_logs) {
        const stmt = db.prepare(
          `INSERT INTO focus_logs (id, user_id, task_id, start_time, end_time, duration_seconds, session_type, notes, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO NOTHING`,
        );
        for (const f of body.guestData.focus_logs) {
          stmt.run(
            f.id || crypto.randomUUID(),
            f.user_id || "local_user",
            f.task_id || null,
            f.start_time || new Date().toISOString(),
            f.end_time || new Date().toISOString(),
            f.duration_seconds || 0,
            f.session_type || "focus",
            f.notes || null,
            f.created_at || new Date().toISOString(),
          );
        }
      }

      // 6. Calendar Events
      if (body.guestData?.events) {
        const stmt = db.prepare(
          `INSERT INTO calendar_events (
            id, user_id, title, description, location,
            start_time, end_time, all_day, color, category,
            recurrence_rule, is_archived, metadata, created_at, updated_at
          ) VALUES (
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?
          ) ON CONFLICT(id) DO UPDATE SET
            title = excluded.title,
            description = excluded.description,
            start_time = excluded.start_time,
            end_time = excluded.end_time,
            all_day = excluded.all_day,
            color = excluded.color,
            updated_at = excluded.updated_at`,
        );
        for (const ev of body.guestData.events) {
          stmt.run(
            ev.id,
            ev.user_id || "local_user",
            ev.title,
            ev.description || null,
            ev.location || null,
            ev.start_time,
            ev.end_time,
            ev.all_day ? 1 : 0,
            ev.color || "#4B6CB7",
            ev.category || null,
            ev.recurrence_rule || null,
            ev.is_archived ? 1 : 0,
            ev.metadata ? JSON.stringify(ev.metadata) : null,
            ev.created_at || new Date().toISOString(),
            ev.updated_at || new Date().toISOString(),
          );
        }
      }

      // 7. Workspaces
      if (body.workspaceData?.workspaces) {
        const stmt = db.prepare(
          `INSERT INTO workspaces (id, user_id, name, color, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             color = excluded.color,
             updated_at = excluded.updated_at`,
        );
        for (const ws of body.workspaceData.workspaces) {
          stmt.run(
            ws.id,
            ws.user_id || "local_user",
            ws.name,
            ws.color || null,
            ws.created_at || new Date().toISOString(),
            ws.updated_at || new Date().toISOString(),
          );
        }
      }

      // 8. Workspace Nodes
      if (body.workspaceData?.nodes) {
        const stmt = db.prepare(
          `INSERT INTO workspace_nodes (
            id, workspace_id, user_id, kind, entity_type, entity_id,
            position_x, position_y, width, height, group_id, display_config,
            created_at, updated_at
          ) VALUES (
            ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?,
            ?, ?
          ) ON CONFLICT(id) DO UPDATE SET
            position_x = excluded.position_x,
            position_y = excluded.position_y,
            width = excluded.width,
            height = excluded.height,
            group_id = excluded.group_id,
            display_config = excluded.display_config,
            updated_at = excluded.updated_at`,
        );
        for (const node of body.workspaceData.nodes) {
          stmt.run(
            node.id,
            node.workspace_id,
            node.user_id || "local_user",
            node.kind,
            node.entity_type || null,
            node.entity_id || null,
            node.position_x,
            node.position_y,
            node.width ?? null,
            node.height ?? null,
            node.group_id ?? null,
            node.display_config ? JSON.stringify(node.display_config) : null,
            node.created_at || new Date().toISOString(),
            node.updated_at || new Date().toISOString(),
          );
        }
      }

      // 9. Workspace Edges
      if (body.workspaceData?.edges) {
        const stmt = db.prepare(
          `INSERT INTO workspace_edges (id, workspace_id, user_id, source_node_id, target_node_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(source_node_id, target_node_id) DO NOTHING`,
        );
        for (const edge of body.workspaceData.edges) {
          stmt.run(
            edge.id || crypto.randomUUID(),
            edge.workspace_id,
            edge.user_id || "local_user",
            edge.source_node_id,
            edge.target_node_id,
            edge.created_at || new Date().toISOString(),
          );
        }
      }
    });

    db.pragma("foreign_keys = OFF;");
    try {
      insertAll();
    } finally {
      db.pragma("foreign_keys = ON;");
    }

    // 10. Extract & Save Visual Assets to disk
    if (body.visualAssets && body.visualAssets.length > 0) {
      for (const asset of body.visualAssets) {
        try {
          const buffer = Buffer.from(asset.base64, "base64");
          assetService.saveAsset(
            buffer,
            asset.fileName,
            asset.mimeType,
            asset.width,
            asset.height,
          );
        } catch (e) {
          console.warn("Failed to migrate asset:", asset.fileName, e);
          Sentry.captureException(e);
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: "Legacy migration completed successfully",
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Legacy migration failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
