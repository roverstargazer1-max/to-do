-- Add source_handle column to workspace_edges table
ALTER TABLE public.workspace_edges ADD COLUMN IF NOT EXISTS source_handle TEXT NULL DEFAULT NULL;
