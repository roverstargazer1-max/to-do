-- Migration 004: Visual asset store (versions, annotations, derived info, relations, flow drafts)
-- Mirrors the inline SQL in src/lib/db/migrator.ts (the migrator is the runtime source of truth).

-- Rebuild visual_assets with the full Visual domain columns. The content hash is
-- indexed but no longer globally unique: identical bytes may be mounted as two
-- separate assets (for example in two workspaces) while sharing one file on disk.
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