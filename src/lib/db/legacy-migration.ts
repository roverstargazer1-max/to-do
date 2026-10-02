import type Database from "better-sqlite3";

const DOMAIN_TABLES = [
  "projects",
  "tasks",
  "habits",
  "habit_entries",
  "focus_logs",
  "calendar_events",
  "workspaces",
  "workspace_nodes",
  "workspace_edges",
  "visual_assets",
  "visual_asset_versions",
  "visual_annotations",
  "visual_derived",
  "visual_relations",
  "visual_flow_drafts",
];

/** Call inside the import transaction so another writer cannot race the check. */
export function hasLocalDataForMigration(db: Database.Database): boolean {
  return DOMAIN_TABLES.some((table) =>
    Boolean(db.prepare(`SELECT 1 FROM ${table} LIMIT 1`).get()),
  );
}
