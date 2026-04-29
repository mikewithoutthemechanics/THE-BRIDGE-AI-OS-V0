-- ============================================================================
-- BRIDGE AI OS — Business Suite Schema (Production-Grade)
-- Multi-tenant, white-label ready, AI-orchestrable
-- ============================================================================

-- ── Extensions ──────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- 1. COMPANY PROFILES (multi-tenant root entity)
-- ============================================================================
CREATE TABLE IF NOT EXISTS companies (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  slug        TEXT UNIQUE,
  logo_url    TEXT,
  address     JSONB DEFAULT '{}',        -- {line1, line2, city, state, zip, country}
  phone       TEXT,
  email       TEXT,
  website     TEXT,
  registration_number TEXT,
  tax_number  TEXT,                        -- VAT/Tax ID
  industry    TEXT,
  branding    JSONB DEFAULT '{"primary_color":"#38bdf8","secondary_color":"#0284c7","font":"Inter","email_footer":"","invoice_footer":""}',
  payment_provider TEXT DEFAULT 'payfast', -- payfast | stripe | paypal | manual
  currency    TEXT DEFAULT 'ZAR',
  timezone    TEXT DEFAULT 'Africa/Johannesburg',
  settings    JSONB DEFAULT '{}',
  white_label BOOLEAN DEFAULT false,      -- hide Bridge AI OS branding
  owner_id    UUID,                       -- FK to users
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_companies_owner ON companies(owner_id);
CREATE INDEX IF NOT EXISTS idx_companies_slug ON companies(slug);

-- ============================================================================
-- 2. PAYMENT CONFIGURATIONS (per-company gateway setup)
-- ============================================================================
CREATE TABLE IF NOT EXISTS payment_configs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  provider    TEXT NOT NULL,               -- payfast, stripe, paypal, manual
  is_default  BOOLEAN DEFAULT false,
  config_json JSONB DEFAULT '{}',          -- encrypted API keys/merchant IDs
  sandbox     BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(company_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_payment_configs_company ON payment_configs(company_id);

-- ============================================================================
-- 3. CONTACTS (unified: leads + customers + prospects)
-- ============================================================================
CREATE TABLE IF NOT EXISTS contacts (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  email       TEXT,
  phone       TEXT,
  company_name TEXT,                       -- contact's company
  status      TEXT DEFAULT 'lead',         -- lead, prospect, qualified, customer, churned
  stage       TEXT DEFAULT 'new',          -- new, outreach, demo, proposal, negotiation, closed, lost
  plan        TEXT,
  value       NUMERIC DEFAULT 0,
  score       INTEGER DEFAULT 0,           -- AI lead score 0-100
  source      TEXT,                        -- form, import, api, referral, manual
  tags        TEXT[] DEFAULT '{}',
  notes       TEXT,
  assigned_to TEXT,                        -- agent or user ID
  industry    TEXT,
  address     JSONB DEFAULT '{}',
  meta        JSONB DEFAULT '{}',
  joined_at   DATE,
  last_activity TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contacts_company ON contacts(company_id);
CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts(company_id, status);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(company_id, email);

-- ============================================================================
-- 4. INVOICES
-- ============================================================================
CREATE TABLE IF NOT EXISTS invoices (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contact_id  UUID REFERENCES contacts(id) ON DELETE SET NULL,
  invoice_number TEXT NOT NULL,
  client_name TEXT NOT NULL,
  client_email TEXT,
  line_items  JSONB NOT NULL DEFAULT '[]', -- [{description, qty, unit_price}]
  subtotal    NUMERIC NOT NULL DEFAULT 0,
  tax_rate    NUMERIC DEFAULT 15,          -- percentage
  tax_amount  NUMERIC DEFAULT 0,
  discount    NUMERIC DEFAULT 0,
  total       NUMERIC NOT NULL DEFAULT 0,
  currency    TEXT DEFAULT 'ZAR',
  status      TEXT DEFAULT 'draft',        -- draft, sent, paid, overdue, cancelled, refunded
  issued_date DATE DEFAULT CURRENT_DATE,
  due_date    DATE,
  paid_date   DATE,
  payment_id  UUID,                        -- FK to payments
  payment_link TEXT,                       -- public payment URL
  notes       TEXT,
  footer      TEXT,                        -- legal footer
  meta        JSONB DEFAULT '{}',
  created_by  TEXT DEFAULT 'manual',       -- manual, ai, system
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoices_company ON invoices(company_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(company_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_contact ON invoices(contact_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_number ON invoices(company_id, invoice_number);

-- ============================================================================
-- 5. QUOTES
-- ============================================================================
CREATE TABLE IF NOT EXISTS quotes (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contact_id  UUID REFERENCES contacts(id) ON DELETE SET NULL,
  quote_number TEXT NOT NULL,
  client_name TEXT NOT NULL,
  client_email TEXT,
  line_items  JSONB NOT NULL DEFAULT '[]',
  subtotal    NUMERIC NOT NULL DEFAULT 0,
  tax_rate    NUMERIC DEFAULT 15,
  tax_amount  NUMERIC DEFAULT 0,
  discount    NUMERIC DEFAULT 0,
  total       NUMERIC NOT NULL DEFAULT 0,
  currency    TEXT DEFAULT 'ZAR',
  status      TEXT DEFAULT 'draft',        -- draft, sent, accepted, rejected, expired, converted
  valid_until DATE,
  notes       TEXT,
  converted_invoice_id UUID REFERENCES invoices(id),
  meta        JSONB DEFAULT '{}',
  created_by  TEXT DEFAULT 'manual',
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quotes_company ON quotes(company_id);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(company_id, status);

-- ============================================================================
-- 6. TICKETS (support)
-- ============================================================================
CREATE TABLE IF NOT EXISTS tickets (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contact_id  UUID REFERENCES contacts(id) ON DELETE SET NULL,
  subject     TEXT NOT NULL,
  body        TEXT,
  priority    TEXT DEFAULT 'medium',       -- low, medium, high, critical
  status      TEXT DEFAULT 'open',         -- open, in_progress, resolved, closed
  assigned_to TEXT,                        -- agent name or user ID
  client_name TEXT,
  client_email TEXT,
  replies     JSONB DEFAULT '[]',          -- [{author, message, created_at}]
  tags        TEXT[] DEFAULT '{}',
  resolved_at TIMESTAMPTZ,
  meta        JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tickets_company ON tickets(company_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(company_id, status);

-- ============================================================================
-- 7. VENDORS
-- ============================================================================
CREATE TABLE IF NOT EXISTS vendors (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  contact_person TEXT,
  email       TEXT,
  phone       TEXT,
  type        TEXT,                        -- supplier, contractor, service_provider
  status      TEXT DEFAULT 'active',       -- active, inactive, pending
  address     JSONB DEFAULT '{}',
  monthly_spend NUMERIC DEFAULT 0,
  payment_terms TEXT,                      -- net30, net60, immediate
  notes       TEXT,
  meta        JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendors_company ON vendors(company_id);

-- ============================================================================
-- 8. INVENTORY (linked to vendors)
-- ============================================================================
CREATE TABLE IF NOT EXISTS inventory (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  vendor_id   UUID REFERENCES vendors(id) ON DELETE SET NULL,
  item_name   TEXT NOT NULL,
  category    TEXT,
  quantity    INTEGER DEFAULT 0,
  unit_cost   NUMERIC DEFAULT 0,
  sku         TEXT,
  status      TEXT DEFAULT 'in_stock',     -- in_stock, low_stock, out_of_stock
  meta        JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_company ON inventory(company_id);

-- ============================================================================
-- 9. WORKFORCE (employees + AI agents)
-- ============================================================================
CREATE TABLE IF NOT EXISTS workforce (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  email       TEXT,
  role        TEXT,
  department  TEXT,
  type        TEXT DEFAULT 'human',        -- human, ai_agent
  status      TEXT DEFAULT 'active',       -- active, idle, offline, on_leave
  performance INTEGER DEFAULT 0,           -- 0-100
  permissions TEXT[] DEFAULT '{}',         -- RBAC permissions
  hourly_rate NUMERIC DEFAULT 0,
  tasks_completed INTEGER DEFAULT 0,
  notes       TEXT,
  meta        JSONB DEFAULT '{}',
  hired_at    DATE DEFAULT CURRENT_DATE,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workforce_company ON workforce(company_id);
CREATE INDEX IF NOT EXISTS idx_workforce_department ON workforce(company_id, department);

-- ============================================================================
-- 10. CAMPAIGNS (marketing)
-- ============================================================================
CREATE TABLE IF NOT EXISTS campaigns (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  type        TEXT DEFAULT 'email',        -- email, social, seo, ppc, content
  channel     TEXT,
  status      TEXT DEFAULT 'draft',        -- draft, active, paused, completed
  description TEXT,
  budget      NUMERIC DEFAULT 0,
  spend       NUMERIC DEFAULT 0,
  leads_generated INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  open_rate   NUMERIC DEFAULT 0,
  click_rate  NUMERIC DEFAULT 0,
  start_date  DATE,
  end_date    DATE,
  content     JSONB DEFAULT '{}',          -- email body, template, etc
  audience    JSONB DEFAULT '{}',          -- targeting rules
  meta        JSONB DEFAULT '{}',
  created_by  TEXT DEFAULT 'manual',
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_company ON campaigns(company_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(company_id, status);

-- ============================================================================
-- 11. AFFILIATES
-- ============================================================================
CREATE TABLE IF NOT EXISTS affiliates (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id     UUID,
  name        TEXT NOT NULL,
  email       TEXT,
  code        TEXT NOT NULL,               -- referral code
  tier        TEXT DEFAULT 'starter',      -- starter, bronze, silver, gold, platinum, diamond
  commission_pct NUMERIC DEFAULT 10,
  clicks      INTEGER DEFAULT 0,
  signups     INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  revenue     NUMERIC DEFAULT 0,
  earned      NUMERIC DEFAULT 0,
  paid_out    NUMERIC DEFAULT 0,
  status      TEXT DEFAULT 'active',
  payout_method TEXT,
  meta        JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_affiliates_company ON affiliates(company_id);
CREATE INDEX IF NOT EXISTS idx_affiliates_code ON affiliates(code);

-- ============================================================================
-- 12. AFFILIATE PAYOUTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS affiliate_payouts (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  affiliate_id UUID NOT NULL REFERENCES affiliates(id) ON DELETE CASCADE,
  amount      NUMERIC NOT NULL,
  currency    TEXT DEFAULT 'ZAR',
  status      TEXT DEFAULT 'pending',      -- pending, paid, failed
  reference   TEXT,
  paid_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 13. GOVERNANCE PROPOSALS
-- ============================================================================
CREATE TABLE IF NOT EXISTS proposals (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT,
  status      TEXT DEFAULT 'active',       -- active, passed, failed, closed
  votes_for   INTEGER DEFAULT 0,
  votes_against INTEGER DEFAULT 0,
  proposer    TEXT,
  ends_at     TIMESTAMPTZ,
  meta        JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proposals_company ON proposals(company_id);

-- ============================================================================
-- 14. LEGAL DOCUMENTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS legal_documents (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  type        TEXT NOT NULL,               -- contract, nda, terms, privacy, sla
  content     TEXT,                        -- document body (HTML/markdown)
  version     TEXT DEFAULT '1.0',
  status      TEXT DEFAULT 'draft',        -- draft, active, archived, expired
  parties     JSONB DEFAULT '[]',          -- [{name, role}]
  value       NUMERIC,
  effective_date DATE,
  expiry_date DATE,
  signed_at   TIMESTAMPTZ,
  meta        JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_legal_docs_company ON legal_documents(company_id);

-- ============================================================================
-- 15. COMPLIANCE TRACKING
-- ============================================================================
CREATE TABLE IF NOT EXISTS compliance_status (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  framework   TEXT NOT NULL,               -- GDPR, POPIA, ISO27001, SOC2, HIPAA
  score       INTEGER DEFAULT 0,           -- 0-100
  status      TEXT DEFAULT 'in_progress',  -- compliant, in_progress, non_compliant
  last_audit  DATE,
  next_audit  DATE,
  notes       TEXT,
  meta        JSONB DEFAULT '{}',
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(company_id, framework)
);

-- ============================================================================
-- 16. DEBTS (vendor debt tracking)
-- ============================================================================
CREATE TABLE IF NOT EXISTS debts (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  vendor_id   UUID REFERENCES vendors(id) ON DELETE SET NULL,
  contact_id  UUID REFERENCES contacts(id) ON DELETE SET NULL,
  amount      NUMERIC NOT NULL,
  currency    TEXT DEFAULT 'ZAR',
  status      TEXT DEFAULT 'outstanding',  -- outstanding, paid, overdue, partial
  due_date    DATE,
  description TEXT,
  meta        JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_debts_company ON debts(company_id);

-- ============================================================================
-- 17. ACTIVITY LOG (cross-module audit trail)
-- ============================================================================
CREATE TABLE IF NOT EXISTS activity_log (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id     UUID,
  module      TEXT NOT NULL,               -- crm, invoicing, tickets, etc
  action      TEXT NOT NULL,               -- created, updated, deleted, sent, paid
  entity_type TEXT,                        -- contact, invoice, ticket, etc
  entity_id   UUID,
  description TEXT,
  meta        JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_company ON activity_log(company_id);
CREATE INDEX IF NOT EXISTS idx_activity_module ON activity_log(company_id, module);
CREATE INDEX IF NOT EXISTS idx_activity_entity ON activity_log(entity_type, entity_id);

-- ============================================================================
-- 18. AI ORCHESTRATION EVENTS (event-driven automation)
-- ============================================================================
CREATE TABLE IF NOT EXISTS orchestration_events (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL,               -- deal.closed, invoice.sent, invoice.paid, payment.failed, ticket.created
  source      TEXT,                        -- module that triggered
  entity_type TEXT,
  entity_id   UUID,
  payload     JSONB DEFAULT '{}',
  status      TEXT DEFAULT 'pending',      -- pending, processing, completed, failed
  actions     JSONB DEFAULT '[]',          -- [{action, status, result}]
  processed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orch_events_company ON orchestration_events(company_id);
CREATE INDEX IF NOT EXISTS idx_orch_events_status ON orchestration_events(status);
CREATE INDEX IF NOT EXISTS idx_orch_events_type ON orchestration_events(event_type);

-- ============================================================================
-- 19. INVOICE SEQUENCE (auto-incrementing per company)
-- ============================================================================
CREATE TABLE IF NOT EXISTS invoice_sequences (
  company_id  UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  last_number INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS quote_sequences (
  company_id  UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  last_number INTEGER DEFAULT 0
);

-- ── Function: get next invoice number ───────────────────────────────────────
CREATE OR REPLACE FUNCTION next_invoice_number(p_company_id UUID)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  v_num INTEGER;
BEGIN
  INSERT INTO invoice_sequences (company_id, last_number) VALUES (p_company_id, 1)
  ON CONFLICT (company_id) DO UPDATE SET last_number = invoice_sequences.last_number + 1
  RETURNING last_number INTO v_num;
  RETURN 'INV-' || LPAD(v_num::TEXT, 5, '0');
END;
$$;

CREATE OR REPLACE FUNCTION next_quote_number(p_company_id UUID)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  v_num INTEGER;
BEGIN
  INSERT INTO quote_sequences (company_id, last_number) VALUES (p_company_id, 1)
  ON CONFLICT (company_id) DO UPDATE SET last_number = quote_sequences.last_number + 1
  RETURNING last_number INTO v_num;
  RETURN 'QUO-' || LPAD(v_num::TEXT, 5, '0');
END;
$$;

-- ============================================================================
-- ROW LEVEL SECURITY — multi-tenant isolation
-- ============================================================================
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE workforce ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliates ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE debts ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE orchestration_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_configs ENABLE ROW LEVEL SECURITY;

-- Service role bypass (backend API uses service_role key)
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'companies','contacts','invoices','quotes','tickets','vendors','inventory',
    'workforce','campaigns','affiliates','proposals','legal_documents',
    'compliance_status','debts','activity_log','orchestration_events','payment_configs'
  ]) LOOP
    EXECUTE format('CREATE POLICY "service_role_all_%s" ON %I FOR ALL USING (true) WITH CHECK (true)', tbl, tbl);
  END LOOP;
END $$;

-- ============================================================================
-- UPDATED_AT TRIGGER (auto-update timestamp)
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'companies','contacts','invoices','quotes','tickets','vendors','inventory',
    'workforce','campaigns','affiliates','proposals','legal_documents',
    'compliance_status','debts'
  ]) LOOP
    EXECUTE format('CREATE TRIGGER trg_updated_at_%s BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at()', tbl, tbl);
  END LOOP;
END $$;

-- ============================================================================
-- SEED: Default company for Bridge AI OS
-- ============================================================================
INSERT INTO companies (id, name, slug, email, website, tax_number, industry, currency, branding, white_label)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Bridge AI OS',
  'bridge-ai-os',
  'hello@ai-os.co.za',
  'https://bridge-ai-os.com',
  'VAT4840300001',
  'Technology',
  'ZAR',
  '{"primary_color":"#38bdf8","secondary_color":"#0284c7","accent_color":"#63ffda","font":"Outfit","email_footer":"Bridge AI OS - Autonomous Business Intelligence","invoice_footer":"All amounts in South African Rand (ZAR). Payment due within 30 days. Bridge AI OS (Pty) Ltd."}'::jsonb,
  false
) ON CONFLICT (id) DO NOTHING;

-- Seed contacts
INSERT INTO contacts (company_id, name, email, company_name, status, stage, plan, value, joined_at) VALUES
('00000000-0000-0000-0000-000000000001', 'Sipho Ndlovu',     'sipho@ndlovuholdings.co.za',  'Ndlovu Holdings',    'customer', 'closed',   'pro',        149, '2026-01-15'),
('00000000-0000-0000-0000-000000000001', 'Priya Naidoo',     'priya@techbridge.io',          'TechBridge IO',      'customer', 'closed',   'enterprise', 499, '2026-01-22'),
('00000000-0000-0000-0000-000000000001', 'Thabo Mokoena',    'thabo@mokoena.co.za',          'Mokoena Consulting', 'lead',     'proposal', 'pro',        149, '2026-02-03'),
('00000000-0000-0000-0000-000000000001', 'Zoe van der Berg', 'zoe@vdberg.co.za',             'VDB Solutions',      'customer', 'closed',   'starter',     49, '2026-02-10'),
('00000000-0000-0000-0000-000000000001', 'Kwame Asante',     'kwame@asante.africa',          'Asante Africa',      'lead',     'demo',     'enterprise', 499, '2026-02-18'),
('00000000-0000-0000-0000-000000000001', 'Naledi Dlamini',   'naledi@dlaminigroup.co.za',    'Dlamini Group',      'customer', 'closed',   'pro',        149, '2026-03-01'),
('00000000-0000-0000-0000-000000000001', 'Reza Patel',       'reza@pateltech.io',            'Patel Tech',         'customer', 'closed',   'enterprise', 499, '2026-03-08'),
('00000000-0000-0000-0000-000000000001', 'Amara Osei',       'amara@oseiventures.com',       'Osei Ventures',      'lead',     'outreach', 'pro',        149, '2026-03-15'),
('00000000-0000-0000-0000-000000000001', 'Leilani Botha',    'leilani@bothadigital.co.za',   'Botha Digital',      'customer', 'closed',   'starter',     49, '2026-03-20'),
('00000000-0000-0000-0000-000000000001', 'Jabu Khumalo',     'jabu@khumalocorp.co.za',       'Khumalo Corp',       'prospect', 'identified','enterprise', 499, '2026-04-01')
ON CONFLICT DO NOTHING;

-- Seed invoices
INSERT INTO invoices (company_id, invoice_number, client_name, client_email, line_items, subtotal, tax_rate, tax_amount, total, currency, status, issued_date, due_date, created_by) VALUES
('00000000-0000-0000-0000-000000000001', 'INV-00001', 'Ndlovu Holdings',    'sipho@ndlovuholdings.co.za',  '[{"description":"Bridge AI OS Pro - March 2026","qty":1,"unit_price":149}]', 149, 15, 22.35, 171.35, 'ZAR', 'paid',  '2026-03-01', '2026-03-15', 'system'),
('00000000-0000-0000-0000-000000000001', 'INV-00002', 'TechBridge IO',       'priya@techbridge.io',          '[{"description":"Bridge AI OS Enterprise - March 2026","qty":1,"unit_price":499}]', 499, 15, 74.85, 573.85, 'ZAR', 'paid',  '2026-03-05', '2026-03-20', 'system'),
('00000000-0000-0000-0000-000000000001', 'INV-00003', 'VDB Solutions',        'zoe@vdberg.co.za',             '[{"description":"Bridge AI OS Starter - March 2026","qty":1,"unit_price":49}]', 49, 15, 7.35, 56.35, 'ZAR', 'paid',  '2026-03-10', '2026-03-25', 'system'),
('00000000-0000-0000-0000-000000000001', 'INV-00004', 'Dlamini Group',        'naledi@dlaminigroup.co.za',    '[{"description":"Bridge AI OS Pro - April 2026","qty":1,"unit_price":149}]', 149, 15, 22.35, 171.35, 'ZAR', 'paid',  '2026-03-15', '2026-04-01', 'system'),
('00000000-0000-0000-0000-000000000001', 'INV-00005', 'Patel Tech',           'reza@pateltech.io',            '[{"description":"Bridge AI OS Enterprise - April 2026","qty":1,"unit_price":499}]', 499, 15, 74.85, 573.85, 'ZAR', 'sent',  '2026-03-22', '2026-04-08', 'system'),
('00000000-0000-0000-0000-000000000001', 'INV-00006', 'Botha Digital',        'leilani@bothadigital.co.za',   '[{"description":"Bridge AI OS Starter - April 2026","qty":1,"unit_price":49}]', 49, 15, 7.35, 56.35, 'ZAR', 'sent',  '2026-04-01', '2026-04-20', 'system'),
('00000000-0000-0000-0000-000000000001', 'INV-00007', 'Mokoena Consulting',   'thabo@mokoena.co.za',          '[{"description":"Bridge AI OS Pro - Onboarding","qty":1,"unit_price":149}]', 149, 15, 22.35, 171.35, 'ZAR', 'draft', '2026-04-04', '2026-04-30', 'system'),
('00000000-0000-0000-0000-000000000001', 'INV-00008', 'Asante Africa',        'kwame@asante.africa',          '[{"description":"Bridge AI OS Enterprise - Demo","qty":1,"unit_price":499}]', 499, 15, 74.85, 573.85, 'ZAR', 'draft', '2026-04-04', '2026-05-01', 'system')
ON CONFLICT DO NOTHING;

-- Update invoice sequence
INSERT INTO invoice_sequences (company_id, last_number) VALUES ('00000000-0000-0000-0000-000000000001', 8) ON CONFLICT DO NOTHING;

-- Seed quotes
INSERT INTO quotes (company_id, quote_number, client_name, client_email, line_items, subtotal, tax_rate, tax_amount, total, currency, status, valid_until) VALUES
('00000000-0000-0000-0000-000000000001', 'QUO-00001', 'Asante Africa',     'kwame@asante.africa',   '[{"description":"Enterprise Plan","qty":1,"unit_price":499}]', 499, 15, 74.85, 573.85, 'ZAR', 'sent',     '2026-04-15'),
('00000000-0000-0000-0000-000000000001', 'QUO-00002', 'Khumalo Corp',      'jabu@khumalocorp.co.za','[{"description":"Pro Plan","qty":1,"unit_price":149}]', 149, 15, 22.35, 171.35, 'ZAR', 'draft',    '2026-04-20'),
('00000000-0000-0000-0000-000000000001', 'QUO-00003', 'Mokoena Consulting','thabo@mokoena.co.za',   '[{"description":"Pro Plan Onboarding","qty":1,"unit_price":149}]', 149, 15, 22.35, 171.35, 'ZAR', 'accepted', '2026-04-10')
ON CONFLICT DO NOTHING;

INSERT INTO quote_sequences (company_id, last_number) VALUES ('00000000-0000-0000-0000-000000000001', 3) ON CONFLICT DO NOTHING;

-- Seed tickets
INSERT INTO tickets (company_id, subject, body, priority, status, client_name, client_email, assigned_to, created_at) VALUES
('00000000-0000-0000-0000-000000000001', 'Treasury dashboard not refreshing',  'Dashboard shows stale data', 'high',   'open',        'TechBridge IO',  'priya@techbridge.io',        'alpha',   '2026-04-02T08:12:00Z'),
('00000000-0000-0000-0000-000000000001', 'How do I add team members?',          'Need help adding team',      'medium', 'resolved',    'VDB Solutions',  'zoe@vdberg.co.za',           'beta',    '2026-04-01T14:30:00Z'),
('00000000-0000-0000-0000-000000000001', 'API rate limit hit on swarm',         'Getting 429 errors',         'high',   'in_progress', 'Ndlovu Holdings','sipho@ndlovuholdings.co.za', 'gamma',   '2026-04-03T09:00:00Z'),
('00000000-0000-0000-0000-000000000001', 'Invoice PDF not generating',          'PDF button does nothing',    'medium', 'open',        'Dlamini Group',  'naledi@dlaminigroup.co.za',  NULL,      '2026-04-03T11:15:00Z'),
('00000000-0000-0000-0000-000000000001', 'Can I upgrade mid-cycle?',            'Want to upgrade plan',       'low',    'resolved',    'Botha Digital',  'leilani@bothadigital.co.za', 'delta',   '2026-03-30T10:00:00Z'),
('00000000-0000-0000-0000-000000000001', 'Leadgen pipeline stalled at nurture', 'Leads not progressing',      'high',   'open',        'Patel Tech',    'reza@pateltech.io',          'epsilon', '2026-04-04T07:30:00Z')
ON CONFLICT DO NOTHING;

-- Seed vendors
INSERT INTO vendors (company_id, name, contact_person, email, type, status, monthly_spend) VALUES
('00000000-0000-0000-0000-000000000001', 'Cloudflare',    'Support',       'support@cloudflare.com',  'service_provider', 'active', 0),
('00000000-0000-0000-0000-000000000001', 'Vercel',        'Support',       'support@vercel.com',      'service_provider', 'active', 20),
('00000000-0000-0000-0000-000000000001', 'Supabase',      'Support',       'support@supabase.com',    'service_provider', 'active', 25),
('00000000-0000-0000-0000-000000000001', 'OpenRouter',    'Support',       'support@openrouter.ai',   'service_provider', 'active', 50),
('00000000-0000-0000-0000-000000000001', 'Brevo',         'Support',       'support@brevo.com',       'service_provider', 'active', 0),
('00000000-0000-0000-0000-000000000001', 'Webway',        'Support',       'support@webway.co.za',    'service_provider', 'active', 150)
ON CONFLICT DO NOTHING;

-- Seed workforce
INSERT INTO workforce (company_id, name, role, department, type, status, performance) VALUES
('00000000-0000-0000-0000-000000000001', 'QuoteGen AI',     'Sales Agent',     'Sales',      'ai_agent', 'active', 92),
('00000000-0000-0000-0000-000000000001', 'Finance AI',      'Finance Agent',   'Finance',    'ai_agent', 'active', 88),
('00000000-0000-0000-0000-000000000001', 'Growth Hunter',   'Growth Agent',    'Marketing',  'ai_agent', 'active', 95),
('00000000-0000-0000-0000-000000000001', 'Intelligence AI', 'Intel Agent',     'Operations', 'ai_agent', 'active', 90),
('00000000-0000-0000-0000-000000000001', 'Nurture AI',      'Nurture Agent',   'Sales',      'ai_agent', 'active', 87),
('00000000-0000-0000-0000-000000000001', 'Closer AI',       'Closer Agent',    'Sales',      'ai_agent', 'active', 93),
('00000000-0000-0000-0000-000000000001', 'Campaign AI',     'Campaign Agent',  'Marketing',  'ai_agent', 'active', 85),
('00000000-0000-0000-0000-000000000001', 'Creative AI',     'Creative Agent',  'Marketing',  'ai_agent', 'active', 91),
('00000000-0000-0000-0000-000000000001', 'Support AI',      'Support Agent',   'Support',    'ai_agent', 'active', 89),
('00000000-0000-0000-0000-000000000001', 'Supply AI',       'Supply Agent',    'Operations', 'ai_agent', 'active', 86)
ON CONFLICT DO NOTHING;

-- Seed affiliates
INSERT INTO affiliates (company_id, name, email, code, tier, commission_pct, clicks, signups, revenue, earned) VALUES
('00000000-0000-0000-0000-000000000001', 'Sipho Ndlovu',  'sipho@ndlovuholdings.co.za', 'SIPHO20',  'silver', 15, 142, 12, 1788, 268.20),
('00000000-0000-0000-0000-000000000001', 'Priya Naidoo',  'priya@techbridge.io',         'PRIYA20',  'gold',   20, 289, 31, 4619, 923.80),
('00000000-0000-0000-0000-000000000001', 'Thabo Mokoena', 'thabo@mokoena.co.za',         'THABO20',  'bronze', 12, 88,  7,  1043, 125.16)
ON CONFLICT DO NOTHING;

-- Seed governance proposals
INSERT INTO proposals (company_id, title, status, votes_for, votes_against, ends_at) VALUES
('00000000-0000-0000-0000-000000000001', 'Increase UBI allocation to 25%', 'active', 142, 38, '2026-04-10'),
('00000000-0000-0000-0000-000000000001', 'Add new agent layer L4',          'passed', 201, 12, '2026-03-28'),
('00000000-0000-0000-0000-000000000001', 'Reduce founder fee to 10%',       'failed', 67, 189, '2026-03-20')
ON CONFLICT DO NOTHING;

-- Seed compliance
INSERT INTO compliance_status (company_id, framework, score, status, last_audit) VALUES
('00000000-0000-0000-0000-000000000001', 'POPIA',    85, 'compliant',   '2026-03-15'),
('00000000-0000-0000-0000-000000000001', 'GDPR',     78, 'in_progress', '2026-03-10'),
('00000000-0000-0000-0000-000000000001', 'ISO27001', 62, 'in_progress', '2026-02-28'),
('00000000-0000-0000-0000-000000000001', 'SOC2',     45, 'in_progress', '2026-02-15')
ON CONFLICT DO NOTHING;

-- Seed legal documents
INSERT INTO legal_documents (company_id, title, type, version, status, effective_date) VALUES
('00000000-0000-0000-0000-000000000001', 'Terms of Service',    'terms',   '2.1', 'active', '2026-01-01'),
('00000000-0000-0000-0000-000000000001', 'Privacy Policy',      'privacy', '2.0', 'active', '2026-01-01'),
('00000000-0000-0000-0000-000000000001', 'SLA Agreement',       'sla',     '1.0', 'active', '2026-02-01'),
('00000000-0000-0000-0000-000000000001', 'NDA Template',        'nda',     '1.0', 'active', '2026-01-15'),
('00000000-0000-0000-0000-000000000001', 'Data Processing Agreement', 'contract', '1.0', 'active', '2026-03-01')
ON CONFLICT DO NOTHING;

-- Seed campaigns
INSERT INTO campaigns (company_id, name, type, channel, status, leads_generated, conversions, open_rate, click_rate) VALUES
('00000000-0000-0000-0000-000000000001', 'Welcome Series',     'email', 'email',    'active',    45, 12, 58.2, 18.4),
('00000000-0000-0000-0000-000000000001', 'Nurture Drip',       'email', 'email',    'active',    28, 8,  42.1, 9.8),
('00000000-0000-0000-0000-000000000001', 'Re-engagement',      'email', 'email',    'active',    15, 3,  22.3, 5.1),
('00000000-0000-0000-0000-000000000001', 'Upsell Enterprise',  'email', 'email',    'active',    22, 5,  51.7, 21.0),
('00000000-0000-0000-0000-000000000001', 'LinkedIn Outreach',  'social','linkedin', 'active',    14, 4,  0,    0),
('00000000-0000-0000-0000-000000000001', 'YouTube Tutorials',  'content','youtube', 'active',     8, 2,  0,    0)
ON CONFLICT DO NOTHING;

-- Seed default PayFast payment config
INSERT INTO payment_configs (company_id, provider, is_default, config_json) VALUES
('00000000-0000-0000-0000-000000000001', 'payfast', true, '{"use_env": true}')
ON CONFLICT DO NOTHING;
