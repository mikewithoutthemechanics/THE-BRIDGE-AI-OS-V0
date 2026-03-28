-- Lead Generation, CRM, OSINT, and Email Outreach tables
-- Merges: Python backend (agents/tasks/ledger/telemetry/registry)
--         CRM (leads/interactions/campaigns)
--         LeadGenX (outreach/sent/opens/followups)

-- ===== AGENTS & TASKS (from Python backend) =====
CREATE TABLE IF NOT EXISTS lg_agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'leadgen',
  status TEXT DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lg_tasks (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES lg_agents(id),
  payload TEXT,
  status TEXT DEFAULT 'pending',
  result TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lg_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT,
  agent_id TEXT,
  amount REAL,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lg_telemetry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT,
  event TEXT,
  data TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ===== CRM (leads + interactions + campaigns) =====
CREATE TABLE IF NOT EXISTS crm_leads (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  company TEXT,
  status TEXT DEFAULT 'prospect',
  score INTEGER DEFAULT 0,
  source TEXT DEFAULT 'scraper',
  osint_profile TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS crm_interactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id TEXT REFERENCES crm_leads(id),
  type TEXT NOT NULL,
  metadata TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS crm_campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  template_type TEXT DEFAULT 'general',
  status TEXT DEFAULT 'draft',
  target_count INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ===== OUTREACH (email engine) =====
CREATE TABLE IF NOT EXISTS email_outreach (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  company TEXT,
  template_type TEXT DEFAULT 'general',
  status TEXT DEFAULT 'queued',
  campaign_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS email_sent (
  id TEXT PRIMARY KEY,
  outreach_id TEXT REFERENCES email_outreach(id),
  email TEXT NOT NULL,
  subject TEXT,
  template_type TEXT,
  sent_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS email_opens (
  id TEXT PRIMARY KEY,
  sent_id TEXT REFERENCES email_sent(id),
  opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  ip TEXT,
  user_agent TEXT
);

CREATE TABLE IF NOT EXISTS email_clicks (
  id TEXT PRIMARY KEY,
  sent_id TEXT REFERENCES email_sent(id),
  url TEXT,
  clicked_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS email_followups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sent_id TEXT REFERENCES email_sent(id),
  followup_number INTEGER DEFAULT 1,
  sent_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ===== OSINT REGISTRY (scraped company profiles) =====
CREATE TABLE IF NOT EXISTS osint_registry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT,
  url TEXT,
  title TEXT,
  emails TEXT,
  company_name TEXT,
  industry TEXT,
  size_estimate TEXT,
  template_type TEXT,
  profile_confidence REAL,
  full_profile TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ===== INDEXES =====
CREATE INDEX IF NOT EXISTS idx_lg_tasks_status ON lg_tasks(status);
CREATE INDEX IF NOT EXISTS idx_lg_tasks_agent ON lg_tasks(agent_id);
CREATE INDEX IF NOT EXISTS idx_crm_leads_status ON crm_leads(status);
CREATE INDEX IF NOT EXISTS idx_crm_leads_email ON crm_leads(email);
CREATE INDEX IF NOT EXISTS idx_email_outreach_status ON email_outreach(status);
CREATE INDEX IF NOT EXISTS idx_osint_registry_industry ON osint_registry(industry);
