-- =============================================================================
-- WORKSPACE NODE GROUPS (Container Groups)
--
-- A group container is a node row with kind='group'. Member nodes belong
-- to the container via `workspace_nodes.group_id`, pointing to the group's UUID.
--
-- The tag is TEXT (not a hard FK): guest mode and potential future group identifiers
-- use text, and orphan-safe dissolution handles group cleanup gracefully.
-- =============================================================================

ALTER TABLE public.workspace_nodes
  ADD COLUMN IF NOT EXISTS group_id TEXT;

CREATE INDEX IF NOT EXISTS workspace_nodes_group_id_idx
  ON public.workspace_nodes (group_id) WHERE group_id IS NOT NULL;
