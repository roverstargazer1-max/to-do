import type Database from "better-sqlite3";

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "001_baseline_tasks_projects",
    sql: `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'local_user',
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6366f1',
  view_style TEXT NOT NULL DEFAULT 'list',
  is_inbox INTEGER NOT NULL DEFAULT 0,
  is_archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'local_user',
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  description TEXT,
  priority INTEGER NOT NULL DEFAULT 4,
  due_date TEXT,
  do_date TEXT,
  is_evening INTEGER NOT NULL DEFAULT 0,
  is_completed INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  day_order INTEGER NOT NULL DEFAULT 0,
  recurrence TEXT,
  recurring_series_id TEXT,
  google_event_id TEXT,
  google_etag TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_parent_id ON tasks(parent_id);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_day_order ON tasks(day_order);
CREATE INDEX IF NOT EXISTS idx_tasks_is_completed ON tasks(is_completed);
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
`,
  },
  {
    version: 2,
    name: "002_habits_focus_calendar",
    sql: `
CREATE TABLE IF NOT EXISTS habits (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'local_user',
  name TEXT NOT NULL,
  description TEXT,
  color TEXT NOT NULL DEFAULT '#4B6CB7',
  icon TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  start_date TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  habit_type TEXT NOT NULL DEFAULT 'boolean',
  frequency_count INTEGER,
  frequency_period TEXT DEFAULT 'day',
  target_type TEXT DEFAULT 'at_least',
  target_value REAL,
  unit TEXT,
  source_uuid TEXT
);

CREATE TABLE IF NOT EXISTS habit_entries (
  id TEXT PRIMARY KEY,
  habit_id TEXT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  value REAL NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  UNIQUE(habit_id, date)
);

CREATE TABLE IF NOT EXISTS focus_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'local_user',
  task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL,
  session_type TEXT DEFAULT 'focus',
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS calendar_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'local_user',
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  all_day INTEGER NOT NULL DEFAULT 0,
  color TEXT NOT NULL DEFAULT '#4B6CB7',
  category TEXT,
  recurrence_rule TEXT,
  remote_id TEXT,
  remote_calendar_id TEXT,
  etag TEXT,
  ics_uid TEXT,
  sync_state TEXT,
  is_archived INTEGER NOT NULL DEFAULT 0,
  metadata TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_habit_entries_habit_id ON habit_entries(habit_id);
CREATE INDEX IF NOT EXISTS idx_habit_entries_date ON habit_entries(date);
CREATE INDEX IF NOT EXISTS idx_focus_logs_task_id ON focus_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_focus_logs_start_time ON focus_logs(start_time);
CREATE INDEX IF NOT EXISTS idx_calendar_events_start_time ON calendar_events(start_time);
CREATE INDEX IF NOT EXISTS idx_calendar_events_end_time ON calendar_events(end_time);
`,
  },
  {
    version: 3,
    name: "003_workspace_and_assets",
    sql: `
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'local_user',
  name TEXT NOT NULL,
  color TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspace_nodes (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL DEFAULT 'local_user',
  kind TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  position_x REAL NOT NULL,
  position_y REAL NOT NULL,
  width REAL,
  height REAL,
  group_id TEXT REFERENCES workspace_nodes(id) ON DELETE SET NULL,
  display_config TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspace_edges (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL DEFAULT 'local_user',
  source_node_id TEXT NOT NULL REFERENCES workspace_nodes(id) ON DELETE CASCADE,
  target_node_id TEXT NOT NULL REFERENCES workspace_nodes(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  UNIQUE(source_node_id, target_node_id)
);

CREATE TABLE IF NOT EXISTS visual_assets (
  id TEXT PRIMARY KEY,
  hash TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  file_path TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workspace_nodes_workspace_id ON workspace_nodes(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_edges_workspace_id ON workspace_edges(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_edges_source ON workspace_edges(source_node_id);
CREATE INDEX IF NOT EXISTS idx_workspace_edges_target ON workspace_edges(target_node_id);
CREATE INDEX IF NOT EXISTS idx_visual_assets_hash ON visual_assets(hash);
`,
  },
  {
    version: 4,
    name: "004_visual_store",
    sql: `
CREATE TABLE IF NOT EXISTS visual_assets_new (
  id TEXT PRIMARY KEY,
  hash TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  file_path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  user_id TEXT NOT NULL DEFAULT 'local_user',
  workspace_id TEXT,
  current_version_id TEXT,
  source TEXT NOT NULL DEFAULT 'upload',
  source_uri TEXT,
  title TEXT,
  alt_text TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  version_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT,
  deleted_at TEXT,
  metadata TEXT
);

INSERT INTO visual_assets_new (
  id, hash, file_name, mime_type, file_size, width, height, file_path, created_at,
  user_id, source, status, version_count, updated_at
)
SELECT
  id, hash, file_name, mime_type, file_size, width, height, file_path, created_at,
  'local_user', 'upload', 'active', 1, created_at
FROM visual_assets;

DROP TABLE visual_assets;
ALTER TABLE visual_assets_new RENAME TO visual_assets;

CREATE TABLE IF NOT EXISTS visual_asset_versions (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES visual_assets(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL DEFAULT 'local_user',
  version_number INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  width INTEGER NOT NULL DEFAULT 0,
  height INTEGER NOT NULL DEFAULT 0,
  sha256 TEXT NOT NULL,
  storage_key TEXT,
  source TEXT NOT NULL DEFAULT 'upload',
  source_uri TEXT,
  source_asset_id TEXT,
  replaced_version_id TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(asset_id, version_number)
);

CREATE TABLE IF NOT EXISTS visual_annotations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  asset_id TEXT NOT NULL REFERENCES visual_assets(id) ON DELETE CASCADE,
  version_id TEXT NOT NULL,
  type TEXT NOT NULL,
  geometry TEXT NOT NULL,
  text TEXT,
  confidence REAL,
  source TEXT NOT NULL DEFAULT 'user',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS visual_derived (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES visual_assets(id) ON DELETE CASCADE,
  version_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  value TEXT NOT NULL,
  confidence REAL,
  source TEXT NOT NULL DEFAULT 'system',
  status TEXT NOT NULL DEFAULT 'ready',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS visual_relations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL DEFAULT 'local_user',
  relation_type TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  source_version_id TEXT,
  target_version_id TEXT,
  description TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS visual_flow_drafts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  source_asset_id TEXT NOT NULL,
  source_node_id TEXT,
  source_version_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  nodes TEXT NOT NULL,
  edges TEXT NOT NULL,
  confidence REAL,
  uncertainties TEXT NOT NULL,
  provenance TEXT,
  created_by TEXT NOT NULL,
  request_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  confirmed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_visual_assets_hash ON visual_assets(hash);
CREATE INDEX IF NOT EXISTS idx_visual_assets_workspace_id ON visual_assets(workspace_id);
CREATE INDEX IF NOT EXISTS idx_visual_asset_versions_asset_id ON visual_asset_versions(asset_id);
CREATE INDEX IF NOT EXISTS idx_visual_asset_versions_sha256 ON visual_asset_versions(sha256);
CREATE INDEX IF NOT EXISTS idx_visual_annotations_asset_id ON visual_annotations(asset_id);
CREATE INDEX IF NOT EXISTS idx_visual_derived_asset_id ON visual_derived(asset_id);
CREATE INDEX IF NOT EXISTS idx_visual_relations_workspace_id ON visual_relations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_visual_flow_drafts_workspace_id ON visual_flow_drafts(workspace_id);
`,
  },
];

export function runMigrations(db: Database.Database): number {
  const currentVersion =
    (db.pragma("user_version", { simple: true }) as number) || 0;
  const pending = MIGRATIONS.filter((m) => m.version > currentVersion).sort(
    (a, b) => a.version - b.version,
  );

  for (const migration of pending) {
    const applyMigration = db.transaction(() => {
      db.exec(migration.sql);
      db.pragma(`user_version = ${migration.version}`);
    });
    applyMigration();
  }

  return (db.pragma("user_version", { simple: true }) as number) || 0;
}
