-- Migration 009: skills_registry
-- Run in Supabase SQL Editor: https://supabase.com/dashboard/project/sdkysuvmtqjqopmdpvoz/editor

CREATE TABLE IF NOT EXISTS public.skills_registry (
  id          TEXT PRIMARY KEY,
  name        TEXT,
  definition  JSONB,
  source      TEXT DEFAULT 'manual',
  video_id    TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS skills_registry_source_idx ON public.skills_registry (source);
CREATE INDEX IF NOT EXISTS skills_registry_created_idx ON public.skills_registry (created_at DESC);

-- Enable RLS (service role bypasses it)
ALTER TABLE public.skills_registry ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (already implicit, but explicit for clarity)
CREATE POLICY "service_role_all" ON public.skills_registry
  USING (true) WITH CHECK (true);
