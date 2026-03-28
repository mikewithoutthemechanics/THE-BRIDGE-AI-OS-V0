# Cloud Infrastructure Deployment Checklist

## Phase 1: Supabase Setup ✓

- [ ] Create Supabase account (https://supabase.com)
- [ ] Create new project: `bridge-ai-leadgen`
- [ ] Run SQL migration (see CLOUD_SETUP.md)
- [ ] Copy credentials:
  - [ ] Project URL: `https://xxxxx.supabase.co`
  - [ ] Anon Key: `eyJxxx`
  - [ ] Service Role Key: `eyJxxx`

## Phase 2: Notion Setup ✓

- [ ] Create Notion workspace (or use existing)
- [ ] Create "CRM Leads" database with properties:
  - [ ] Email (Text)
  - [ ] Company (Text)
  - [ ] Status (Select: prospect, qualified, deal, won)
  - [ ] Score (Number)
  - [ ] Industry (Text)
  - [ ] Template Used (Text)

- [ ] Create "Secrets Vault" database:
  - [ ] Key Name (Text) — UNIQUE
  - [ ] Service (Select: SMTP, API, Database)
  - [ ] Value (Text)
  - [ ] Status (Select: active, rotating, revoked)
  - [ ] Last Updated (Date)

- [ ] Add initial secrets:
  - [ ] SMTP_HOST = `smtp-relay.brevo.com`
  - [ ] SMTP_PORT = `587`
  - [ ] SMTP_USER = `7ff187001@smtp-brevo.com`
  - [ ] SMTP_PASS = `xkeysib-xxx` (from .env.unified)
  - [ ] SMTP_FROM = `admin@ai-os.co.za`
  - [ ] SMTP_FROM_NAME = `BRIDGE AI OS`

- [ ] Create "Analytics" page (rollup view)
  - [ ] Total Leads: COUNT(Email)
  - [ ] By Status: Filter views
  - [ ] Avg Score: AVG(Score)

## Phase 3: Zapier Automation ✓

- [ ] Create Zapier account (https://zapier.com)

### Zap 1: Supabase → Notion (Lead Sync)
- [ ] Trigger: "New row in crm_leads table" (Supabase)
- [ ] Action: "Create database item in Notion"
- [ ] Map fields:
  - [ ] `email` → Email
  - [ ] `company` → Company
  - [ ] `status` → Status
  - [ ] `score` → Score
  - [ ] `source` → Source
  - [ ] `created_at` → Created

### Zap 2: Notion → Supabase (Secrets Sync)
- [ ] Trigger: "Database item created/updated" (Notion - Secrets Vault)
- [ ] Action: "Webhook POST" → `https://go.ai-os.co.za/api/webhook/secrets-sync`
- [ ] Body (JSON):
```json
{
  "keyName": "{Key Name}",
  "keyValue": "{Value}",
  "service": "{Service}",
  "updatedBy": "notion"
}
```

### Zap 3: Notion → Slack (Alert on Secret Rotation)
- [ ] Trigger: "Database item updated" (Notion - Secrets Vault)
- [ ] Condition: Status changes to "rotating"
- [ ] Action: "Send message to Slack"
- [ ] Message: "⚠️ Secret rotating: {Key Name} in {Service}"

## Phase 4: Vercel Setup ✓

- [ ] Create Vercel account (https://vercel.com)
- [ ] Connect GitHub repository
- [ ] Set environment variables (Dashboard → Settings → Environment Variables):
```
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJxxx
SUPABASE_SERVICE_KEY=eyJxxx
ZAPIER_WEBHOOK_SECRET=webhook-secret-xxx
VERCEL_CRON_SECRET=cron-secret-xxx
```

- [ ] Configure domain: `go.ai-os.co.za`
  - [ ] Add to Vercel domain settings
  - [ ] Update DNS to Vercel nameservers
  - [ ] Or add CNAME: `cname-to-vercel.vercel-dns.com`

- [ ] Enable auto-deployment on git push
- [ ] Test endpoints:
  - [ ] `https://go.ai-os.co.za/` (health check)
  - [ ] `https://go.ai-os.co.za/api/crm/stats`
  - [ ] `https://go.ai-os.co.za/api/cron/auto-send` (manual trigger, will fail without valid cron secret)

## Phase 5: Database Migration ✓

- [ ] Export data from local SQLite (`users.db`)
  ```bash
  # Run migration script to export to CSV
  node scripts/export-to-supabase.js
  ```

- [ ] Import into Supabase
  - [ ] Create new records via API or Zapier
  - [ ] Verify data integrity

## Phase 6: Python Backend Update ✓

- [ ] Update `workers.py` to use Vercel URL instead of localhost
  ```python
  UNIFIED_URL = "https://go.ai-os.co.za"
  ```

- [ ] Update endpoints:
  - [ ] POST `https://go.ai-os.co.za/api/crm/leads`
  - [ ] POST `https://go.ai-os.co.za/api/outreach/queue`
  - [ ] POST `https://go.ai-os.co.za/api/osint/register`

- [ ] Test scraping pipeline end-to-end

## Phase 7: Monitoring & Alerts ✓

- [ ] Set up Vercel function logs monitoring
- [ ] Create Slack channel for alerts
- [ ] Monitor auto-send cron job:
  - [ ] Check `https://go.ai-os.co.za/api/cron/auto-send` (manual)
  - [ ] View Vercel dashboard → Crons section
  - [ ] Set up Slack notification on failures

- [ ] Monitor Supabase:
  - [ ] Database → Monitoring tab
  - [ ] Check query performance
  - [ ] Monitor API requests

## Phase 8: Security Hardening ✓

- [ ] Enable Supabase Row Level Security (RLS)
  ```sql
  ALTER TABLE crm_leads ENABLE ROW LEVEL SECURITY;
  ALTER TABLE secrets_vault ENABLE ROW LEVEL SECURITY;
  ```

- [ ] Create Supabase policies:
  ```sql
  -- Only authenticated users can see their leads
  CREATE POLICY "Users can view own leads" ON crm_leads
    FOR SELECT USING (auth.uid() = user_id);

  -- Only admins can access secrets
  CREATE POLICY "Admins only secrets" ON secrets_vault
    FOR ALL USING (auth.jwt() ->> 'role' = 'admin');
  ```

- [ ] Rotate Zapier webhook secret every 90 days
- [ ] Rotate SMTP credentials every 180 days
- [ ] Monitor Vercel IP allowlist (if needed)

## Phase 9: Testing & Validation ✓

- [ ] Test lead creation flow:
  1. Python scraper → Vercel API
  2. Vercel writes to Supabase
  3. Supabase triggers Zapier
  4. Zapier creates Notion entry

- [ ] Test secret rotation:
  1. Update secret in Notion
  2. Zapier syncs to Supabase
  3. Vercel reads updated secret (within 5 min cache)
  4. SMTP uses new credential

- [ ] Test email sending:
  1. Queue email via `POST /api/outreach/queue`
  2. Wait for next minute boundary
  3. Cron job sends during optimal hour (9am-3pm)
  4. Verify in SendGrid/Brevo logs

- [ ] Test tracking:
  1. Email sent with tracking pixel
  2. Recipient opens email
  3. Pixel triggers `GET /api/tracking/pixel/xxx`
  4. Supabase records open
  5. Notion dashboard updates

## Phase 10: Documentation ✓

- [ ] Document API endpoints in Notion
- [ ] Create Notion guide for secret management
- [ ] Create runbook for troubleshooting
- [ ] Document Zapier zap configurations

---

## Quick Verification Commands

```bash
# 1. Check Supabase connection
curl -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  https://xxxxx.supabase.co/rest/v1/crm_leads?limit=1

# 2. Check Vercel deployment
curl https://go.ai-os.co.za/api/crm/stats

# 3. Verify secrets in Supabase
curl -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
  https://xxxxx.supabase.co/rest/v1/secrets_vault?select=key_name,service

# 4. Test cron (requires VERCEL_CRON_SECRET header)
curl -H "x-vercel-cron-secret: $VERCEL_CRON_SECRET" \
  https://go.ai-os.co.za/api/cron/auto-send
```

---

## Timeline

- **Supabase Setup:** 5 min
- **Notion Setup:** 10 min
- **Zapier Automation:** 15 min
- **Vercel Deployment:** 10 min
- **Testing & Validation:** 30 min
- **Total:** ~70 minutes

---

## Support

- Supabase Docs: https://supabase.com/docs
- Zapier Help: https://zapier.com/help
- Vercel Docs: https://vercel.com/docs
- Notion API: https://developers.notion.com
