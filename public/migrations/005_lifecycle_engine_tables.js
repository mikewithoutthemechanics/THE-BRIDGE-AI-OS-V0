'use strict';
/**
 * Migration 005: Lifecycle Engine Tables
 *
 * Creates tables for the 8-stage post-billing lifecycle engine:
 *   - lifecycle_events      — audit log of every lifecycle action
 *   - lifecycle_touches     — deduplication: which emails have been sent
 *   - engagement_scores     — current engagement score per subscriber
 *   - usage_events          — behavioural tracking (feature usage beacons)
 *   - csm_queue             — enterprise CSM escalation queue
 *
 * Run via: node public/migrations/005_lifecycle_engine_tables.js
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const SQL = `
-- ── lifecycle_events ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lifecycle_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    TEXT NOT NULL,
  event      TEXT NOT NULL,
  data       JSONB DEFAULT '{}',
  ts         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lifecycle_events_user ON lifecycle_events(user_id);
CREATE INDEX IF NOT EXISTS idx_lifecycle_events_event ON lifecycle_events(event);
CREATE INDEX IF NOT EXISTS idx_lifecycle_events_ts ON lifecycle_events(ts DESC);

-- ── lifecycle_touches ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lifecycle_touches (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   TEXT NOT NULL,
  touch_key TEXT NOT NULL,
  sent_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  meta      JSONB DEFAULT '{}',
  UNIQUE(user_id, touch_key)
);
CREATE INDEX IF NOT EXISTS idx_lifecycle_touches_user ON lifecycle_touches(user_id);

-- ── engagement_scores ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS engagement_scores (
  user_id       TEXT PRIMARY KEY,
  score         INTEGER NOT NULL DEFAULT 0,
  routing       TEXT NOT NULL DEFAULT 'churned',
  action        TEXT,
  action_reason TEXT,
  breakdown     JSONB DEFAULT '{}',
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_engagement_scores_routing ON engagement_scores(routing);
CREATE INDEX IF NOT EXISTS idx_engagement_scores_score ON engagement_scores(score DESC);

-- ── usage_events ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usage_events (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id  TEXT NOT NULL,
  feature  TEXT NOT NULL,
  meta     JSONB DEFAULT '{}',
  ts       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_usage_events_user ON usage_events(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_events_feature ON usage_events(feature);
CREATE INDEX IF NOT EXISTS idx_usage_events_ts ON usage_events(ts DESC);

-- ── csm_queue ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS csm_queue (
  user_id    TEXT PRIMARY KEY,
  email      TEXT,
  plan       TEXT,
  score      INTEGER DEFAULT 0,
  priority   TEXT DEFAULT 'normal',
  reason     TEXT,
  assigned_to TEXT,
  resolved    BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_csm_queue_priority ON csm_queue(priority);
CREATE INDEX IF NOT EXISTS idx_csm_queue_resolved ON csm_queue(resolved);

-- ── Add billing_renewal_at to users (if not already present) ─────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS billing_renewal_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ;
`;

async function runMigration() {
  console.log('[Migration 005] Running lifecycle engine tables...');
  const statements = SQL.split(';').map(s => s.trim()).filter(s => s.length > 10);

  let passed = 0;
  let failed = 0;
  for (const stmt of statements) {
    const { error } = await supabase.rpc('exec_sql', { query: stmt + ';' }).catch(() => ({ error: 'rpc_unavailable' }));
    if (error && typeof error === 'string' && error === 'rpc_unavailable') {
      // Try raw query if RPC not available
      const { error: e2 } = await supabase.from('_migrations').select('id').limit(0);
      if (e2) { failed++; continue; }
    }
    if (error) { console.warn('  WARN:', stmt.slice(0, 60), '—', JSON.stringify(error)); failed++; }
    else passed++;
  }

  console.log(`[Migration 005] Done — ${passed} passed, ${failed} failed`);
}

runMigration().catch(console.error);
