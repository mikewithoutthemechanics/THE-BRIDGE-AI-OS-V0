-- Migration 008: Federated Carrier Ecosystem
-- Reseller hierarchy, wallet system, federation, number marketplace
-- Run once against Supabase Postgres.

-- ── Reseller Hierarchy (L0=root, L1=master, L2=reseller) ─────────────────────
CREATE TABLE IF NOT EXISTS public.pbx_resellers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id     UUID REFERENCES public.pbx_resellers(id) ON DELETE RESTRICT,
  level         INT NOT NULL DEFAULT 2 CHECK (level IN (0,1,2)),
  name          TEXT NOT NULL,
  email         TEXT,
  phone         TEXT,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','pending')),
  wallet_id     UUID,
  pricing       JSONB NOT NULL DEFAULT '{"call_per_min":0.05,"did_monthly":1.00,"data_per_mb":0.01,"sms_per_unit":0.02}',
  markup_rules  JSONB NOT NULL DEFAULT '{"min_margin":10,"max_discount":30,"revenue_share_pct":20}',
  white_label   JSONB NOT NULL DEFAULT '{}',
  custom_domain TEXT,
  api_key       TEXT UNIQUE DEFAULT encode(gen_random_bytes(32),'hex'),
  created_by    UUID,
  meta          JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pbx_resellers_parent_idx ON public.pbx_resellers (parent_id);
CREATE INDEX IF NOT EXISTS pbx_resellers_level_idx  ON public.pbx_resellers (level);

-- ── Wallet Per Entity ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pbx_wallets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    TEXT NOT NULL,
  owner_type  TEXT NOT NULL CHECK (owner_type IN ('root','reseller','tenant')),
  balance     DECIMAL(14,4) NOT NULL DEFAULT 0,
  reserved    DECIMAL(14,4) NOT NULL DEFAULT 0,
  credit_line DECIMAL(14,4) NOT NULL DEFAULT 0,
  currency    TEXT NOT NULL DEFAULT 'ZAR',
  is_active   BOOLEAN NOT NULL DEFAULT true,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS pbx_wallets_owner_idx ON public.pbx_wallets (owner_id, owner_type);

-- ── Wallet Transaction Ledger ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pbx_wallet_transactions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id         UUID NOT NULL REFERENCES public.pbx_wallets(id),
  type              TEXT NOT NULL CHECK (type IN ('credit','debit','lock','release','transfer_in','transfer_out')),
  amount            DECIMAL(14,4) NOT NULL,
  balance_after     DECIMAL(14,4),
  reference         TEXT,
  related_wallet_id UUID REFERENCES public.pbx_wallets(id),
  meta              JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pbx_wallet_txn_wallet_idx ON public.pbx_wallet_transactions (wallet_id);
CREATE INDEX IF NOT EXISTS pbx_wallet_txn_ref_idx    ON public.pbx_wallet_transactions (reference);

-- ── Federation Carriers ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pbx_federation_carriers (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_id   TEXT UNIQUE NOT NULL,
  name         TEXT NOT NULL,
  endpoint     TEXT NOT NULL,
  routes       JSONB NOT NULL DEFAULT '[]',
  rates        JSONB NOT NULL DEFAULT '{"per_min":0.05,"connect_fee":0.01}',
  auth         JSONB NOT NULL DEFAULT '{"type":"ip"}',
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','testing')),
  priority     INT NOT NULL DEFAULT 5,
  latency_ms   INT DEFAULT 50,
  success_rate DECIMAL(5,2) DEFAULT 99.00,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pbx_federation_status_idx   ON public.pbx_federation_carriers (status);
CREATE INDEX IF NOT EXISTS pbx_federation_priority_idx ON public.pbx_federation_carriers (priority);

-- ── Revenue Split Ledger ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pbx_revenue_splits (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_ref TEXT NOT NULL,
  total_amount    DECIMAL(14,4) NOT NULL,
  reseller_id     UUID REFERENCES public.pbx_resellers(id),
  splits          JSONB NOT NULL DEFAULT '[]',
  root_amount     DECIMAL(14,4) NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'completed',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pbx_revenue_splits_reseller_idx ON public.pbx_revenue_splits (reseller_id);
CREATE INDEX IF NOT EXISTS pbx_revenue_splits_ref_idx      ON public.pbx_revenue_splits (transaction_ref);

-- ── Number Marketplace ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pbx_number_marketplace (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number             TEXT NOT NULL UNIQUE,
  country            TEXT NOT NULL,
  country_code       TEXT,
  type               TEXT NOT NULL DEFAULT 'did' CHECK (type IN ('did','toll_free','mobile','virtual')),
  capabilities       JSONB NOT NULL DEFAULT '["voice","sms"]',
  owner_reseller_id  UUID REFERENCES public.pbx_resellers(id),
  listed_by          UUID,
  price_monthly      DECIMAL(10,4) NOT NULL DEFAULT 5.00,
  price_setup        DECIMAL(10,4) NOT NULL DEFAULT 0,
  status             TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','reserved','sold','delisted')),
  reserved_until     TIMESTAMPTZ,
  reserved_by        UUID,
  meta               JSONB NOT NULL DEFAULT '{}',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pbx_marketplace_status_idx  ON public.pbx_number_marketplace (status);
CREATE INDEX IF NOT EXISTS pbx_marketplace_country_idx ON public.pbx_number_marketplace (country);

-- ── Seed root carrier federation examples ───────────────────────────────────
INSERT INTO public.pbx_federation_carriers (carrier_id, name, endpoint, routes, rates, auth, priority, latency_ms, success_rate)
VALUES
  ('carrier_za_primary',  'Bridge ZA Primary',   'sip.bridge-ai-os.com',  '["+27"]',       '{"per_min":0.03,"connect_fee":0.005}', '{"type":"ip"}', 1, 20, 99.9),
  ('carrier_global_tier1','Global Tier-1',        'sip.tier1.example.com', '["+1","+44","+49","+33","+61"]', '{"per_min":0.05,"connect_fee":0.01}', '{"type":"credentials","username":"bridge","password":"***"}', 2, 45, 99.5),
  ('carrier_africa',      'Pan-Africa Route',     'sip.africa.example.com','["+234","+254","+233","+256","+255"]','{"per_min":0.08,"connect_fee":0.02}', '{"type":"ip"}', 3, 80, 98.0)
ON CONFLICT (carrier_id) DO NOTHING;

-- ── Seed sample marketplace numbers ─────────────────────────────────────────
INSERT INTO public.pbx_number_marketplace (number, country, country_code, type, capabilities, price_monthly)
VALUES
  ('+27 10 001 0001', 'South Africa', 'ZA', 'did',       '["voice","sms"]',       12.00),
  ('+27 10 001 0002', 'South Africa', 'ZA', 'did',       '["voice","sms"]',       12.00),
  ('+27 10 001 0003', 'South Africa', 'ZA', 'toll_free', '["voice"]',             25.00),
  ('+1 415 555 0100', 'United States','US', 'did',       '["voice","sms","fax"]', 15.00),
  ('+44 20 7946 0100','United Kingdom','GB', 'did',       '["voice","sms"]',       18.00),
  ('+234 70 000 0001','Nigeria',       'NG', 'mobile',    '["voice","sms"]',       20.00),
  ('+254 70 000 0001','Kenya',         'KE', 'mobile',    '["voice","sms"]',       20.00)
ON CONFLICT (number) DO NOTHING;

COMMENT ON TABLE public.pbx_resellers            IS 'L0=root carrier, L1=master resellers, L2=resellers. Hierarchical telecom reseller tree.';
COMMENT ON TABLE public.pbx_wallets              IS 'One wallet per entity (root, reseller, tenant). Tracks balance + reserved + credit line.';
COMMENT ON TABLE public.pbx_wallet_transactions  IS 'Immutable ledger of all wallet operations.';
COMMENT ON TABLE public.pbx_federation_carriers  IS 'External SIP carrier interconnects for smart least-cost routing.';
COMMENT ON TABLE public.pbx_revenue_splits       IS 'Audit trail of revenue distribution up the reseller chain.';
COMMENT ON TABLE public.pbx_number_marketplace   IS 'Buy/sell/lease DID numbers and eSIM profiles between carriers.';
