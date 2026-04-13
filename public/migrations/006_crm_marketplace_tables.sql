-- Migration 006: CRM activities + marketplace tasks tables
-- Run once via Supabase SQL editor or MCP

-- CRM activities (notes, calls, emails, meetings per lead)
CREATE TABLE IF NOT EXISTS crm_activities (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id      UUID NOT NULL,
  type         TEXT NOT NULL DEFAULT 'note',   -- note | call | email | meeting | task
  subject      TEXT,
  body         TEXT,
  scheduled_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_activities_lead ON crm_activities(lead_id);
CREATE INDEX IF NOT EXISTS idx_crm_activities_created ON crm_activities(created_at DESC);

-- Marketplace tasks (posted jobs)
CREATE TABLE IF NOT EXISTS marketplace_tasks (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title          TEXT NOT NULL,
  description    TEXT,
  category       TEXT DEFAULT 'Research',
  budget         NUMERIC,
  assigned_agent TEXT,
  status         TEXT DEFAULT 'open',   -- open | assigned | in_progress | completed | cancelled
  poster_id      TEXT,
  result         TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mkt_tasks_status ON marketplace_tasks(status);
CREATE INDEX IF NOT EXISTS idx_mkt_tasks_created ON marketplace_tasks(created_at DESC);

-- Newsletter subscribers
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  source        TEXT DEFAULT 'portal',
  subscribed_at TIMESTAMPTZ DEFAULT NOW()
);
