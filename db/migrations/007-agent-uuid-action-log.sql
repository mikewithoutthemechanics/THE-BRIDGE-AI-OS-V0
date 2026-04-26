-- ============================================================================
-- BRIDGE AI OS — Migration 007: Agent UUIDs + Action Log
-- Run in Supabase SQL editor or via supabase db push
-- ============================================================================

-- ── 1. Add uuid column to agents ──────────────────────────────────────────────
ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS uuid UUID DEFAULT gen_random_uuid();

-- Backfill any rows that were inserted before this migration
UPDATE agents
  SET uuid = gen_random_uuid()
  WHERE uuid IS NULL;

-- Enforce uniqueness going forward
CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_uuid ON agents (uuid);

-- ── 2. Agent Action Log ───────────────────────────────────────────────────────
-- Immutable audit trail for every significant agent lifecycle event.
-- Financial events (credits / debits / transfers) live in agent_transactions;
-- this table captures behavioural events (auth, register, update, etc.).

CREATE TABLE IF NOT EXISTS agent_action_log (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id    TEXT        NOT NULL,          -- slug ID  (e.g. 'prime-001')
  agent_uuid  UUID,                          -- UUID of the agent row (if known)
  action      TEXT        NOT NULL,          -- 'register' | 'update' | 'remove' |
                                             -- 'auth_new' | 'auth_ok' |
                                             -- 'credit' | 'debit' | 'transfer' |
                                             -- 'wallet_provision' | 'seed' | other
  actor       TEXT,                          -- who triggered it (agent_id / wallet / 'system')
  payload     JSONB       DEFAULT '{}',      -- action-specific detail (sanitised)
  ip          TEXT,                          -- originating IP (optional)
  ts          TIMESTAMPTZ DEFAULT NOW()
);

-- Fast lookups
CREATE INDEX IF NOT EXISTS idx_aal_agent_id ON agent_action_log (agent_id);
CREATE INDEX IF NOT EXISTS idx_aal_action   ON agent_action_log (action);
CREATE INDEX IF NOT EXISTS idx_aal_ts       ON agent_action_log (ts DESC);
CREATE INDEX IF NOT EXISTS idx_aal_actor    ON agent_action_log (actor);

-- ── 3. RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE agent_action_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'agent_action_log' AND policyname = 'aal_service_full'
  ) THEN
    CREATE POLICY aal_service_full ON agent_action_log
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;

  -- Authenticated users may read their own agent's logs
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'agent_action_log' AND policyname = 'aal_auth_read_own'
  ) THEN
    CREATE POLICY aal_auth_read_own ON agent_action_log
      FOR SELECT TO authenticated
      USING (actor = auth.uid()::text OR agent_id = auth.uid()::text);
  END IF;
END $$;
