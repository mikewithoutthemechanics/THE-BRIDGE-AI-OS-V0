# Cloud Infrastructure Setup (Supabase + Zapier + Vercel + Notion)

## Step 1: Supabase Setup (5 min)

### A. Create Free Supabase Project
1. Go to https://supabase.com
2. Sign up with GitHub / Google
3. Create new project: `bridge-ai-leadgen`
4. Wait 2 min for DB to initialize
5. Copy these from Settings → API:
   - **Project URL** (looks like `https://xxxxx.supabase.co`)
   - **Anon Key** (public, safe to share)
   - **Service Role Key** (keep secret, for server-side)

### B. Create Tables in Supabase (SQL)
Go to **SQL Editor** in Supabase dashboard and run:

```sql
-- CRM Leads
CREATE TABLE crm_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  company TEXT,
  status TEXT DEFAULT 'prospect',
  score INTEGER DEFAULT 0,
  source TEXT DEFAULT 'scraper',
  osint_profile JSONB,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- Email Outreach
CREATE TABLE email_outreach (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  company TEXT,
  template_type TEXT DEFAULT 'general',
  status TEXT DEFAULT 'queued',
  campaign_id TEXT,
  created_at TIMESTAMP DEFAULT now()
);

-- Email Sent
CREATE TABLE email_sent (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outreach_id UUID REFERENCES email_outreach(id),
  email TEXT NOT NULL,
  subject TEXT,
  template_type TEXT,
  sent_at TIMESTAMP DEFAULT now()
);

-- OSINT Registry
CREATE TABLE osint_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id TEXT,
  url TEXT,
  company_name TEXT,
  industry TEXT,
  size_estimate TEXT,
  template_type TEXT,
  profile_confidence REAL,
  full_profile JSONB,
  created_at TIMESTAMP DEFAULT now()
);

-- Secrets Vault (encrypted in Notion, synced here)
CREATE TABLE secrets_vault (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_name TEXT UNIQUE NOT NULL,
  key_value TEXT NOT NULL ENCRYPTED,
  service TEXT,
  last_updated TIMESTAMP DEFAULT now(),
  updated_by TEXT
);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE crm_leads;
ALTER PUBLICATION supabase_realtime ADD TABLE email_outreach;
ALTER PUBLICATION supabase_realtime ADD TABLE email_sent;
ALTER PUBLICATION supabase_realtime ADD TABLE osint_registry;
```

---

## Step 2: Notion Database Setup (10 min)

### A. Create Main CRM Database
Create a new Notion database with these properties:
- **Email** (Text)
- **Company** (Text)
- **Status** (Select: prospect, qualified, deal, won)
- **Score** (Number)
- **Industry** (Text)
- **Last Contact** (Date)
- **Template Used** (Select)
- **Synced to Supabase** (Checkbox)

### B. Create Secrets Vault Database
Create another Notion database:
- **Key Name** (Text) — SMTP_USER, SMTP_PASS, API_KEY, etc.
- **Service** (Select: SMTP, Email, Database, API)
- **Value** (Text) — masked in UI
- **Last Updated** (Date)
- **Status** (Select: active, rotating, revoked)
- **Supabase ID** (Text) — links to secrets_vault table

### C. Create Campaigns Database
- **Campaign Name** (Text)
- **Template Type** (Select: executive, tech_founder, marketing_pro, etc.)
- **Target Count** (Number)
- **Sent** (Number)
- **Opens** (Number)
- **Clicks** (Number)
- **Status** (Select: draft, active, completed)

### D. Create Analytics View
Rollup/Summary page showing:
- Total leads: COUNT(Email)
- By status: Filter by Status
- Avg score: AVG(Score)
- Recent activities: Last 7 days

---

## Step 3: Connect Supabase → Notion (Zapier)

### Create Zapier Automation
1. Go to https://zapier.com
2. Create new Zap: **Supabase → Notion**
3. **Trigger:** "New row in crm_leads table"
4. **Action:** "Create database item in Notion"
5. Map fields:
   - Supabase `email` → Notion `Email`
   - Supabase `company` → Notion `Company`
   - Supabase `status` → Notion `Status`
   - Supabase `score` → Notion `Score`

### Create Reverse Sync (Notion → Supabase)
1. Create new Zap: **Notion → Supabase**
2. **Trigger:** "Database item created/updated in Notion"
3. **Action:** "Insert/update row in Supabase"
4. Only sync **Secrets Vault** table (for secret rotation)

---

## Step 4: Secrets Vault Pattern

### Notion Secret Management
1. Open Notion "Secrets Vault" database
2. Add new entry:
   - **Key Name:** `SMTP_USER`
   - **Service:** `SMTP`
   - **Value:** `7ff187001@smtp-brevo.com`
   - **Status:** `active`

3. Zapier watches for changes → updates Supabase `secrets_vault` table
4. Application polls Supabase every 5 min for updated secrets
5. Change `Status` to `rotating` to trigger credential refresh

### Application Code (Node.js)
```javascript
const supabase = require('@supabase/supabase-js').createClient(SUPABASE_URL, SUPABASE_KEY);

async function getSecret(keyName) {
  const { data } = await supabase
    .from('secrets_vault')
    .select('key_value')
    .eq('key_name', keyName)
    .single();
  return data?.key_value;
}

// Use in SMTP config
const SMTP_USER = await getSecret('SMTP_USER');
const SMTP_PASS = await getSecret('SMTP_PASS');
```

---

## Step 5: Deploy to Vercel (5 min)

### A. Connect GitHub
1. Push code to GitHub: `git push origin main`
2. Go to https://vercel.com
3. Import project from GitHub

### B. Set Environment Variables
In Vercel dashboard → Settings → Environment Variables:
```
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJxxxxxx
SUPABASE_SERVICE_KEY=eyJxxxxxx
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=[will load from Supabase secrets_vault]
SMTP_PASS=[will load from Supabase secrets_vault]
```

### C. Deploy
- Connect domain `go.ai-os.co.za`
- Set DNS to Vercel nameservers
- Enable auto-deploy on git push

### D. Set Up Cron Jobs (Serverless)
Create `api/cron/auto-send.js`:
```javascript
export default async function handler(req, res) {
  if (req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Trigger auto-send batch from Supabase
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data } = await supabase
    .from('email_outreach')
    .select('*')
    .eq('status', 'queued')
    .limit(5);

  // Send emails via Brevo
  for (const item of data) {
    await sendEmail(item);
  }

  res.json({ sent: data.length });
}
```

Set up Vercel Cron: **Every 60 seconds**
```
https://go.ai-os.co.za/api/cron/auto-send?token=xxx
```

---

## Step 6: Real-Time Updates (WebSocket)

### Supabase Realtime in Frontend
```javascript
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Subscribe to lead changes
const subscription = supabase
  .from('crm_leads')
  .on('*', (payload) => {
    console.log('Lead updated:', payload.new);
    updateNotionDatabase(payload.new);
  })
  .subscribe();
```

---

## Final Architecture

```
┌─────────────────────────────────────────────────────┐
│           NOTION (Reporting + Secrets)              │
│  ┌─────────────┬──────────────┬──────────────────┐  │
│  │  CRM Leads  │ Secrets Vault│ Campaigns/Stats  │  │
│  └──────┬──────┴──────┬───────┴──────────┬───────┘  │
└────────┼──────────────┼──────────────────┼──────────┘
         │ Zapier Sync  │ Zapier Watch     │
         ▼              ▼                  ▼
┌─────────────────────────────────────────────────────┐
│        SUPABASE (Cloud PostgreSQL)                  │
│  ┌──────────┬─────────────┬─────────┬──────────┐   │
│  │ CRM Leads│ Email Queue │ OSINT   │ Secrets  │   │
│  └────┬─────┴──────┬──────┴────┬────┴────┬─────┘   │
└───────┼────────────┼───────────┼────────┼──────────┘
        │ Realtime   │ API       │        │
        ▼            ▼           ▼        ▼
┌─────────────────────────────────────────────────────┐
│      VERCEL (Serverless App)                        │
│  ┌──────────────────────────────────────────────┐  │
│  │  API Routes + Cron Jobs (auto-send)          │  │
│  │  - GET  /api/crm/stats                       │  │
│  │  - POST /api/outreach/queue                  │  │
│  │  - GET  /api/cron/auto-send (every 60s)      │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘

Flow:
1. Python scraper finds lead → POST to Vercel API
2. Vercel saves to Supabase
3. Supabase triggers Zapier → creates Notion entry
4. User edits Notion secret → Zapier syncs to Supabase
5. Vercel cron reads secrets from Supabase every 5 min
6. Auto-send emails during optimal hours (9am-3pm)
7. Track opens/clicks → update Supabase → Notion dashboard
```

---

## Next Steps

1. **Create Supabase project** → send me Project URL + Anon Key
2. **Create Notion databases** → send me Notion workspace URL
3. **Create Zapier zaps** → connect Supabase ↔ Notion
4. **Update Python backend** → point to Vercel instead of localhost:3000
5. **Deploy to Vercel** → connect domain go.ai-os.co.za

Ready?
