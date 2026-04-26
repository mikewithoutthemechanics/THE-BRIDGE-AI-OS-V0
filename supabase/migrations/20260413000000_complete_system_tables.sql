-- =============================================================================
-- BRIDGE AI OS — Complete System Tables Migration
-- Covers: agent economy, task marketplace, AP2 protocol, autonomous pipeline,
--         supaclaw ledger, affiliate program, nurture queue, digital twin
-- Safe: all CREATE TABLE IF NOT EXISTS + ALTER TABLE ADD COLUMN IF NOT EXISTS
-- =============================================================================

-- ── Extensions ────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- 1. AGENT OPERATING ECONOMY (AOE)
-- =============================================================================

CREATE TABLE IF NOT EXISTS agents (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  role        text,
  layer       text,
  type        text,
  source      text,
  skills      jsonb  DEFAULT '[]',
  status      text   DEFAULT 'active',
  config      jsonb  DEFAULT '{}',
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
CREATE INDEX IF NOT EXISTS idx_agents_layer  ON agents(layer);

CREATE TABLE IF NOT EXISTS agent_balances (
  agent_id       text PRIMARY KEY,
  balance        double precision DEFAULT 0,
  earned_total   double precision DEFAULT 0,
  spent_total    double precision DEFAULT 0,
  escrowed       double precision DEFAULT 0,
  fiat_revenue   double precision DEFAULT 0,
  ap2_revenue    double precision DEFAULT 0,
  affiliate_revenue double precision DEFAULT 0,
  fiat_cost      double precision DEFAULT 0,
  last_tx        timestamptz DEFAULT now(),
  created_at     timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agent_balances_balance ON agent_balances(balance DESC);

CREATE TABLE IF NOT EXISTS agent_transactions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tx_id        text UNIQUE,
  from_agent   text,
  to_agent     text,
  amount       double precision NOT NULL,
  fee          double precision DEFAULT 0,
  burn         double precision DEFAULT 0,
  net          double precision DEFAULT 0,
  type         text,
  ref          text,
  note         text,
  ts           timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agent_tx_from   ON agent_transactions(from_agent);
CREATE INDEX IF NOT EXISTS idx_agent_tx_to     ON agent_transactions(to_agent);
CREATE INDEX IF NOT EXISTS idx_agent_tx_ts     ON agent_transactions(ts DESC);

CREATE TABLE IF NOT EXISTS tasks_market (
  id            text PRIMARY KEY,
  poster_agent  text,
  claimer_agent text,
  title         text NOT NULL,
  description   text,
  reward_brdg   double precision DEFAULT 0,
  escrow_amount double precision DEFAULT 0,
  status        text DEFAULT 'POSTED',
  source        text DEFAULT 'internal',
  posted_at     timestamptz DEFAULT now(),
  claimed_at    timestamptz,
  started_at    timestamptz,
  completed_at  timestamptz,
  result        text,
  metadata      jsonb DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_tasks_market_status     ON tasks_market(status);
CREATE INDEX IF NOT EXISTS idx_tasks_market_poster     ON tasks_market(poster_agent);
CREATE INDEX IF NOT EXISTS idx_tasks_market_posted_at ON tasks_market(posted_at DESC);

-- Add missing columns to tasks_market if upgrading
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks_market' AND column_name='metadata') THEN
    ALTER TABLE tasks_market ADD COLUMN metadata jsonb DEFAULT '{}';
  END IF;
END $$;

-- =============================================================================
-- 2. AUTONOMOUS REVENUE PIPELINE
-- =============================================================================

-- leads: unified entry point for the pipeline (maps from crm_leads + form signups)
CREATE TABLE IF NOT EXISTS leads (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text NOT NULL,
  name        text,
  company     text,
  score       integer DEFAULT 0,
  temperature text DEFAULT 'cold',
  status      text DEFAULT 'new',
  source      text,
  funnel_stage text DEFAULT 'top',
  assigned_agent text,
  last_contacted timestamptz,
  crm_lead_id text,   -- FK ref to crm_leads.id (soft link)
  metadata    jsonb DEFAULT '{}',
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_leads_status      ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_score       ON leads(score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_temperature ON leads(temperature);
CREATE INDEX IF NOT EXISTS idx_leads_email       ON leads(email);

-- nurture_queue: scheduled email sequences for warm leads
CREATE TABLE IF NOT EXISTS nurture_queue (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     uuid REFERENCES leads(id) ON DELETE CASCADE,
  email       text NOT NULL,
  name        text,
  company     text,
  stage       text DEFAULT 'day_0',
  template_id text,
  status      text DEFAULT 'queued',
  queued_at   timestamptz DEFAULT now(),
  sent_at     timestamptz,
  opened_at   timestamptz,
  clicked_at  timestamptz,
  metadata    jsonb DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_nurture_status   ON nurture_queue(status);
CREATE INDEX IF NOT EXISTS idx_nurture_lead_id  ON nurture_queue(lead_id);
CREATE INDEX IF NOT EXISTS idx_nurture_queued   ON nurture_queue(queued_at ASC);

-- Add reinvested column to payments if missing
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payments' AND column_name='reinvested') THEN
    ALTER TABLE payments ADD COLUMN reinvested boolean DEFAULT false;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payments' AND column_name='reinvested_at') THEN
    ALTER TABLE payments ADD COLUMN reinvested_at timestamptz;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_payments_reinvested ON payments(reinvested) WHERE reinvested = false;

-- payment_proof_chain: zero-trust Merkle-chained payment log
CREATE TABLE IF NOT EXISTS payment_proof_chain (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id    text UNIQUE,
  user_id       text,
  email         text,
  amount        double precision NOT NULL,
  currency      text DEFAULT 'ZAR',
  source        text,
  gateway       text,
  status        text DEFAULT 'completed',
  plan          text,
  prev_hash     text,
  entry_hash    text,
  chain_index   integer,
  reinvested    boolean DEFAULT false,
  reinvested_at timestamptz,
  metadata      jsonb DEFAULT '{}',
  created_at    timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_proof_chain_reinvested ON payment_proof_chain(reinvested) WHERE reinvested = false;
CREATE INDEX IF NOT EXISTS idx_proof_chain_created    ON payment_proof_chain(created_at DESC);

-- =============================================================================
-- 3. AP2 MULTI-AGENT PROTOCOL
-- =============================================================================

CREATE TABLE IF NOT EXISTS ap2_offers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id     text NOT NULL,
  seller_id    text NOT NULL,
  asset        text,
  asset_type   text,
  amount       double precision,
  price        double precision,
  currency     text DEFAULT 'BRDG',
  status       text DEFAULT 'pending',
  expires_at   timestamptz,
  accepted_at  timestamptz,
  rejected_at  timestamptz,
  metadata     jsonb DEFAULT '{}',
  created_at   timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ap2_offers_buyer  ON ap2_offers(buyer_id);
CREATE INDEX IF NOT EXISTS idx_ap2_offers_status ON ap2_offers(status);

CREATE TABLE IF NOT EXISTS ap2_payments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id     uuid REFERENCES ap2_offers(id),
  from_agent   text NOT NULL,
  to_agent     text NOT NULL,
  amount       double precision NOT NULL,
  fee          double precision DEFAULT 0,
  tx_hash      text,
  status       text DEFAULT 'pending',
  settled_at   timestamptz,
  created_at   timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ap2_payments_offer  ON ap2_payments(offer_id);
CREATE INDEX IF NOT EXISTS idx_ap2_payments_from   ON ap2_payments(from_agent);

CREATE TABLE IF NOT EXISTS ap2_receipts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id   uuid REFERENCES ap2_payments(id),
  receipt_hash text,
  receipt_data jsonb DEFAULT '{}',
  confirmed_by text,
  confirmed_at timestamptz DEFAULT now()
);

-- =============================================================================
-- 4. SUPACLAW / ECONOMY STATE MACHINE
-- =============================================================================

CREATE TABLE IF NOT EXISTS supaclaw_ledger (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle        integer,
  tx_type      text,
  amount       double precision,
  from_account text,
  to_account   text,
  note         text,
  metadata     jsonb DEFAULT '{}',
  created_at   timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_supaclaw_ledger_cycle ON supaclaw_ledger(cycle DESC);
CREATE INDEX IF NOT EXISTS idx_supaclaw_ledger_type  ON supaclaw_ledger(tx_type);

CREATE TABLE IF NOT EXISTS supaclaw_snapshots (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle         integer,
  snapshot_data jsonb,
  treasury      double precision DEFAULT 0,
  circulating   double precision DEFAULT 0,
  burned        double precision DEFAULT 0,
  taken_at      timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_supaclaw_snapshots_cycle ON supaclaw_snapshots(cycle DESC);

CREATE TABLE IF NOT EXISTS supaclaw_state (
  id           text PRIMARY KEY DEFAULT 'singleton',
  state_data   jsonb DEFAULT '{}',
  version      integer DEFAULT 1,
  updated_at   timestamptz DEFAULT now()
);

-- =============================================================================
-- 5. AFFILIATE PROGRAM (FULL)
-- =============================================================================

-- affiliate_clicks: tracks every referral link click with source attribution
CREATE TABLE IF NOT EXISTS affiliate_clicks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id text NOT NULL,
  partner_id   text,
  click_id     text UNIQUE DEFAULT gen_random_uuid()::text,
  ip_hash      text,   -- hashed for privacy
  user_agent   text,
  referrer     text,
  landing_page text,
  utm_source   text,
  utm_medium   text,
  utm_campaign text,
  converted    boolean DEFAULT false,
  conversion_id text,
  conversion_value double precision DEFAULT 0,
  reference    text,    -- payment reference (ties click to PayFast IPN)
  clicked_at   timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_aff_clicks_affiliate  ON affiliate_clicks(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_aff_clicks_partner    ON affiliate_clicks(partner_id);
CREATE INDEX IF NOT EXISTS idx_aff_clicks_converted  ON affiliate_clicks(converted) WHERE converted = true;
CREATE INDEX IF NOT EXISTS idx_aff_clicks_clicked    ON affiliate_clicks(clicked_at DESC);
CREATE INDEX IF NOT EXISTS idx_aff_clicks_reference  ON affiliate_clicks(reference) WHERE reference IS NOT NULL;

-- affiliate_conversions: confirmed sales / signups attributed to affiliates
CREATE TABLE IF NOT EXISTS affiliate_conversions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id    text NOT NULL,
  click_id        text REFERENCES affiliate_clicks(click_id),
  partner_id      text,
  user_id         text,
  email           text,
  plan            text,
  sale_amount     double precision DEFAULT 0,
  currency        text DEFAULT 'ZAR',
  commission_rate double precision DEFAULT 0,
  commission_amount double precision DEFAULT 0,
  commission_currency text DEFAULT 'ZAR',
  brdg_bonus      double precision DEFAULT 0,
  status          text DEFAULT 'pending',  -- pending, approved, paid, reversed
  approved_at     timestamptz,
  paid_at         timestamptz,
  payment_method  text,
  payment_ref     text,
  metadata        jsonb DEFAULT '{}',
  created_at      timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_aff_conv_affiliate ON affiliate_conversions(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_aff_conv_status    ON affiliate_conversions(status);
CREATE INDEX IF NOT EXISTS idx_aff_conv_created   ON affiliate_conversions(created_at DESC);

-- Add missing columns to affiliates table if upgrading
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='affiliates' AND column_name='brdg_earned') THEN
    ALTER TABLE affiliates ADD COLUMN brdg_earned double precision DEFAULT 0;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='affiliates' AND column_name='total_clicks') THEN
    ALTER TABLE affiliates ADD COLUMN total_clicks integer DEFAULT 0;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='affiliates' AND column_name='total_conversions') THEN
    ALTER TABLE affiliates ADD COLUMN total_conversions integer DEFAULT 0;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='affiliates' AND column_name='tier') THEN
    ALTER TABLE affiliates ADD COLUMN tier text DEFAULT 'starter';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='affiliates' AND column_name='referral_code') THEN
    ALTER TABLE affiliates ADD COLUMN referral_code text;
  END IF;
END $$;

-- =============================================================================
-- 6. DIGITAL TWIN + AGENT MEMORY
-- =============================================================================

CREATE TABLE IF NOT EXISTS agent_twins (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      text NOT NULL,
  agent_id     text,
  name         text,
  personality  jsonb DEFAULT '{}',
  memory       jsonb DEFAULT '[]',
  goals        jsonb DEFAULT '[]',
  skills       jsonb DEFAULT '[]',
  status       text DEFAULT 'active',
  last_active  timestamptz DEFAULT now(),
  created_at   timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agent_twins_user_id  ON agent_twins(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_twins_agent_id ON agent_twins(agent_id);

CREATE TABLE IF NOT EXISTS agent_memory (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id     text NOT NULL,
  memory_type  text DEFAULT 'episodic',
  content      text,
  embedding    vector(1536),
  importance   double precision DEFAULT 0.5,
  recalled     integer DEFAULT 0,
  metadata     jsonb DEFAULT '{}',
  created_at   timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agent_memory_agent  ON agent_memory(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_memory_type   ON agent_memory(memory_type);

-- =============================================================================
-- 7. CRM DEALS (missing from business suite)
-- =============================================================================

CREATE TABLE IF NOT EXISTS crm_deals (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      text,
  lead_id      text,  -- references crm_leads.id
  contact_id   uuid,  -- references contacts.id
  title        text NOT NULL,
  value        double precision DEFAULT 0,
  currency     text DEFAULT 'ZAR',
  stage        text DEFAULT 'prospecting',
  probability  integer DEFAULT 0,
  close_date   date,
  owner_agent  text,
  notes        text,
  metadata     jsonb DEFAULT '{}',
  closed_at    timestamptz,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crm_deals_stage     ON crm_deals(stage);
CREATE INDEX IF NOT EXISTS idx_crm_deals_owner     ON crm_deals(owner_agent);
CREATE INDEX IF NOT EXISTS idx_crm_deals_user      ON crm_deals(user_id);

-- =============================================================================
-- 8. PIPELINE EVENT LOG
-- =============================================================================

CREATE TABLE IF NOT EXISTS pipeline_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage      text NOT NULL,
  event_type text,
  lead_id    uuid,
  agent_id   text,
  data       jsonb DEFAULT '{}',
  ts         timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pipeline_events_stage ON pipeline_events(stage);
CREATE INDEX IF NOT EXISTS idx_pipeline_events_ts    ON pipeline_events(ts DESC);

-- =============================================================================
-- 9. ROW LEVEL SECURITY (service_role bypass for all new tables)
-- =============================================================================

ALTER TABLE leads                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE nurture_queue          ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_proof_chain    ENABLE ROW LEVEL SECURITY;
ALTER TABLE ap2_offers             ENABLE ROW LEVEL SECURITY;
ALTER TABLE ap2_payments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE ap2_receipts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE supaclaw_ledger        ENABLE ROW LEVEL SECURITY;
ALTER TABLE supaclaw_snapshots     ENABLE ROW LEVEL SECURITY;
ALTER TABLE supaclaw_state         ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_clicks       ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_conversions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_twins            ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_events        ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_deals              ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks_market           ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_balances         ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_transactions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents                 ENABLE ROW LEVEL SECURITY;

-- Service role bypass policies
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY[
    'leads','nurture_queue','payment_proof_chain','ap2_offers','ap2_payments',
    'ap2_receipts','supaclaw_ledger','supaclaw_snapshots','supaclaw_state',
    'affiliate_clicks','affiliate_conversions','agent_twins','pipeline_events',
    'crm_deals','tasks_market','agent_balances','agent_transactions','agents','agent_memory'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS service_role_all ON %I', t);
    EXECUTE format('CREATE POLICY service_role_all ON %I FOR ALL TO service_role USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;

-- =============================================================================
-- 10. UTILITY FUNCTIONS
-- =============================================================================

-- Update updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to relevant tables
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['leads','crm_deals','agents'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_updated_at ON %I', t);
    EXECUTE format('CREATE TRIGGER trg_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at()', t);
  END LOOP;
END $$;
