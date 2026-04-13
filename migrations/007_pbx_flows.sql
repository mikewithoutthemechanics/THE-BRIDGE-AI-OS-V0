-- Migration 007: PBX Call Flows
-- Adds pbx_flows table for IVR, call queues, ring groups, etc.
-- Run once against Supabase Postgres.

CREATE TABLE IF NOT EXISTS public.pbx_flows (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('ivr','queue','ring_group','voicemail','forward')),
  description TEXT,
  config      JSONB NOT NULL DEFAULT '{}',
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pbx_flows_status_idx ON public.pbx_flows (status);
CREATE INDEX IF NOT EXISTS pbx_flows_type_idx   ON public.pbx_flows (type);

-- Link extensions to flows (optional foreign key)
ALTER TABLE public.pbx_extensions
  ADD COLUMN IF NOT EXISTS flow_id UUID REFERENCES public.pbx_flows(id) ON DELETE SET NULL;

COMMENT ON TABLE public.pbx_flows IS 'Call routing flows: IVR menus, queues, ring groups, voicemail boxes, and call forwards.';
