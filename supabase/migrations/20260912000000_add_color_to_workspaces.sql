-- Add color column to workspaces table
ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS color TEXT;
