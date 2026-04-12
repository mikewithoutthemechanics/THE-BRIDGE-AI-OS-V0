-- =============================================================================
-- BRIDGE AI OS — Unified User Lifecycle Orchestration Engine (ULOE)
-- Migration 005: All lifecycle tables
--
-- Idempotent: drops all ULOE tables first so re-runs always produce a clean state.
-- user_id columns are TEXT (not UUID) to match the existing users.id TEXT column.
-- No foreign keys to users — logical reference only (matches migration 004 pattern).
-- =============================================================================

-- ── Drop in dependency order (children before parents) ───────────────────────
DROP TABLE IF EXISTS user_modules         CASCADE;
DROP TABLE IF EXISTS uloe_api_keys        CASCADE;
DROP TABLE IF EXISTS wallet_transactions  CASCADE;
DROP TABLE IF EXISTS wallet_balances      CASCADE;
DROP TABLE IF EXISTS usage_quotas         CASCADE;
DROP TABLE IF EXISTS usage_events         CASCADE;
DROP TABLE IF EXISTS invoices             CASCADE;
DROP TABLE IF EXISTS billing_transactions CASCADE;
DROP TABLE IF EXISTS user_subscriptions   CASCADE;
DROP TABLE IF EXISTS lifecycle_events     CASCADE;
DROP SEQUENCE IF EXISTS invoice_seq;

-- ── Lifecycle Events (immutable audit log) ───────────────────────────────────
CREATE TABLE lifecycle_events (
  event_id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT        NOT NULL,  -- TEXT matches users.id column type
  timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  category        TEXT        NOT NULL,  -- identity | subscription | billing | usage | wallet | api | module | system
  action          TEXT        NOT NULL,  -- e.g. subscription.created, wallet.credited, module.activated
  actor           TEXT        NOT NULL DEFAULT 'system',  -- user | system | admin | automation
  details         JSONB       NOT NULL DEFAULT '{}',
  correlation_id  UUID,                  -- groups related events (e.g. checkout flow)
  prev_event_id   UUID,                  -- forward chain for integrity verification
  checksum        TEXT        NOT NULL DEFAULT ''  -- SHA-256(event_id + user_id + action + details + prev_checksum)
);

CREATE INDEX idx_lifecycle_user ON lifecycle_events(user_id, timestamp DESC);
CREATE INDEX idx_lifecycle_category ON lifecycle_events(category, action);
CREATE INDEX idx_lifecycle_correlation ON lifecycle_events(correlation_id) WHERE correlation_id IS NOT NULL;

-- ── User Subscriptions ───────────────────────────────────────────────────────
CREATE TABLE user_subscriptions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT        NOT NULL,  -- TEXT matches users.id column type
  plan            TEXT        NOT NULL DEFAULT 'free',  -- free | starter | pro | enterprise | custom
  user_type       TEXT        NOT NULL DEFAULT 'personal',  -- personal | business
  status          TEXT        NOT NULL DEFAULT 'active',  -- active | trialing | past_due | cancelled | expired | paused
  billing_cycle   TEXT        NOT NULL DEFAULT 'monthly',  -- monthly | annual
  amount_cents    INTEGER     NOT NULL DEFAULT 0,
  currency        TEXT        NOT NULL DEFAULT 'USD',
  trial_ends_at   TIMESTAMPTZ,
  current_period_start  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  current_period_end    TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '1 month'),
  cancelled_at    TIMESTAMPTZ,
  cancel_reason   TEXT,
  metadata        JSONB       NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_subscriptions_active_user
  ON user_subscriptions(user_id)
  WHERE status IN ('active', 'trialing', 'past_due');

CREATE INDEX idx_subscriptions_plan ON user_subscriptions(plan, status);
CREATE INDEX idx_subscriptions_period_end ON user_subscriptions(current_period_end) WHERE status = 'active';

-- ── Billing Transactions ─────────────────────────────────────────────────────
CREATE TABLE billing_transactions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT        NOT NULL,  -- TEXT matches users.id column type
  subscription_id UUID        REFERENCES user_subscriptions(id),
  type            TEXT        NOT NULL,  -- charge | refund | credit | adjustment | writeoff
  status          TEXT        NOT NULL DEFAULT 'pending',  -- pending | completed | failed | voided
  amount_cents    INTEGER     NOT NULL,  -- positive = charge, negative = refund/credit
  currency        TEXT        NOT NULL DEFAULT 'USD',
  description     TEXT        NOT NULL DEFAULT '',
  payment_method  TEXT,                  -- card | payfast | crypto | wallet | promo
  provider_ref    TEXT,                  -- external payment provider reference
  invoice_id      UUID,                  -- linked invoice
  metadata        JSONB       NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);

CREATE INDEX idx_billing_user ON billing_transactions(user_id, created_at DESC);
CREATE INDEX idx_billing_status ON billing_transactions(status) WHERE status = 'pending';
CREATE INDEX idx_billing_invoice ON billing_transactions(invoice_id) WHERE invoice_id IS NOT NULL;

-- ── Invoices ─────────────────────────────────────────────────────────────────
CREATE TABLE invoices (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT        NOT NULL,  -- TEXT matches users.id column type
  subscription_id UUID        REFERENCES user_subscriptions(id),
  invoice_number  TEXT        NOT NULL UNIQUE,  -- INV-2026-000001
  status          TEXT        NOT NULL DEFAULT 'draft',  -- draft | issued | paid | void | overdue
  amount_cents    INTEGER     NOT NULL,
  tax_cents       INTEGER     NOT NULL DEFAULT 0,
  total_cents     INTEGER     NOT NULL,
  currency        TEXT        NOT NULL DEFAULT 'USD',
  due_date        DATE        NOT NULL,
  paid_at         TIMESTAMPTZ,
  line_items      JSONB       NOT NULL DEFAULT '[]',  -- [{description, qty, unit_cents, total_cents}]
  pdf_url         TEXT,
  metadata        JSONB       NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_invoices_user ON invoices(user_id, created_at DESC);
CREATE INDEX idx_invoices_status ON invoices(status) WHERE status NOT IN ('paid', 'void');
CREATE SEQUENCE IF NOT EXISTS invoice_seq START 1;

-- ── Usage Events ─────────────────────────────────────────────────────────────
CREATE TABLE usage_events (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT        NOT NULL,  -- TEXT matches users.id column type
  api_key_id      UUID,                  -- null for non-API usage
  resource_type   TEXT        NOT NULL,  -- api_call | agent_task | llm_tokens | storage_bytes | bandwidth_bytes | contract_gen
  quantity        BIGINT      NOT NULL DEFAULT 1,
  unit            TEXT        NOT NULL DEFAULT 'count',  -- count | bytes | tokens | ms
  cost_microcents BIGINT      NOT NULL DEFAULT 0,  -- micro-cents (1/1000 of a cent) for precision
  metadata        JSONB       NOT NULL DEFAULT '{}',
  recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_usage_user ON usage_events(user_id, recorded_at DESC);
CREATE INDEX idx_usage_resource ON usage_events(resource_type, recorded_at DESC);
CREATE INDEX idx_usage_apikey ON usage_events(api_key_id) WHERE api_key_id IS NOT NULL;

-- ── Usage Quotas (materialized current-period totals) ────────────────────────
CREATE TABLE usage_quotas (
  id                  UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             TEXT    NOT NULL,  -- TEXT matches users.id column type
  period_start        TIMESTAMPTZ NOT NULL,
  period_end          TIMESTAMPTZ NOT NULL,
  api_calls_used      BIGINT  NOT NULL DEFAULT 0,
  agent_tasks_used    BIGINT  NOT NULL DEFAULT 0,
  llm_tokens_used     BIGINT  NOT NULL DEFAULT 0,
  storage_bytes_used  BIGINT  NOT NULL DEFAULT 0,
  api_calls_limit     BIGINT  NOT NULL DEFAULT 0,  -- 0 = unlimited
  agent_tasks_limit   BIGINT  NOT NULL DEFAULT 0,
  llm_tokens_limit    BIGINT  NOT NULL DEFAULT 0,
  storage_bytes_limit BIGINT  NOT NULL DEFAULT 0,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_quotas_user_period ON usage_quotas(user_id, period_start);

-- ── Wallet Balances ──────────────────────────────────────────────────────────
CREATE TABLE wallet_balances (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT    NOT NULL,  -- TEXT matches users.id column type
  ledger          TEXT    NOT NULL,  -- main | promo | credits | brdg
  balance_cents   BIGINT  NOT NULL DEFAULT 0,  -- in smallest unit (cents or BRDG wei equivalent)
  currency        TEXT    NOT NULL DEFAULT 'USD',
  locked_cents    BIGINT  NOT NULL DEFAULT 0,  -- reserved for pending operations
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_wallet_user_ledger ON wallet_balances(user_id, ledger);

-- ── Wallet Transactions ──────────────────────────────────────────────────────
CREATE TABLE wallet_transactions (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT    NOT NULL,  -- TEXT matches users.id column type
  ledger          TEXT    NOT NULL,
  direction       TEXT    NOT NULL,  -- credit | debit
  amount_cents    BIGINT  NOT NULL,
  balance_after   BIGINT  NOT NULL,
  description     TEXT    NOT NULL DEFAULT '',
  source_type     TEXT    NOT NULL DEFAULT 'manual',  -- subscription | api_usage | reward | refund | manual | promo | withdrawal
  source_ref      UUID,              -- billing_transaction.id | usage_event.id | etc.
  metadata        JSONB   NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_wallet_tx_user ON wallet_transactions(user_id, created_at DESC);
CREATE INDEX idx_wallet_tx_ledger ON wallet_transactions(ledger, created_at DESC);

-- ── API Keys ─────────────────────────────────────────────────────────────────
-- Note: supplements lib/api-keys.js which uses a separate api_keys table.
-- This table stores ULOE-managed lifecycle fields.
CREATE TABLE uloe_api_keys (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT    NOT NULL,  -- TEXT matches users.id column type
  key_hash        TEXT    NOT NULL UNIQUE,  -- sha256 of raw key (never store raw)
  key_prefix      TEXT    NOT NULL,         -- first 12 chars for display (brdg_live_xxx)
  plan            TEXT    NOT NULL DEFAULT 'starter',
  status          TEXT    NOT NULL DEFAULT 'active',  -- active | suspended | revoked | expired
  rate_limit_rpm  INTEGER NOT NULL DEFAULT 10,
  credits_balance BIGINT  NOT NULL DEFAULT 0,  -- BRDG micro-units remaining
  total_calls     BIGINT  NOT NULL DEFAULT 0,
  last_used_at    TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  label           TEXT,
  metadata        JSONB   NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_uloe_apikeys_user ON uloe_api_keys(user_id) WHERE status = 'active';
CREATE INDEX idx_uloe_apikeys_expiry ON uloe_api_keys(expires_at) WHERE expires_at IS NOT NULL AND status = 'active';

-- ── User Modules ─────────────────────────────────────────────────────────────
CREATE TABLE user_modules (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT    NOT NULL,  -- TEXT matches users.id column type
  module_id       TEXT    NOT NULL,  -- neurolink | agent_registry | legal_agent | crm | analytics | twin | api_gateway
  status          TEXT    NOT NULL DEFAULT 'inactive',  -- inactive | trial | active | suspended | expired
  activation_source TEXT  NOT NULL DEFAULT 'plan',  -- plan | manual | promo | api
  trial_ends_at   TIMESTAMPTZ,
  activated_at    TIMESTAMPTZ,
  deactivated_at  TIMESTAMPTZ,
  config          JSONB   NOT NULL DEFAULT '{}',
  metadata        JSONB   NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_modules_user_module ON user_modules(user_id, module_id);
CREATE INDEX idx_modules_status ON user_modules(status) WHERE status IN ('active', 'trial');

-- ── Triggers: updated_at maintenance ────────────────────────────────────────
CREATE OR REPLACE FUNCTION uloe_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

-- Triggers are recreated fresh (tables were dropped above so old triggers are gone)
CREATE TRIGGER trig_subscriptions_updated_at BEFORE UPDATE ON user_subscriptions FOR EACH ROW EXECUTE FUNCTION uloe_set_updated_at();
CREATE TRIGGER trig_invoices_updated_at      BEFORE UPDATE ON invoices            FOR EACH ROW EXECUTE FUNCTION uloe_set_updated_at();
CREATE TRIGGER trig_apikeys_updated_at       BEFORE UPDATE ON uloe_api_keys       FOR EACH ROW EXECUTE FUNCTION uloe_set_updated_at();
CREATE TRIGGER trig_modules_updated_at       BEFORE UPDATE ON user_modules        FOR EACH ROW EXECUTE FUNCTION uloe_set_updated_at();

-- ── Row Level Security ───────────────────────────────────────────────────────
ALTER TABLE lifecycle_events     ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_subscriptions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices             ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_events         ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_quotas         ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_balances      ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_transactions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE uloe_api_keys        ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_modules         ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS — app uses service_role key
-- Users can read their own data via auth.uid() if using anon key
-- Tables are freshly created above so no pre-existing policies to check
CREATE POLICY "Users read own lifecycle events"
  ON lifecycle_events FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "Users read own subscriptions"
  ON user_subscriptions FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "Users read own invoices"
  ON invoices FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "Users read own wallet"
  ON wallet_balances FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "Users read own modules"
  ON user_modules FOR SELECT USING (auth.uid()::text = user_id);
