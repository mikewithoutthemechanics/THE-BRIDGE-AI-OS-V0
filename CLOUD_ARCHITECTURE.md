# Cloud Architecture: Unified Lead Generation System

## System Overview

```
┌────────────────────────────────────────────────────────────┐
│                      NOTION (Reporting)                    │
│  ┌──────────────┬─────────────────┬──────────────────────┐ │
│  │  CRM Leads   │  Secrets Vault   │  Campaigns/Analytics│ │
│  │  • Email     │  • SMTP_USER     │  • Templates        │ │
│  │  • Company   │  • SMTP_PASS     │  • Performance      │ │
│  │  • Status    │  • API_KEYS      │  • Open rates       │ │
│  │  • Score     │  • Database      │  • Click rates      │ │
│  └──────┬───────┴────────┬────────┴──────────┬───────────┘ │
└─────────┼────────────────┼──────────────────┼──────────────┘
          │ Zapier 1       │ Zapier 2         │ Zapier 3
          │ (Lead Sync)    │ (Secrets)        │ (Alerts)
          ▼                ▼                  ▼
┌────────────────────────────────────────────────────────────┐
│                  SUPABASE (Cloud Database)                 │
│  ┌──────────────┬──────────────┬─────────┬──────────────┐  │
│  │ crm_leads    │email_outreach│ osint   │secrets_vault │  │
│  │ • id (UUID)  │• id (UUID)   │registry │ • key_name   │  │
│  │ • email      │• email       │• url    │ • key_value  │  │
│  │ • company    │• company     │• industry│ • service   │  │
│  │ • status     │• template    │• company│ • status     │  │
│  │ • score      │• status      │• profile│ • updated_by │  │
│  │ • osint_prof │• campaign_id │         │              │  │
│  └──────┬───────┴──────┬───────┴────┬────┴──────────┬───┘  │
└─────────┼──────────────┼────────────┼───────────────┼──────┘
          │ HTTP API     │ Realtime   │ Service Key   │
          │ JSON/REST    │ WebSocket  │ (Admin)       │
          ▼              ▼            ▼               ▼
┌────────────────────────────────────────────────────────────┐
│            VERCEL (Serverless Functions)                   │
│            Domain: go.ai-os.co.za                          │
│  ┌──────────────┬──────────────┬──────────────────────┐   │
│  │ API Routes   │ Webhooks     │ Cron Jobs            │   │
│  │              │              │                      │   │
│  │ GET /stats   │ POST /secrets │ /api/cron/auto-send │   │
│  │ POST /leads  │ POST /tracking│ (every 60 seconds)  │   │
│  │ POST /queue  │              │                      │   │
│  │ GET /tracking│              │                      │   │
│  └──────┬───────┴──────┬───────┴──────────┬──────────┘   │
└─────────┼──────────────┼──────────────────┼──────────────┘
          │              │                  │
          ▼              ▼                  ▼
┌────────────────────────────────────────────────────────────┐
│       BREVO SMTP (Email Service)                           │
│       • Sends 5 emails per minute                          │
│       • Tracked opens/clicks                               │
│       • Optimal hours: 9am, 10am, 2pm, 3pm                │
└────────────────────────────────────────────────────────────┘
          │
          ├──────────────────────────────────────────────┐
          ▼                                              ▼
     ┌─────────┐                                   ┌─────────┐
     │ Prospect│                                   │ Tracking│
     │ Opens ✓ │                                   │ Pixels  │
     └────┬────┘                                   └────┬────┘
          │                                             │
          └─────────────────────┬───────────────────────┘
                                ▼
                    Updates Supabase → Notion
                    (Score +5 for open, +10 for click)
```

---

## Data Flow: Complete Journey

### 1. Lead Discovery (Python Backend)
```
DuckDuckGo search
    ↓
Scrape companies
    ↓
Extract emails + OSINT
    ↓
POST https://go.ai-os.co.za/api/crm/leads {
  email: "contact@company.com",
  company: "Company Name",
  osint_profile: {
    industry: "technology",
    size: "startup",
    template_type: "tech_founder"
  }
}
```

### 2. Database Persistence (Supabase)
```
Vercel receives request
    ↓
Write to crm_leads table
    ↓
Realtime notification to Zapier
    ↓
Zapier creates Notion entry
    ↓
User sees lead in Notion dashboard
```

### 3. Email Queueing
```
POST /api/outreach/queue {
  email: "contact@company.com",
  company: "Company Name",
  template_type: "tech_founder"
}
    ↓
Inserted into email_outreach table
    ↓
Status: "queued"
    ↓
Waiting for auto-send cron
```

### 4. Automated Sending (Cron Job)
```
Every 60 seconds (if 9am, 10am, 2pm, or 3pm):
    ↓
GET /api/cron/auto-send
    ↓
Read SMTP credentials from secrets_vault
    ↓
Fetch 5 queued emails
    ↓
For each email:
  1. Generate template (executive/tech_founder/etc)
  2. Add tracking pixel: <img src="go.ai-os.co.za/pixel/{id}">
  3. Send via Brevo
  4. Record in email_sent table
  5. Update status to "sent"
    ↓
Update Notion dashboard
    ↓
Wait 60 seconds, repeat
```

### 5. Response Tracking
```
Recipient opens email
    ↓
Browser fetches tracking pixel
    ↓
GET /api/tracking/pixel/{sent_id}
    ↓
Record open in email_opens table
    ↓
Update crm_leads.score += 5
    ↓
Auto-qualify if score >= 30
    ↓
Notion dashboard updates in real-time
```

---

## Secrets Management: Dynamic Updates

### Current Flow (Notion → Supabase)
```
1. Update secret in Notion
   Status: active → rotating
   ↓
2. Zapier webhook triggered
   ↓
3. POST https://go.ai-os.co.za/api/webhook/secrets-sync {
     keyName: "SMTP_PASS",
     keyValue: "new-secret-xyz",
     service: "SMTP",
     updatedBy: "notion"
   }
   ↓
4. Vercel updates Supabase secrets_vault table
   ↓
5. Vercel clears in-memory cache
   ↓
6. Next cron job (within 60 sec) reads new secret
   ↓
7. SMTP uses new credential
   ↓
8. Update Notion status: rotating → active
```

### Environment Variables in Vercel
- Deployed via Vercel Dashboard → Settings → Environment Variables
- Encrypted at rest
- Injected at build/runtime
- Can reference Supabase values:
  ```json
  {
    "SMTP_USER": "@smtp_user",
    "SMTP_PASS": "@smtp_pass"
  }
  ```

### Fallback Strategy
If Supabase is unavailable:
1. Application reads environment variable from Vercel
2. No tracking/scoring (reads-only fail gracefully)
3. Emails still send (using env vars)
4. Reconnects to Supabase next cycle

---

## API Endpoints (Deployed to Vercel)

### CRM Endpoints
```
GET /api/crm/stats
  Response: {
    total_leads: 45,
    by_status: { prospect: 30, qualified: 10, deal: 3, won: 2 },
    avg_lead_score: 18,
    recent_7_days: 5
  }

GET /api/crm/leads?status=prospect&limit=10
  Response: [{ id, email, company, status, score, created_at }, ...]

POST /api/crm/leads
  Body: { email, company, osint_profile, source }
  Response: { id, status, score }

PATCH /api/crm/leads/{id}/status
  Body: { status: "qualified" }
  Response: { id, status, updated_at }
```

### Outreach Endpoints
```
POST /api/outreach/queue
  Body: { email, company, template_type, campaign_id }
  Response: { id, status: "queued" }

GET /api/outreach/stats
  Response: { queued, sent, opened, followups }

GET /api/tracking/pixel/{sent_id}
  Response: 1x1 transparent GIF (+ records open)

GET /api/tracking/click/{sent_id}?url=...
  Response: Redirect to URL (+ records click)
```

### Webhooks
```
POST /api/webhook/secrets-sync
  Body: { keyName, keyValue, service, updatedBy }
  Response: { success, message }
  (Called by Zapier when Notion secret updated)
```

### Cron Jobs
```
GET /api/cron/auto-send
  Headers: x-vercel-cron-secret: xxx
  Response: { success, hour, sent, errors }
  (Called automatically every 60 seconds by Vercel)
```

---

## Reliability & Redundancy

### Database Redundancy
- Supabase: Automatic backups, Point-in-time recovery
- Local SQLite: Exported to CSV weekly
- Notion: Acts as reporting snapshot + audit trail

### API Redundancy
- Vercel: Automatic edge deployment across 70+ regions
- Multiple availability zones
- Automatic retries on transient failures

### Email Redundancy
- Brevo: 99.9% uptime SLA
- Retry logic: Failed sends queued for next cycle
- Fallback: Email stuck in "queued" until sent

### Secret Redundancy
- Primary: Supabase secrets_vault
- Fallback: Vercel environment variables
- Audit: Notion maintains history of all changes

---

## Monitoring & Alerts

### Vercel Monitoring
```
Dashboard → Monitoring:
  - Function execution time
  - Error rates
  - Log stream
  - Cron job history
```

### Supabase Monitoring
```
Dashboard → Monitoring:
  - API request metrics
  - Database performance
  - Realtime connections
  - Storage usage
```

### Zapier Monitoring
```
Each Zap has:
  - Execution history
  - Error details
  - Retry attempts
  - Task usage
```

### Custom Alerts (via Slack)
```
Zapier automation:
  IF Vercel cron fails
  THEN send Slack message: ⚠️ Auto-send failed

Zapier automation:
  IF secret.status = "rotating"
  THEN send Slack message: 🔄 Secret rotating: {name}
```

---

## Cost Breakdown

### Monthly Estimate
```
Supabase (PostgreSQL)
  - 50MB storage: $0
  - 2M API calls: $0 (free tier)
  - Total: ~$25/month (Pro plan for RLS)

Vercel (Serverless Functions + Cron)
  - 100 function executions/hour: $0 (free tier)
  - Cron jobs: Included
  - Custom domain: $0
  - Total: ~$20/month (Pro plan for monitoring)

Zapier
  - 3 zaps @ 100 tasks/month: ~$25/month

Brevo SMTP
  - 5 emails/minute = 3.6K/day = 108K/month
  - Free up to 300/day
  - Pro plan: ~$20/month

Notion
  - Team workspace: $0-$120/month (depending on plan)

TOTAL: ~$90-140/month
```

---

## Security

### Authentication
- Supabase Service Role Key: Server-side only
- Supabase Anon Key: Public (restricted via RLS)
- Vercel Cron Secret: In HTTP header
- Zapier Webhook Secret: In signature header

### Encryption
- Supabase: TLS in transit, encrypted at rest
- Vercel: Encrypted environment variables
- Notion: Notion-managed encryption
- Secrets Vault: Marked as encrypted (application-level)

### Access Control
- RLS policies on Supabase tables
- Zapier zaps are account-restricted
- Vercel functions are URL-public (but require cron secret)
- Notion workspace: Invite-only access

---

## Disaster Recovery

### Backup Strategy
1. **Supabase:** Automated daily backups
2. **Notion:** Exported to CSV monthly
3. **Git:** All code in GitHub (auto-deployed to Vercel)
4. **SQLite Local:** Keep as reference, sync to Supabase weekly

### Recovery RTO/RPO
```
RTO (Recovery Time Objective):
  - Supabase: < 1 hour (from backup)
  - Vercel: < 5 min (redeploy)
  - Notion: < 30 min (manual restore)

RPO (Recovery Point Objective):
  - Supabase: < 24 hours (daily backup)
  - Notion: < 1 month (monthly export)
  - API logs: < 30 days (Vercel logs)
```

### Failover Procedure
```
IF Supabase unavailable:
  1. Switch API to read from SQLite (local fallback)
  2. Queue writes to Notion
  3. Manually sync from Notion back to Supabase when restored

IF Vercel unavailable:
  1. Re-deploy to Vercel (< 5 min)
  2. Or temporarily point DNS to backup server

IF Zapier unavailable:
  1. Manually sync from Supabase to Notion
  2. Create new Zapier zaps
```

---

## Future Enhancements

1. **Multi-tenant support:** Add `organization_id` to all tables
2. **Custom templates:** Store in Notion, render dynamically
3. **A/B testing:** Split campaigns, track variant performance
4. **Lead scoring models:** ML-based instead of fixed weights
5. **Integration marketplace:** Slack, HubSpot, Salesforce connectors
6. **Compliance:** GDPR/CCPA audit trails, data retention policies
7. **Reporting API:** Public BI dashboard (Metabase/Tableau)
8. **Multi-channel:** SMS, LinkedIn, Twitter outreach
