-- =============================================================================
-- BRIDGE AI OS — Affiliate Program Reconciliation
-- =============================================================================
-- Context: three parallel affiliate systems exist today:
--   (1) brain.js — in-memory Map, read by affiliate.html (the user-facing program)
--   (2) business-suite.js — Supabase `affiliates` scoped by company_id (B2B)
--   (3) autonomous-pipeline.js — writes `affiliate_conversions` on PayFast IPN
--
-- This migration unifies them onto the existing UUID-keyed `affiliates` table
-- and fixes the latent FK-type bug in `affiliate_clicks.affiliate_id` /
-- `affiliate_conversions.affiliate_id` (declared text, joined to UUID at runtime).
--
-- Design choices confirmed with product owner 2026-04-20:
--   • Canonical affiliate identity = UUID (matches existing table, doesn't
--     break autonomous-pipeline.js)
--   • Public-facing handle = `referral_code` (text) — what appears in URLs
--     and what the in-memory brain.js Map used to key off
--   • Keep multi-tenant; single-tenant usage pins company_id = DEFAULT_COMPANY
--     ('00000000-0000-0000-0000-000000000001') per business-suite.js convention
--   • Auth: bridge_user_id FK to users(id), resolved from the Bridge JWT
--     `sub` claim — not from ?id= query params (closes the IDOR bug in
--     brain.js:2838)
--
-- Safe to re-run: all CREATE/ALTER guarded by IF (NOT) EXISTS.
-- =============================================================================

BEGIN;

-- ── Extensions (idempotent) ────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── 1. Ensure DEFAULT_COMPANY row exists ───────────────────────────────────
-- business-suite.js line 16: const DEFAULT_COMPANY = '00000000-0000-0000-0000-000000000001'
-- Every fallback codepath upserts into this UUID; make sure the row actually exists.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='companies') THEN
    INSERT INTO companies (id, name, slug, created_at)
    VALUES ('00000000-0000-0000-0000-000000000001', 'Bridge AI OS', 'bridge-ai-os', now())
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- ── 2. Extend `affiliates` with portal-required columns ────────────────────
-- bridge_user_id is the single most important addition: it replaces the
-- ?id=marvin trust bug by letting the API look up the affiliate row from
-- the authenticated user's JWT `sub` claim.
-- users.id is TEXT (not UUID) per the actual deployed schema — JWT `sub` claim
-- is a UUID-shaped string stored as text. FK type must match.
ALTER TABLE affiliates
  ADD COLUMN IF NOT EXISTS bridge_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;

-- Preferred payout rail: payfast | paystack | stripe | paypal | crypto | iban
ALTER TABLE affiliates
  ADD COLUMN IF NOT EXISTS payout_rail TEXT;

-- Per-rail destination details (address, iban+swift, paypal email, etc.)
-- JSONB so each rail can store its own shape without schema churn.
ALTER TABLE affiliates
  ADD COLUMN IF NOT EXISTS payout_destination JSONB DEFAULT '{}'::jsonb;

-- Sub-affiliate tree: who referred this affiliate into the program?
-- Enables the "2nd-level 5%" commission model in brain.js AFF_TIERS.
ALTER TABLE affiliates
  ADD COLUMN IF NOT EXISTS parent_affiliate_id UUID REFERENCES affiliates(id) ON DELETE SET NULL;

ALTER TABLE affiliates
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

-- referral_code was added as a plain column by 20260413. Promote it to
-- UNIQUE (per-company) so link collisions can't happen, and index it for
-- the hot-path lookup `.eq('referral_code', code)`.
CREATE UNIQUE INDEX IF NOT EXISTS uq_affiliates_company_code
  ON affiliates(company_id, referral_code)
  WHERE referral_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_affiliates_bridge_user
  ON affiliates(bridge_user_id)
  WHERE bridge_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_affiliates_parent
  ON affiliates(parent_affiliate_id)
  WHERE parent_affiliate_id IS NOT NULL;

-- ── 3. Fix the click/conversion FK-type mismatch ───────────────────────────
-- Original state (buggy): `affiliate_id text` with no FK, silently compared
-- against `affiliates.id UUID` in autonomous-pipeline.js:355.
-- Strategy: add `affiliate_uuid UUID` *alongside* the existing text column.
-- New inserts populate both. Old text column kept for backward compat with
-- autonomous-pipeline.js until we cut it over (tracked separately).
ALTER TABLE affiliate_clicks
  ADD COLUMN IF NOT EXISTS affiliate_uuid UUID REFERENCES affiliates(id) ON DELETE CASCADE;

ALTER TABLE affiliate_conversions
  ADD COLUMN IF NOT EXISTS affiliate_uuid UUID REFERENCES affiliates(id) ON DELETE CASCADE;

-- Backfill: if the existing text column already holds UUID-shaped values
-- (from autonomous-pipeline.js writes), lift them into the typed column.
UPDATE affiliate_clicks
   SET affiliate_uuid = affiliate_id::uuid
 WHERE affiliate_uuid IS NULL
   AND affiliate_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

UPDATE affiliate_conversions
   SET affiliate_uuid = affiliate_id::uuid
 WHERE affiliate_uuid IS NULL
   AND affiliate_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

CREATE INDEX IF NOT EXISTS idx_aff_clicks_uuid       ON affiliate_clicks(affiliate_uuid);
CREATE INDEX IF NOT EXISTS idx_aff_conv_uuid         ON affiliate_conversions(affiliate_uuid);

-- ── 4. User-initiated payout requests ──────────────────────────────────────
-- DISTINCT from `affiliate_payouts` (migration 20260411100000). That table
-- represents what ops actually paid out; THIS table is the inbox of
-- withdrawal requests coming from the portal "Request Payout" button.
-- The ops workflow: affiliate_payout_requests → admin review → insert
-- into affiliate_payouts when funds leave. Keeps request state separate
-- from ledger state.
CREATE TABLE IF NOT EXISTS affiliate_payout_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  affiliate_id    UUID NOT NULL REFERENCES affiliates(id) ON DELETE CASCADE,
  amount          NUMERIC NOT NULL CHECK (amount > 0),
  currency        TEXT NOT NULL DEFAULT 'USD',
  rail            TEXT NOT NULL,
  destination     JSONB NOT NULL DEFAULT '{}'::jsonb,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','rejected','paid','cancelled')),
  requested_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at     TIMESTAMPTZ,
  reviewed_by     TEXT REFERENCES users(id),
  review_notes    TEXT,
  paid_at         TIMESTAMPTZ,
  payout_id       UUID REFERENCES affiliate_payouts(id),
  metadata        JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payout_req_affiliate ON affiliate_payout_requests(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_payout_req_status    ON affiliate_payout_requests(status);
CREATE INDEX IF NOT EXISTS idx_payout_req_requested ON affiliate_payout_requests(requested_at DESC);

-- ── 5. Real creative library (not just counts) ─────────────────────────────
-- Replaces the hard-coded response in brain.js:2862-2868 where the API
-- returns only categories + counts. Portal needs actual downloadable assets.
CREATE TABLE IF NOT EXISTS affiliate_creatives (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  type            TEXT NOT NULL
                    CHECK (type IN ('banner','email','social','landing_page','video','copy')),
  name            TEXT NOT NULL,
  description     TEXT,
  dimensions      TEXT,                -- '728x90', '1080x1080', etc.
  platform        TEXT,                -- 'twitter','linkedin','instagram', nullable
  variant         TEXT,                -- 'healthcare','enterprise','developer', nullable
  file_url        TEXT,                -- CDN URL or Supabase Storage path
  thumbnail_url   TEXT,
  preview_html    TEXT,                -- inline preview for emails/landing pages
  download_count  INTEGER NOT NULL DEFAULT 0,
  tags            TEXT[] DEFAULT '{}',
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_creatives_company_type ON affiliate_creatives(company_id, type) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_creatives_platform     ON affiliate_creatives(platform) WHERE platform IS NOT NULL;

-- Per-affiliate download tracking — what each affiliate pulled and when.
-- Useful for the "top creatives by conversion" analytic later.
CREATE TABLE IF NOT EXISTS affiliate_creative_downloads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creative_id     UUID NOT NULL REFERENCES affiliate_creatives(id) ON DELETE CASCADE,
  affiliate_id    UUID NOT NULL REFERENCES affiliates(id) ON DELETE CASCADE,
  downloaded_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_hash         TEXT,
  user_agent      TEXT
);

CREATE INDEX IF NOT EXISTS idx_creative_dl_affiliate ON affiliate_creative_downloads(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_creative_dl_creative  ON affiliate_creative_downloads(creative_id);

-- ── 6. updated_at triggers ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_affiliate_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_affiliates_updated_at ON affiliates;
CREATE TRIGGER trg_affiliates_updated_at
  BEFORE UPDATE ON affiliates
  FOR EACH ROW EXECUTE FUNCTION set_affiliate_updated_at();

DROP TRIGGER IF EXISTS trg_payout_req_updated_at ON affiliate_payout_requests;
CREATE TRIGGER trg_payout_req_updated_at
  BEFORE UPDATE ON affiliate_payout_requests
  FOR EACH ROW EXECUTE FUNCTION set_affiliate_updated_at();

DROP TRIGGER IF EXISTS trg_creatives_updated_at ON affiliate_creatives;
CREATE TRIGGER trg_creatives_updated_at
  BEFORE UPDATE ON affiliate_creatives
  FOR EACH ROW EXECUTE FUNCTION set_affiliate_updated_at();

-- ── 7. RLS: service-role bypass only (defense-in-depth) ────────────────────
-- Rationale: the portal SPA calls our API (/api/affiliate/*), not Supabase
-- directly. The API uses supabaseAdmin (service-role key, bypasses RLS) and
-- enforces per-user access via requireAuth() + bridge_user_id lookup.
-- RLS here is a belt-and-braces guard for the case where someone leaks an
-- anon key or writes a future feature that talks to Supabase directly.
--
-- If/when the portal moves to direct Supabase calls with user-scoped JWTs,
-- re-enable per-user policies by:
--   (a) configuring Supabase Auth so auth.uid() resolves to users.id, OR
--   (b) having the API set a GUC `app.current_bridge_user_id` per-request
--       and switching policies to USING (bridge_user_id = current_setting('app.current_bridge_user_id')::uuid).
ALTER TABLE affiliate_payout_requests      ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_creatives            ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_creative_downloads   ENABLE ROW LEVEL SECURITY;

-- Service role bypasses all RLS automatically; these policies exist so
-- the anon key gets *nothing* until a future migration opens it up.
DROP POLICY IF EXISTS payout_req_service_only ON affiliate_payout_requests;
CREATE POLICY payout_req_service_only ON affiliate_payout_requests
  FOR ALL TO public USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS creatives_public_read ON affiliate_creatives;
-- Active creatives are readable by anyone (they're marketing assets);
-- writes are service-role-only.
CREATE POLICY creatives_public_read ON affiliate_creatives
  FOR SELECT TO public USING (active = true);

DROP POLICY IF EXISTS creative_dl_service_only ON affiliate_creative_downloads;
CREATE POLICY creative_dl_service_only ON affiliate_creative_downloads
  FOR ALL TO public USING (false) WITH CHECK (false);

COMMIT;

-- =============================================================================
-- Follow-ups (tracked separately, NOT in this migration):
--   • Cut autonomous-pipeline.js over to write affiliate_uuid alongside
--     affiliate_id (both columns), then drop the text column in a later mig.
--   • Unify auth.js in-memory `referrals` Map (line 539) with this program,
--     OR explicitly fork them as separate products.
--   • Once the portal calls Supabase directly, author real per-user RLS
--     policies (see comment in section 7).
-- =============================================================================
