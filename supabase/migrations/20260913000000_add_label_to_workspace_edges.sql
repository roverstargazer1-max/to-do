-- Add label column to workspace_edges table
ALTER TABLE public.workspace_edges ADD COLUMN IF NOT EXISTS label TEXT NULL DEFAULT NULL;

