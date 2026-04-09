-- Bridge AI OS - Complete PostgreSQL Schema for Supabase
-- Generated 2026-04-09

-- ============================================================
-- USERS (main auth store from data/users.db)
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  email text UNIQUE NOT NULL,
  name text,
  company text,
  oauth_provider text,
  oauth_id text,
  password_hash text,
  plan text DEFAULT 'visitor',
  brdg_balance double precision DEFAULT 0,
  funnel_stage text DEFAULT 'visitor',
  lead_score integer DEFAULT 0,
  pain_points jsonb DEFAULT '[]',
  pages_visited jsonb DEFAULT '[]',
  conversations integer DEFAULT 0,
  last_page text,
  utm_source text,
  first_seen timestamptz DEFAULT now(),
  last_seen timestamptz DEFAULT now(),
  api_key text,
  role text DEFAULT 'user',
  totp_secret text,
  totp_backup_codes text,
  totp_enabled boolean DEFAULT false
);

-- ============================================================
-- AGENT LEDGER (from data/agent-ledger.db)
-- ============================================================
CREATE TABLE IF NOT EXISTS agent_balances (
  agent_id text PRIMARY KEY,
  balance double precision NOT NULL DEFAULT 0,
  earned_total double precision NOT NULL DEFAULT 0,
  spent_total double precision NOT NULL DEFAULT 0,
  escrowed double precision NOT NULL DEFAULT 0,
  last_tx text,
  fiat_revenue double precision NOT NULL DEFAULT 0,
  ap2_revenue double precision NOT NULL DEFAULT 0,
  affiliate_revenue double precision NOT NULL DEFAULT 0,
  fiat_cost double precision NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS agent_transactions (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  from_agent text,
  to_agent text,
  amount double precision NOT NULL DEFAULT 0,
  fee double precision DEFAULT 0,
  burn double precision DEFAULT 0,
  type text,
  task_id text,
  memo text,
  ts timestamptz DEFAULT now()
);

-- ============================================================
-- AGENT REGISTRY (from data/agent-registry.db)
-- ============================================================
CREATE TABLE IF NOT EXISTS agents (
  id text PRIMARY KEY,
  name text NOT NULL UNIQUE,
  role text NOT NULL DEFAULT 'general',
  layer text NOT NULL DEFAULT 'L1',
  type text NOT NULL DEFAULT 'agent',
  source text,
  skills jsonb DEFAULT '[]',
  status text NOT NULL DEFAULT 'active',
  config jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================================
-- AP2-v3 MEMORY (from data/ap2v3-memory.db)
-- ============================================================
CREATE TABLE IF NOT EXISTS agent_memory (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id text,
  agent_id text,
  input text,
  output text,
  score double precision,
  tokens integer,
  ts timestamptz DEFAULT now()
);

-- ============================================================
-- API KEYS (from data/api-keys.db)
-- ============================================================
CREATE TABLE IF NOT EXISTS api_keys (
  key_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  api_key text UNIQUE,
  email text,
  plan text DEFAULT 'free',
  rate_limit_per_min integer DEFAULT 60,
  calls_today integer DEFAULT 0,
  calls_total integer DEFAULT 0,
  brdg_balance double precision DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  last_used timestamptz
);

-- ============================================================
-- DATA FLYWHEEL (from data/data-flywheel.db)
-- ============================================================
CREATE TABLE IF NOT EXISTS data_signals (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  signal_type text,
  agent_id text,
  value double precision,
  metadata jsonb,
  ts timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_routing_weights (
  agent_id text PRIMARY KEY,
  weight double precision DEFAULT 1.0,
  tasks_completed integer DEFAULT 0,
  avg_value double precision DEFAULT 0,
  conversion_rate double precision DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

-- ============================================================
-- MERCHANT BIDS (from data/merchant-bids.db)
-- ============================================================
CREATE TABLE IF NOT EXISTS merchant_bids (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  merchant_name text,
  bid_amount_brdg double precision DEFAULT 0,
  category text,
  target_agent text,
  status text DEFAULT 'active',
  impressions integer DEFAULT 0,
  clicks integer DEFAULT 0,
  conversions integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz
);

-- ============================================================
-- PAGE ECONOMICS (from data/page-economics.db)
-- ============================================================
CREATE TABLE IF NOT EXISTS page_economics (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  page text,
  user_id text,
  action text,
  brdg_value double precision DEFAULT 0,
  ts timestamptz DEFAULT now()
);

-- ============================================================
-- TASK MARKET (from task-market.db)
-- ============================================================
CREATE TABLE IF NOT EXISTS tasks_market (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  poster_agent text,
  claimer_agent text,
  title text,
  description text,
  reward_brdg double precision DEFAULT 0,
  escrow_amount double precision DEFAULT 0,
  status text DEFAULT 'posted',
  result text,
  source text,
  posted_at timestamptz DEFAULT now(),
  claimed_at timestamptz,
  completed_at timestamptz,
  settled_at timestamptz
);

-- ============================================================
-- REFERRALS (from users.db legacy)
-- ============================================================
CREATE TABLE IF NOT EXISTS referrals (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  referrer_id text REFERENCES users(id),
  referred_email text,
  code text,
  claimed boolean DEFAULT false,
  reward_credits integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  claimed_at timestamptz
);

-- ============================================================
-- PAYMENTS (from users.db legacy)
-- ============================================================
CREATE TABLE IF NOT EXISTS payments (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id text REFERENCES users(id),
  email text,
  amount double precision,
  currency text DEFAULT 'ZAR',
  source text,
  status text DEFAULT 'pending',
  transaction_id text,
  created_at timestamptz DEFAULT now(),
  reference text,
  pf_payment_id text,
  client text
);

-- ============================================================
-- CRM (from users.db legacy)
-- ============================================================
CREATE TABLE IF NOT EXISTS crm_leads (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  email text,
  company text,
  status text DEFAULT 'prospect',
  score integer DEFAULT 0,
  source text,
  osint_profile jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crm_interactions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lead_id text,
  type text,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crm_campaigns (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name text,
  template_type text,
  status text DEFAULT 'draft',
  target_count integer DEFAULT 0,
  sent_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- EMAIL SYSTEM (from users.db legacy)
-- ============================================================
CREATE TABLE IF NOT EXISTS email_outreach (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  email text,
  company text,
  template_type text,
  status text DEFAULT 'queued',
  campaign_id text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS email_sent (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  outreach_id text,
  email text,
  subject text,
  template_type text,
  sent_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS email_opens (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  sent_id text,
  opened_at timestamptz DEFAULT now(),
  ip text,
  user_agent text
);

CREATE TABLE IF NOT EXISTS email_clicks (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  sent_id text,
  url text,
  clicked_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS email_followups (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sent_id text,
  followup_number integer DEFAULT 1,
  sent_at timestamptz DEFAULT now()
);

-- ============================================================
-- OSINT REGISTRY (from users.db legacy)
-- ============================================================
CREATE TABLE IF NOT EXISTS osint_registry (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  task_id text,
  url text,
  title text,
  emails text,
  company_name text,
  industry text,
  size_estimate text,
  template_type text,
  profile_confidence double precision,
  full_profile jsonb,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- EMPELENI (separate business)
-- ============================================================
CREATE TABLE IF NOT EXISTS empeleni_clients (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text,
  phone text,
  service text,
  status text DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS empeleni_payments (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client text,
  amount double precision,
  status text DEFAULT 'pending',
  reference text,
  pf_payment_id text
);

-- ============================================================
-- COMMERCE INDEX + EXTERNAL AGENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS commerce_index (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  score double precision,
  components jsonb,
  ts timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS external_agents (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  agent_name text,
  agent_url text,
  service_catalog jsonb,
  commission_rate double precision DEFAULT 0.1,
  total_transactions integer DEFAULT 0,
  total_revenue double precision DEFAULT 0,
  status text DEFAULT 'active',
  registered_at timestamptz DEFAULT now(),
  last_active timestamptz
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_funnel ON users(funnel_stage);
CREATE INDEX IF NOT EXISTS idx_agent_tx_from ON agent_transactions(from_agent);
CREATE INDEX IF NOT EXISTS idx_agent_tx_to ON agent_transactions(to_agent);
CREATE INDEX IF NOT EXISTS idx_agent_tx_ts ON agent_transactions(ts);
CREATE INDEX IF NOT EXISTS idx_agents_name ON agents(name);
CREATE INDEX IF NOT EXISTS idx_agents_layer ON agents(layer);
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks_market(status);
CREATE INDEX IF NOT EXISTS idx_tasks_poster ON tasks_market(poster_agent);
CREATE INDEX IF NOT EXISTS idx_crm_leads_email ON crm_leads(email);
CREATE INDEX IF NOT EXISTS idx_page_econ_user ON page_economics(user_id);
