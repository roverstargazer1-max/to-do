-- =============================================================================
-- VISUAL ASSETS (Visual objects for Workspace image nodes)
--
-- Workspace nodes remain lightweight references. Immutable bytes live in the
-- private Storage bucket; these tables carry ownership, versions, derived
-- observations, annotations, typed non-executing relations, and confirmed
-- flow drafts. Polymorphic relation endpoints intentionally remain soft so
-- old/future node kinds can be represented without changing workflow FKs.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.visual_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- NULL is a personal library asset that can be mounted by image nodes in
  -- more than one Workspace. A non-null value records its first Workspace.
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
  current_version_id UUID,
  mime_type TEXT NOT NULL,
  byte_size BIGINT NOT NULL CHECK (byte_size > 0),
  width INTEGER NOT NULL CHECK (width > 0),
  height INTEGER NOT NULL CHECK (height > 0),
  sha256 TEXT NOT NULL CHECK (char_length(sha256) = 64),
  source TEXT NOT NULL
    CHECK (source IN ('upload', 'drop', 'paste', 'url', 'local-file', 'asset-handle', 'generated', 'backup', 'bridge')),
  source_uri TEXT,
  title TEXT,
  alt_text TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'pending_deletion', 'deleted')),
  version_count INTEGER NOT NULL DEFAULT 1 CHECK (version_count > 0),
  metadata JSONB,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.visual_asset_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES public.visual_assets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  mime_type TEXT NOT NULL,
  byte_size BIGINT NOT NULL CHECK (byte_size > 0),
  width INTEGER NOT NULL CHECK (width > 0),
  height INTEGER NOT NULL CHECK (height > 0),
  sha256 TEXT NOT NULL CHECK (char_length(sha256) = 64),
  storage_key TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL
    CHECK (source IN ('upload', 'drop', 'paste', 'url', 'local-file', 'asset-handle', 'generated', 'backup', 'bridge')),
  source_uri TEXT,
  source_asset_id UUID REFERENCES public.visual_assets(id) ON DELETE SET NULL,
  replaced_version_id UUID REFERENCES public.visual_asset_versions(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT visual_asset_versions_asset_number_unique
    UNIQUE (asset_id, version_number)
);

ALTER TABLE public.visual_assets
  DROP CONSTRAINT IF EXISTS visual_assets_current_version_fk;
ALTER TABLE public.visual_assets
  ADD CONSTRAINT visual_assets_current_version_fk
  FOREIGN KEY (current_version_id)
  REFERENCES public.visual_asset_versions(id)
  DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE IF NOT EXISTS public.visual_annotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES public.visual_assets(id) ON DELETE CASCADE,
  version_id UUID NOT NULL REFERENCES public.visual_asset_versions(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('box', 'arrow', 'text', 'ocr', 'region')),
  geometry JSONB NOT NULL,
  text TEXT,
  confidence DOUBLE PRECISION CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  source TEXT NOT NULL CHECK (source IN ('user', 'ai', 'import')),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.visual_derived (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES public.visual_assets(id) ON DELETE CASCADE,
  version_id UUID NOT NULL REFERENCES public.visual_asset_versions(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('ocr', 'description', 'summary', 'tags', 'comparison')),
  value JSONB NOT NULL,
  confidence DOUBLE PRECISION CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  source TEXT NOT NULL CHECK (source IN ('user', 'ai', 'import', 'system')),
  status TEXT NOT NULL CHECK (status IN ('ready', 'stale', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.visual_relations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL CHECK (relation_type IN ('reference', 'supports', 'evidence-for', 'derived-from')),
  source_type TEXT NOT NULL
    CHECK (source_type IN ('visual_asset', 'image_node', 'workspace_node', 'step', 'decision', 'doc', 'task', 'habit', 'project', 'focus')),
  source_id TEXT NOT NULL,
  target_type TEXT NOT NULL
    CHECK (target_type IN ('visual_asset', 'image_node', 'workspace_node', 'step', 'decision', 'doc', 'task', 'habit', 'project', 'focus')),
  target_id TEXT NOT NULL,
  source_version_id UUID REFERENCES public.visual_asset_versions(id) ON DELETE SET NULL,
  target_version_id UUID REFERENCES public.visual_asset_versions(id) ON DELETE SET NULL,
  description TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT visual_relations_not_self CHECK (source_type <> target_type OR source_id <> target_id)
);

CREATE TABLE IF NOT EXISTS public.visual_flow_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  source_asset_id UUID NOT NULL REFERENCES public.visual_assets(id) ON DELETE CASCADE,
  source_node_id TEXT,
  source_version_id UUID NOT NULL REFERENCES public.visual_asset_versions(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'rejected', 'stale')),
  nodes JSONB NOT NULL DEFAULT '[]'::jsonb,
  edges JSONB NOT NULL DEFAULT '[]'::jsonb,
  confidence DOUBLE PRECISION CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  uncertainties JSONB NOT NULL DEFAULT '[]'::jsonb,
  provenance JSONB,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id TEXT,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS visual_assets_user_id_idx ON public.visual_assets(user_id);
CREATE INDEX IF NOT EXISTS visual_assets_workspace_id_idx ON public.visual_assets(workspace_id);
CREATE INDEX IF NOT EXISTS visual_asset_versions_asset_id_idx ON public.visual_asset_versions(asset_id);
CREATE INDEX IF NOT EXISTS visual_annotations_asset_version_idx ON public.visual_annotations(asset_id, version_id);
CREATE INDEX IF NOT EXISTS visual_derived_asset_version_idx ON public.visual_derived(asset_id, version_id);
CREATE INDEX IF NOT EXISTS visual_relations_workspace_id_idx ON public.visual_relations(workspace_id);
CREATE INDEX IF NOT EXISTS visual_relations_endpoint_idx ON public.visual_relations(source_type, source_id, target_type, target_id);
CREATE INDEX IF NOT EXISTS visual_flow_drafts_workspace_id_idx ON public.visual_flow_drafts(workspace_id);

DROP TRIGGER IF EXISTS visual_assets_updated_at ON public.visual_assets;
CREATE TRIGGER visual_assets_updated_at
  BEFORE UPDATE ON public.visual_assets FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS visual_annotations_updated_at ON public.visual_annotations;
CREATE TRIGGER visual_annotations_updated_at
  BEFORE UPDATE ON public.visual_annotations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS visual_derived_updated_at ON public.visual_derived;
CREATE TRIGGER visual_derived_updated_at
  BEFORE UPDATE ON public.visual_derived FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS visual_relations_updated_at ON public.visual_relations;
CREATE TRIGGER visual_relations_updated_at
  BEFORE UPDATE ON public.visual_relations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS visual_flow_drafts_updated_at ON public.visual_flow_drafts;
CREATE TRIGGER visual_flow_drafts_updated_at
  BEFORE UPDATE ON public.visual_flow_drafts FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.visual_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visual_asset_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visual_annotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visual_derived ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visual_relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visual_flow_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own visual_assets" ON public.visual_assets;
CREATE POLICY "Users can view own visual_assets" ON public.visual_assets FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own visual_assets" ON public.visual_assets;
CREATE POLICY "Users can insert own visual_assets" ON public.visual_assets FOR INSERT WITH CHECK (
  auth.uid() = user_id AND
  (workspace_id IS NULL OR EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = workspace_id AND w.user_id = auth.uid()))
);
DROP POLICY IF EXISTS "Users can update own visual_assets" ON public.visual_assets;
CREATE POLICY "Users can update own visual_assets" ON public.visual_assets FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id AND
    (workspace_id IS NULL OR EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = workspace_id AND w.user_id = auth.uid()))
  );
DROP POLICY IF EXISTS "Users can delete own visual_assets" ON public.visual_assets;
CREATE POLICY "Users can delete own visual_assets" ON public.visual_assets FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own visual_asset_versions" ON public.visual_asset_versions;
CREATE POLICY "Users can view own visual_asset_versions" ON public.visual_asset_versions FOR SELECT USING (
  auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.visual_assets a WHERE a.id = asset_id AND a.user_id = auth.uid())
);
DROP POLICY IF EXISTS "Users can insert own visual_asset_versions" ON public.visual_asset_versions;
CREATE POLICY "Users can insert own visual_asset_versions" ON public.visual_asset_versions FOR INSERT WITH CHECK (
  auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.visual_assets a WHERE a.id = asset_id AND a.user_id = auth.uid())
);
DROP POLICY IF EXISTS "Users can delete own visual_asset_versions" ON public.visual_asset_versions;
CREATE POLICY "Users can delete own visual_asset_versions" ON public.visual_asset_versions FOR DELETE USING (
  auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.visual_assets a WHERE a.id = asset_id AND a.user_id = auth.uid())
);

DROP POLICY IF EXISTS "Users can manage own visual_annotations" ON public.visual_annotations;
CREATE POLICY "Users can manage own visual_annotations" ON public.visual_annotations
  USING (
    auth.uid() = created_by AND
    EXISTS (SELECT 1 FROM public.visual_assets a WHERE a.id = asset_id AND a.user_id = auth.uid()) AND
    EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = workspace_id AND w.user_id = auth.uid())
  )
  WITH CHECK (
    auth.uid() = created_by AND
    EXISTS (SELECT 1 FROM public.visual_assets a WHERE a.id = asset_id AND a.user_id = auth.uid()) AND
    EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = workspace_id AND w.user_id = auth.uid())
  );
DROP POLICY IF EXISTS "Users can manage own visual_derived" ON public.visual_derived;
CREATE POLICY "Users can manage own visual_derived" ON public.visual_derived USING (
  EXISTS (SELECT 1 FROM public.visual_assets a WHERE a.id = asset_id AND a.user_id = auth.uid())
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.visual_assets a WHERE a.id = asset_id AND a.user_id = auth.uid())
);
DROP POLICY IF EXISTS "Users can manage own visual_relations" ON public.visual_relations;
CREATE POLICY "Users can manage own visual_relations" ON public.visual_relations
  USING (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = workspace_id AND w.user_id = auth.uid()))
  WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = workspace_id AND w.user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can manage own visual_flow_drafts" ON public.visual_flow_drafts;
CREATE POLICY "Users can manage own visual_flow_drafts" ON public.visual_flow_drafts
  USING (
    auth.uid() = created_by AND
    EXISTS (SELECT 1 FROM public.visual_assets a WHERE a.id = source_asset_id AND a.user_id = auth.uid()) AND
    EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = workspace_id AND w.user_id = auth.uid())
  )
  WITH CHECK (
    auth.uid() = created_by AND
    EXISTS (SELECT 1 FROM public.visual_assets a WHERE a.id = source_asset_id AND a.user_id = auth.uid()) AND
    EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = workspace_id AND w.user_id = auth.uid())
  );

INSERT INTO storage.buckets (id, name, public)
VALUES ('visual-assets', 'visual-assets', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "Users can read own visual asset files" ON storage.objects;
CREATE POLICY "Users can read own visual asset files" ON storage.objects FOR SELECT USING (
  bucket_id = 'visual-assets' AND auth.uid()::text = split_part(name, '/', 1)
);
DROP POLICY IF EXISTS "Users can upload own visual asset files" ON storage.objects;
CREATE POLICY "Users can upload own visual asset files" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'visual-assets' AND auth.uid()::text = split_part(name, '/', 1)
);
DROP POLICY IF EXISTS "Users can delete own visual asset files" ON storage.objects;
CREATE POLICY "Users can delete own visual asset files" ON storage.objects FOR DELETE USING (
  bucket_id = 'visual-assets' AND auth.uid()::text = split_part(name, '/', 1)
);
