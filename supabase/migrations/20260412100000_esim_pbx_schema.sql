-- ============================================================
-- BRIDGE AI OS — eSIM + PBX Global Telco Platform Schema
-- Migration: 20260412100000
-- ============================================================

-- eSIM accounts (one per user/lead)
CREATE TABLE IF NOT EXISTS esim_accounts (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID,
  contact_id      UUID,
  iccid           TEXT    UNIQUE,
  phone_number    TEXT,
  country_code    TEXT    DEFAULT 'ZA',
  provider        TEXT    DEFAULT 'bridge_telco',
  plan_name       TEXT    DEFAULT 'Global Starter',
  data_gb         NUMERIC DEFAULT 1,
  data_used_mb    NUMERIC DEFAULT 0,
  voice_minutes   INTEGER DEFAULT 0,
  sms_count       INTEGER DEFAULT 0,
  status          TEXT    DEFAULT 'pending'
                  CHECK (status IN ('pending','active','suspended','cancelled','expired')),
  expires_at      TIMESTAMPTZ,
  wallet_balance  NUMERIC DEFAULT 0,
  currency        TEXT    DEFAULT 'ZAR',
  activation_qr   TEXT,
  apn_settings    JSONB   DEFAULT '{}',
  meta            JSONB   DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- PBX extensions (SIP accounts per eSIM)
CREATE TABLE IF NOT EXISTS pbx_extensions (
  id               UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  esim_id          UUID  REFERENCES esim_accounts(id) ON DELETE CASCADE,
  extension        TEXT  NOT NULL,
  display_name     TEXT,
  did_number       TEXT,
  sip_username     TEXT,
  sip_domain       TEXT  DEFAULT 'pbx.bridge-ai-os.com',
  status           TEXT  DEFAULT 'active'
                   CHECK (status IN ('active','inactive','busy','dnd')),
  voicemail_enabled   BOOLEAN DEFAULT TRUE,
  recording_enabled   BOOLEAN DEFAULT FALSE,
  ivr_menu         JSONB DEFAULT '{}',
  call_forwarding  TEXT,
  meta             JSONB DEFAULT '{}',
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Virtual DID numbers (global number inventory)
CREATE TABLE IF NOT EXISTS pbx_numbers (
  id           UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  number       TEXT  UNIQUE NOT NULL,
  country      TEXT  DEFAULT 'South Africa',
  country_code TEXT  DEFAULT '+27',
  region       TEXT,
  type         TEXT  DEFAULT 'local'
               CHECK (type IN ('local','toll_free','mobile','international')),
  assigned_to  UUID  REFERENCES pbx_extensions(id) ON DELETE SET NULL,
  monthly_cost NUMERIC DEFAULT 0,
  status       TEXT  DEFAULT 'available'
               CHECK (status IN ('available','assigned','porting','suspended')),
  features     TEXT[]  DEFAULT ARRAY['voice','sms'],
  carrier      TEXT  DEFAULT 'bridge_carrier',
  meta         JSONB DEFAULT '{}',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Call detail records
CREATE TABLE IF NOT EXISTS pbx_cdr (
  id              UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  from_number     TEXT,
  to_number       TEXT,
  extension_id    UUID  REFERENCES pbx_extensions(id) ON DELETE SET NULL,
  direction       TEXT  DEFAULT 'outbound'
                  CHECK (direction IN ('inbound','outbound','internal')),
  duration_seconds INTEGER DEFAULT 0,
  status          TEXT  DEFAULT 'answered'
                  CHECK (status IN ('answered','no_answer','busy','failed','voicemail')),
  cost            NUMERIC DEFAULT 0,
  recording_url   TEXT,
  transcript      TEXT,
  ai_summary      TEXT,
  sentiment       TEXT,
  meta            JSONB DEFAULT '{}',
  started_at      TIMESTAMPTZ DEFAULT NOW(),
  ended_at        TIMESTAMPTZ
);

-- eSIM top-ups and billing events
CREATE TABLE IF NOT EXISTS esim_topups (
  id          UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  esim_id     UUID  REFERENCES esim_accounts(id) ON DELETE CASCADE,
  type        TEXT  DEFAULT 'data'
              CHECK (type IN ('data','voice','sms','wallet','plan_upgrade','plan_renewal')),
  amount      NUMERIC NOT NULL,
  currency    TEXT  DEFAULT 'ZAR',
  gb_added    NUMERIC DEFAULT 0,
  minutes_added INTEGER DEFAULT 0,
  description TEXT,
  status      TEXT  DEFAULT 'completed'
              CHECK (status IN ('pending','completed','failed','refunded')),
  payment_ref TEXT,
  meta        JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- AI-powered nurture sequences for eSIM leads
CREATE TABLE IF NOT EXISTS esim_nurture (
  id                     UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id                UUID,
  esim_id                UUID  REFERENCES esim_accounts(id) ON DELETE SET NULL,
  lead_email             TEXT,
  lead_name              TEXT,
  lead_company           TEXT,
  stage                  TEXT  DEFAULT 'discovery'
                         CHECK (stage IN ('discovery','demo_scheduled','proposal_sent','onboarding','active','churned')),
  ai_score               INTEGER DEFAULT 0,
  ai_recommendation      TEXT,
  next_action            TEXT,
  next_action_at         TIMESTAMPTZ,
  emails_sent            INTEGER DEFAULT 0,
  last_email_subject     TEXT,
  last_email_at          TIMESTAMPTZ,
  conversion_probability NUMERIC DEFAULT 0,
  objections             TEXT[],
  use_case               TEXT,
  meta                   JSONB DEFAULT '{}',
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);

-- Plans catalog
CREATE TABLE IF NOT EXISTS esim_plans (
  id           UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT  UNIQUE NOT NULL,
  description  TEXT,
  data_gb      NUMERIC NOT NULL,
  voice_minutes INTEGER DEFAULT 0,
  sms_count    INTEGER DEFAULT 0,
  countries    TEXT[]  DEFAULT ARRAY['ZA'],
  price_zar    NUMERIC NOT NULL,
  price_usd    NUMERIC,
  validity_days INTEGER DEFAULT 30,
  features     TEXT[]  DEFAULT ARRAY['global_data'],
  is_active    BOOLEAN DEFAULT TRUE,
  sort_order   INTEGER DEFAULT 0,
  meta         JSONB DEFAULT '{}',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default plans
INSERT INTO esim_plans (name, description, data_gb, voice_minutes, sms_count, countries, price_zar, price_usd, validity_days, features, sort_order)
VALUES
  ('Global Starter',  '1 GB global data, 50 countries',  1,   0,   0,   ARRAY['ZA','US','UK','DE','FR','AU','JP','SG','AE','NG'], 99,  5.50,  30, ARRAY['global_data','esim_qr'],          1),
  ('Global Pro',      '5 GB + 200 minutes, 100 countries',5, 200,  50,  ARRAY['ZA','US','UK','DE','FR','AU','JP','SG','AE','NG','CA','IT','ES','NL','SE'], 299, 16.50, 30, ARRAY['global_data','voice','sms','esim_qr','pbx_extension'],  2),
  ('Business Elite', '20 GB + unlimited voice, 190+ countries', 20, 0, 200, ARRAY['global'], 799, 44.50, 30, ARRAY['global_data','unlimited_voice','sms','esim_qr','pbx_extension','dedicated_number','ai_summary'], 3),
  ('Commander Fleet', '100 GB + full PBX + AI Suite',   100, 0, 1000, ARRAY['global'], 2499, 139.00, 30, ARRAY['global_data','unlimited_voice','sms','esim_qr','pbx_extension','dedicated_number','ai_summary','call_recording','ivr','fleet_management','crm_sync'], 4)
ON CONFLICT (name) DO NOTHING;

-- Seed sample global numbers
INSERT INTO pbx_numbers (number, country, country_code, region, type, monthly_cost, features)
VALUES
  ('+27110001001', 'South Africa', '+27', 'Johannesburg', 'local',         49,   ARRAY['voice','sms']),
  ('+27800001001', 'South Africa', '+27', 'National',     'toll_free',     99,   ARRAY['voice','sms']),
  ('+442071234001', 'United Kingdom', '+44', 'London',    'local',         89,   ARRAY['voice','sms']),
  ('+12125550001', 'United States',   '+1',  'New York',  'local',         79,   ARRAY['voice','sms']),
  ('+61287654001', 'Australia',       '+61', 'Sydney',    'local',         85,   ARRAY['voice','sms']),
  ('+4930123401',  'Germany',         '+49', 'Berlin',    'local',         75,   ARRAY['voice','sms']),
  ('+6565432001',  'Singapore',       '+65', 'Singapore', 'local',         95,   ARRAY['voice','sms']),
  ('+97143210001', 'UAE',             '+971','Dubai',      'local',         110,  ARRAY['voice','sms'])
ON CONFLICT (number) DO NOTHING;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_esim_accounts_status   ON esim_accounts(status);
CREATE INDEX IF NOT EXISTS idx_esim_accounts_user     ON esim_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_esim_accounts_contact  ON esim_accounts(contact_id);
CREATE INDEX IF NOT EXISTS idx_pbx_cdr_extension      ON pbx_cdr(extension_id);
CREATE INDEX IF NOT EXISTS idx_pbx_cdr_started        ON pbx_cdr(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_esim_nurture_lead      ON esim_nurture(lead_id);
CREATE INDEX IF NOT EXISTS idx_esim_nurture_email     ON esim_nurture(lead_email);
CREATE INDEX IF NOT EXISTS idx_pbx_numbers_status     ON pbx_numbers(status);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_esim_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_esim_accounts_updated ON esim_accounts;
CREATE TRIGGER trg_esim_accounts_updated
  BEFORE UPDATE ON esim_accounts
  FOR EACH ROW EXECUTE FUNCTION update_esim_updated_at();

DROP TRIGGER IF EXISTS trg_esim_nurture_updated ON esim_nurture;
CREATE TRIGGER trg_esim_nurture_updated
  BEFORE UPDATE ON esim_nurture
  FOR EACH ROW EXECUTE FUNCTION update_esim_updated_at();
