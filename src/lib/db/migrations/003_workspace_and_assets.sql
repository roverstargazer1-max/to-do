-- Migration 003: Workspaces, Canvas Nodes, Edges, and Visual Assets

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
