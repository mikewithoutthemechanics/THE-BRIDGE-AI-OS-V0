-- =============================================================================
-- BRIDGE AI OS — CRM & Invoicing Enhancements
-- Migration: 20260412000000_crm_invoicing_enhancements
--
-- Adds:
--   crm_stats_view          — aggregated CRM metrics per company
--   invoice_stats_view      — aggregated invoice metrics per company
--   marketplace_bids        — agent bidding on marketplace tasks
--   ticket_comments         — conversation threads per ticket
--   user_settings           — per-user preferences
--   newsletter_subscriptions — email subscription tracking
-- =============================================================================

-- CRM stats view (for /api/crm/stats endpoint)
CREATE OR REPLACE VIEW crm_stats_view AS
SELECT
  company_id,
  COUNT(*) AS total_contacts,
  COUNT(*) FILTER (WHERE status = 'customer') AS customers,
  COUNT(*) FILTER (WHERE status IN ('lead', 'prospect', 'qualified')) AS leads,
  COUNT(*) FILTER (WHERE status = 'prospect') AS prospects,
  COALESCE(SUM(value) FILTER (WHERE status = 'customer'), 0) AS mrr,
  COALESCE(SUM(value) FILTER (WHERE status != 'customer'), 0) AS pipeline_value,
  CASE WHEN COUNT(*) FILTER (WHERE status = 'customer') > 0
    THEN ROUND(SUM(value) FILTER (WHERE status = 'customer') / COUNT(*) FILTER (WHERE status = 'customer'), 2)
    ELSE 0 END AS avg_deal_value
FROM contacts
GROUP BY company_id;

-- Invoice stats view (for /api/invoices/stats endpoint)
CREATE OR REPLACE VIEW invoice_stats_view AS
SELECT
  company_id,
  COUNT(*) AS total_invoices,
  COALESCE(SUM(total) FILTER (WHERE status = 'paid'), 0) AS total_paid,
  COALESCE(SUM(total), 0) AS total_billed,
  COUNT(*) FILTER (WHERE status = 'draft') AS draft_count,
  COUNT(*) FILTER (WHERE status = 'sent') AS sent_count,
  COUNT(*) FILTER (WHERE status = 'paid') AS paid_count,
  COUNT(*) FILTER (WHERE status = 'overdue') AS overdue_count,
  COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled_count,
  COALESCE(SUM(total) FILTER (WHERE status IN ('sent', 'overdue')), 0) AS outstanding_value
FROM invoices
GROUP BY company_id;

-- Marketplace bids (agent bidding on tasks)
CREATE TABLE IF NOT EXISTS marketplace_bids (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES marketplace_tasks(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL,
  bid_amount NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'completed')),
  result JSONB,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_marketplace_bids_task ON marketplace_bids(task_id);

-- Ticket comments (conversation thread per ticket)
CREATE TABLE IF NOT EXISTS ticket_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  author_id TEXT,
  author_type TEXT DEFAULT 'user' CHECK (author_type IN ('user', 'agent', 'admin')),
  body TEXT NOT NULL,
  attachments JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket ON ticket_comments(ticket_id);

-- User settings table (for settings page)
CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  theme TEXT DEFAULT 'dark',
  notifications JSONB DEFAULT '{"email": true, "push": false, "digest": true}',
  api_base TEXT,
  preferences JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Newsletter subscriptions
CREATE TABLE IF NOT EXISTS newsletter_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL UNIQUE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  subscribed_at TIMESTAMPTZ DEFAULT now(),
  unsubscribed_at TIMESTAMPTZ
);
