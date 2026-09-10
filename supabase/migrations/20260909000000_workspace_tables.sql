-- =============================================================================
-- WORKSPACE TABLES (Canvas Arrangement — ADR 0018)
-- Two row-level tables. A workspace is a saved arrangement of node
-- references; nodes store reference metadata only, never domain business
-- fields. workspace_nodes.workspace_id is the only hard FK (nodes cascade
-- with their workspace); the entity reference pair is soft and polymorphic
-- (entity_type + entity_id, no FK to domain tables) — integrity is an
-- application concern (orphan nodes are derived at read, ADR 0019).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT workspaces_name_length_check CHECK (char_length(name) <= 200)
);

CREATE INDEX IF NOT EXISTS workspaces_user_id_idx ON public.workspaces (user_id);

CREATE TABLE IF NOT EXISTS public.workspace_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The only hard FK: nodes die with their workspace.
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  -- Denormalised from the workspace row for the RLS convention.
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Tolerant node kind: "task" | "habit" | "event" | "focus", or a value a
  -- newer app version wrote. Unknown kinds render as placeholders.
  kind TEXT NOT NULL,
  -- Soft polymorphic reference to a domain row: both null (focus node) or
  -- both set. TEXT (not UUID): guest ids and future kinds are plain strings.
  entity_type TEXT,
  entity_id TEXT,

  position_x DOUBLE PRECISION NOT NULL DEFAULT 0,
  position_y DOUBLE PRECISION NOT NULL DEFAULT 0,
  width DOUBLE PRECISION,
  height DOUBLE PRECISION,
  display_config JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT workspace_nodes_reference_pair_check CHECK (
    (entity_type IS NULL AND entity_id IS NULL)
    OR (entity_type IS NOT NULL AND entity_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS workspace_nodes_workspace_id_idx
  ON public.workspace_nodes (workspace_id);
CREATE INDEX IF NOT EXISTS workspace_nodes_user_id_idx
  ON public.workspace_nodes (user_id);
-- Orphan derivation (read-time) resolves references by id; keep the
-- reverse lookup cheap for future node cleanup paths.
CREATE INDEX IF NOT EXISTS workspace_nodes_entity_ref_idx
  ON public.workspace_nodes (entity_type, entity_id) WHERE entity_id IS NOT NULL;

-- Updated At Triggers
DROP TRIGGER IF EXISTS workspaces_updated_at ON public.workspaces;
CREATE TRIGGER workspaces_updated_at
  BEFORE UPDATE ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS workspace_nodes_updated_at ON public.workspace_nodes;
CREATE TRIGGER workspace_nodes_updated_at
  BEFORE UPDATE ON public.workspace_nodes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ROW LEVEL SECURITY (owner-scoped, the repo convention)
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own workspaces" ON public.workspaces;
CREATE POLICY "Users can view own workspaces" ON public.workspaces
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own workspaces" ON public.workspaces;
CREATE POLICY "Users can insert own workspaces" ON public.workspaces
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own workspaces" ON public.workspaces;
CREATE POLICY "Users can update own workspaces" ON public.workspaces
  FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own workspaces" ON public.workspaces;
CREATE POLICY "Users can delete own workspaces" ON public.workspaces
  FOR DELETE USING (auth.uid() = user_id);

ALTER TABLE public.workspace_nodes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own workspace_nodes" ON public.workspace_nodes;
CREATE POLICY "Users can view own workspace_nodes" ON public.workspace_nodes
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own workspace_nodes" ON public.workspace_nodes;
CREATE POLICY "Users can insert own workspace_nodes" ON public.workspace_nodes
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own workspace_nodes" ON public.workspace_nodes;
CREATE POLICY "Users can update own workspace_nodes" ON public.workspace_nodes
  FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own workspace_nodes" ON public.workspace_nodes;
CREATE POLICY "Users can delete own workspace_nodes" ON public.workspace_nodes
  FOR DELETE USING (auth.uid() = user_id);
