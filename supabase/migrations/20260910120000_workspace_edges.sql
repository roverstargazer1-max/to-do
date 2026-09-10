-- =============================================================================
-- WORKSPACE EDGES (Canvas Connections — ADR 0021)
--
-- A connection between two nodes on one canvas. One row per ordered pair
-- (source → target); the canvas draws it as a line and nothing else. Edges
-- are a VISUAL layer: no trigger, no condition, no dispatch, no runtime.
-- ADR 0018 deferred them with the rule that they arrive either with a
-- working dispatch loop or explicitly labelled visual — this is the second,
-- and ADR 0021 is that label.
--
-- Why these are HARD foreign keys while `workspace_nodes`' entity reference
-- is deliberately soft: a node points at a *domain* row that lives in
-- another table and may legitimately be gone (that is the dismissable
-- orphan, ADR 0019). An edge points at two node rows of this very
-- workspace — pure layout. A connection with a missing endpoint has no
-- meaning to preserve, so the database enforces it and cascades.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.workspace_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The workspace owns every edge in it; deleting the board deletes them.
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  -- Denormalised from the workspace row for the RLS convention.
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Both endpoints are nodes of this workspace. CASCADE, not SET NULL:
  -- dismissing a node removes the connections that touched it, which is
  -- what a user means by "remove this node".
  source_node_id UUID NOT NULL REFERENCES public.workspace_nodes(id) ON DELETE CASCADE,
  target_node_id UUID NOT NULL REFERENCES public.workspace_nodes(id) ON DELETE CASCADE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- A node cannot connect to itself.
  CONSTRAINT workspace_edges_no_self_loop_check CHECK (
    source_node_id <> target_node_id
  ),
  -- One connection per ordered pair: A → B is a different relationship
  -- from B → A, but drawing either twice means nothing.
  CONSTRAINT workspace_edges_pair_unique UNIQUE (source_node_id, target_node_id)
);

CREATE INDEX IF NOT EXISTS workspace_edges_workspace_id_idx
  ON public.workspace_edges (workspace_id);
CREATE INDEX IF NOT EXISTS workspace_edges_user_id_idx
  ON public.workspace_edges (user_id);
-- Cascade deletes scan the referencing side; Postgres does not index FK
-- columns for you, and deleting a workspace is a multi-table cascade.
CREATE INDEX IF NOT EXISTS workspace_edges_source_node_id_idx
  ON public.workspace_edges (source_node_id);
CREATE INDEX IF NOT EXISTS workspace_edges_target_node_id_idx
  ON public.workspace_edges (target_node_id);

-- Updated At Trigger
DROP TRIGGER IF EXISTS workspace_edges_updated_at ON public.workspace_edges;
CREATE TRIGGER workspace_edges_updated_at
  BEFORE UPDATE ON public.workspace_edges
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ROW LEVEL SECURITY (owner-scoped, the repo convention)
ALTER TABLE public.workspace_edges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own workspace_edges" ON public.workspace_edges;
CREATE POLICY "Users can view own workspace_edges" ON public.workspace_edges
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own workspace_edges" ON public.workspace_edges;
CREATE POLICY "Users can insert own workspace_edges" ON public.workspace_edges
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own workspace_edges" ON public.workspace_edges;
CREATE POLICY "Users can update own workspace_edges" ON public.workspace_edges
  FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own workspace_edges" ON public.workspace_edges;
CREATE POLICY "Users can delete own workspace_edges" ON public.workspace_edges
  FOR DELETE USING (auth.uid() = user_id);
