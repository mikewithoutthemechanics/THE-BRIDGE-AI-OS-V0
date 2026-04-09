# OSINT INTEGRATION PLAN — Bridge AI OS
**Date:** 2026-04-09 | **Status:** Ready to Execute  
**Scope:** Fully functional OSINT module merged into the existing intelligence, CRM, and revenue stack

---

## 0. EXECUTIVE SUMMARY

This plan wires a production-grade OSINT engine into the existing Bridge AI OS infrastructure.
The `leadgen-engine.js` already declares `/api/osint/*` routes and an `osint_profile` column in `crm_leads`
but both are empty stubs. This plan fills them with real intelligence gathering, enrichment pipelines,
automated alerting, and a **sellable OSINT-as-a-Service** tier.

**Net result:**
- Every CRM lead automatically gains a full intelligence dossier
- Operators can sell OSINT reports through the existing PayFast/BRDG payment stack
- Intelligence data compounds the affiliate + marketplace revenue flywheel
- Competitive monitoring creates recurring subscription value

---

## 1. WHAT ALREADY EXISTS (LEVERAGE POINTS)

| Asset | Location | How OSINT plugs in |
|-------|----------|--------------------|
| `osint_profile` JSON column | `crm_leads` in `users.db` | Store enriched profile blob per lead |
| `/api/osint/*` route prefix | `leadgen-engine.js:134` | Mount all OSINT handlers here |
| Lead scoring engine | `leadgen-engine.js:131` | OSINT signals boost score (+15 verified email, +20 LinkedIn found) |
| Email outreach | `leadgen-engine.js:294+` | Use OSINT-discovered contacts for targeted campaigns |
| Affiliate engine | `lib/affiliate-engine.js` | Inject OSINT tool affiliate links (Shodan, Hunter, etc.) |
| PayFast payments | `lib/payfast.js` | Gate premium OSINT reports behind payment |
| BRDG token | `lib/brdg-chain.js` | Token-gate deep OSINT queries for holders |
| AP2 marketplace | `lib/ap2/` | List OSINT tasks on agent marketplace |
| Notion sync | `lib/notion-sync.js` | Push intelligence reports to client Notion workspaces |
| LLM client | `lib/llm-client.js` | Summarize/analyze raw OSINT data with Claude |
| Nurture engine | `lib/nurture-engine.js` | Trigger nurture sequences from OSINT signals |

---

## 2. FILES TO CREATE

### 2A. Core Engine
```
lib/osint-engine.js          — Central OSINT orchestrator (all gatherers unified)
lib/osint-domain.js          — Domain intelligence (WHOIS, DNS, SSL, subdomain enum)
lib/osint-social.js          — Social footprint (LinkedIn, Twitter/X, GitHub)
lib/osint-company.js         — Company enrichment (Clearbit-style, free-first)
lib/osint-email.js           — Email discovery + verification (Hunter.io free tier)
lib/osint-threat.js          — Threat/exposure scanning (Shodan, HaveIBeenPwned)
lib/osint-news.js            — News monitoring + RSS aggregation
lib/osint-competitive.js     — Competitor tech stack + pricing intelligence
lib/osint-alerts.js          — Change-detection + alert dispatch
lib/osint-report.js          — Report generator (HTML/JSON/Notion output)
```

### 2B. Route Handlers
```
lib/osint-routes.js          — All /api/osint/* Express handlers (mounted in server.js)
```

### 2C. DB Migrations
```
public/migrations/003_osint_tables.sql   — New SQLite tables for OSINT storage
```

---

## 3. DATABASE SCHEMA (SQLite — users.db)

```sql
-- 003_osint_tables.sql

-- Full intelligence dossier per domain/company
CREATE TABLE IF NOT EXISTS osint_profiles (
    id          TEXT PRIMARY KEY,
    domain      TEXT NOT NULL UNIQUE,
    company     TEXT,
    whois_raw   TEXT,           -- Raw WHOIS JSON
    dns_records TEXT,           -- JSON: {A, MX, NS, TXT, CNAME}
    ssl_info    TEXT,           -- JSON: cert details, expiry
    tech_stack  TEXT,           -- JSON array of detected technologies
    emails      TEXT,           -- JSON array: [{email, type, confidence}]
    socials     TEXT,           -- JSON: {linkedin_url, twitter, github}
    employees   TEXT,           -- JSON array: [{name, title, linkedin}]
    news        TEXT,           -- JSON array: recent news items
    threats     TEXT,           -- JSON: {exposed_ports, breaches, cve_count}
    competitors TEXT,           -- JSON array of competitor domains
    score       INTEGER DEFAULT 0,
    confidence  REAL DEFAULT 0, -- 0.0–1.0 data quality score
    tier        TEXT DEFAULT 'free',  -- free | pro | deep
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Link OSINT profiles to CRM leads (many-to-one)
CREATE TABLE IF NOT EXISTS osint_lead_links (
    lead_id     TEXT REFERENCES crm_leads(id),
    profile_id  TEXT REFERENCES osint_profiles(id),
    PRIMARY KEY (lead_id, profile_id)
);

-- Alert subscriptions: watch a domain for changes
CREATE TABLE IF NOT EXISTS osint_watches (
    id          TEXT PRIMARY KEY,
    domain      TEXT NOT NULL,
    client_id   TEXT,           -- paying client or lead_id
    check_type  TEXT NOT NULL,  -- 'tech_stack' | 'dns' | 'employees' | 'news' | 'ssl_expiry'
    last_value  TEXT,           -- JSON snapshot of last known value
    alert_email TEXT,
    active      INTEGER DEFAULT 1,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Audit log of all OSINT queries (for billing)
CREATE TABLE IF NOT EXISTS osint_query_log (
    id          TEXT PRIMARY KEY,
    domain      TEXT NOT NULL,
    query_type  TEXT NOT NULL,
    source      TEXT,           -- 'api_key' | 'web' | 'agent' | 'auto_enrich'
    api_key_id  TEXT,
    cost_credits INTEGER DEFAULT 0,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 4. OSINT INTELLIGENCE SOURCES (Free-First Strategy)

### 4A. Zero-Cost Sources (no API key required)
| Source | What we get | Node module |
|--------|------------|-------------|
| DNS lookup | A, MX, NS, TXT records | Built-in `dns` module |
| SSL cert | Issuer, expiry, SANs | `tls.connect()` |
| HTTP headers | Server, X-Powered-By, security headers | `axios` |
| `robots.txt` / `sitemap.xml` | Crawl hints, page structure | `axios` |
| Wappalyzer-lite | Tech stack detection | Pattern matching on headers/HTML |
| Google cache | Cached snapshots | Scrape (rate-limited) |
| Bing news RSS | Free news feed | XML parse |
| GitHub org search | Public repos, employees | GitHub API (unauthenticated, 60 req/hr) |
| Crt.sh | SSL cert transparency → subdomains | `https://crt.sh/?q=domain&output=json` |
| ViewDNS.info | WHOIS, reverse IP, port scan | Free tier API |
| HaveIBeenPwned | Email breach check | Free public API |
| Hunter.io | Email discovery | 25 req/mo free tier |
| BuiltWith free | Tech stack | Free API endpoint |

### 4B. Paid API Integrations (opt-in via `.env`)
| Service | Value | Env Var | Est. Cost |
|---------|-------|---------|-----------|
| Clearbit Enrichment | Company + person data | `CLEARBIT_API_KEY` | $99/mo |
| Shodan | Exposed ports, CVEs, banners | `SHODAN_API_KEY` | $59/mo |
| SecurityTrails | DNS history, subdomains | `SECURITYTRAILS_KEY` | $50/mo |
| Hunter.io Pro | Bulk email discovery | `HUNTER_API_KEY` | $49/mo |
| FullContact | Person enrichment | `FULLCONTACT_KEY` | $99/mo |
| Apollo.io | B2B contact database | `APOLLO_API_KEY` | $49/mo |
| SpyFu / Semrush | SEO + competitor intel | `SPYFU_KEY` | $39/mo |
| Brandfetch | Logo + brand assets | `BRANDFETCH_KEY` | Free tier |

**Total minimum viable:** $0/mo (free tier sources only)  
**Recommended production:** ~$200/mo for Clearbit + Shodan + SecurityTrails + Hunter Pro

---

## 5. IMPLEMENTATION PHASES

### PHASE 1 — Core Engine + Domain Intelligence (Day 1-2)
**Goal:** Every domain lookup returns structured intelligence data

**Files:**
- `lib/osint-domain.js` — DNS, SSL, HTTP headers, robots, sitemap
- `lib/osint-routes.js` — Mount GET/POST handlers on `/api/osint/*`
- `public/migrations/003_osint_tables.sql` — Run on startup

**Routes added:**
```
POST /api/osint/enrich         — Enrich a domain (triggers all gatherers)
GET  /api/osint/profile/:domain — Fetch cached OSINT profile
GET  /api/osint/dns/:domain    — DNS records only
GET  /api/osint/ssl/:domain    — SSL cert info
GET  /api/osint/tech/:domain   — Tech stack detection
GET  /api/osint/subdomains/:domain — Subdomain enumeration via crt.sh
```

**Key implementation — `lib/osint-domain.js`:**
```js
// DNS: built-in dns.promises
// SSL: tls.connect() to port 443
// Tech stack: regex patterns on response headers + HTML body
// Subdomains: fetch https://crt.sh/?q=%.domain&output=json
// HTTP fingerprint: axios HEAD + GET to detect WAF/CDN/framework
```

---

### PHASE 2 — Company & People Enrichment (Day 2-3)
**Goal:** Turn a domain into a full company profile with employee contacts

**Files:**
- `lib/osint-company.js` — Clearbit-style enrichment (free: BuiltWith + LinkedIn scrape)
- `lib/osint-email.js` — Hunter.io email pattern discovery
- `lib/osint-social.js` — Social footprint gathering

**Routes added:**
```
GET  /api/osint/company/:domain   — Full company profile
GET  /api/osint/emails/:domain    — Discovered email addresses
GET  /api/osint/people/:domain    — Employee list with LinkedIn URLs
POST /api/osint/verify-email      — Check email validity (SMTP probe)
```

**CRM Auto-Enrichment Hook:**
In `leadgen-engine.js`, after `POST /api/crm/leads` inserts a row:
```js
// Fire-and-forget enrichment (don't block lead creation)
setImmediate(() => enrichLeadOSINT(id, company, email));
```
This runs the OSINT pipeline in background and updates `osint_profile` + score when done.

---

### PHASE 3 — Threat Intelligence + Exposure Scanning (Day 3-4)
**Goal:** Security-aware profiling for enterprise clients

**Files:**
- `lib/osint-threat.js` — Shodan, HaveIBeenPwned, open port scanning

**Routes added:**
```
GET  /api/osint/threats/:domain   — Security exposure report
GET  /api/osint/breaches/:email   — HaveIBeenPwned lookup
GET  /api/osint/ports/:domain     — Open port summary (Shodan)
```

**Free-tier implementation** (no Shodan key):
- Use `crt.sh` for IP discovery
- Use `nmap`-style port check via net.Socket (timeout probes on common ports)
- Use HaveIBeenPwned public API (rate-limited, free)
- Use Censys free tier (250 req/mo)

---

### PHASE 4 — Competitive Intelligence + News Monitoring (Day 4-5)
**Goal:** Track competitor moves, tech changes, job postings, news

**Files:**
- `lib/osint-competitive.js` — Tech stack delta detection, pricing page scraping
- `lib/osint-news.js` — RSS/news aggregation, Google News scraping

**Routes added:**
```
POST /api/osint/compare          — Side-by-side competitor analysis
GET  /api/osint/news/:domain     — Recent news about company
GET  /api/osint/jobs/:domain     — Job postings (signals: hiring, layoffs)
```

**Intelligence signals extracted:**
- "Competitor switched from Stripe to Paddle" → tech stack change
- "Competitor raised Series B" → expansion signal
- "Competitor posting 10+ sales roles" → aggressive hiring signal
- "Competitor's SSL expires in 14 days" → outreach opportunity

---

### PHASE 5 — Automated Alerts + Watch Engine (Day 5-6)
**Goal:** Recurring revenue via subscription monitoring service

**Files:**
- `lib/osint-alerts.js` — Cron-based delta detection + email/webhook dispatch

**How it works:**
1. Client pays via PayFast to watch N domains
2. `osint_watches` row created with `check_type` and `alert_email`
3. Cron runs every 24h, re-fetches the watched attribute
4. If delta detected → email alert + Telegram notification + Notion update
5. Interaction logged in CRM for billing

**Cron schedule (via PM2 or node-cron):**
```
Every 1h:  SSL expiry checks (alert at 30/14/7 days)
Every 6h:  DNS record changes
Every 12h: Tech stack changes
Every 24h: News + job posting changes
Every 7d:  Full re-enrichment of all watched domains
```

---

### PHASE 6 — Report Generation + Monetization (Day 6-7)
**Goal:** Turn OSINT data into sellable PDF/HTML reports

**Files:**
- `lib/osint-report.js` — HTML report generator with LLM summary

**Revenue hooks:**
1. **OSINT Credits system** — 1 credit = 1 domain enrichment
   - Free tier: 3 credits/mo
   - Pro ($49/mo): 100 credits/mo
   - Enterprise ($499/mo): unlimited + API access
   
2. **Watch subscriptions** — $9/domain/mo for change alerts

3. **One-time reports** — $29 per deep OSINT report (PDF)
   - PayFast checkout → generate → email PDF

4. **API keys** — Sell OSINT API access via `lib/api-key-routes.js`
   - Metered at $0.10 per enrichment call

5. **BRDG token gate** — Hold 100 BRDG → unlock 10 free enrichments/mo

---

## 6. `lib/osint-engine.js` — MASTER ORCHESTRATOR

```js
// Unified entry point — coordinates all sub-modules
async function enrichDomain(domain, tier = 'free') {
  const results = await Promise.allSettled([
    getDomainIntel(domain),    // Phase 1
    getCompanyProfile(domain), // Phase 2
    getEmailContacts(domain),  // Phase 2
    getTechStack(domain),      // Phase 1
    getSubdomains(domain),     // Phase 1
    tier !== 'free' ? getThreatProfile(domain) : null, // Phase 3
    getNewsItems(domain),      // Phase 4
  ]);

  const profile = mergeResults(results);
  profile.confidence = calculateConfidence(profile);
  profile.score = calculateLeadScore(profile);

  await saveProfile(domain, profile);
  return profile;
}
```

**Confidence scoring:**
- Each data point has a reliability weight
- Free sources: 0.5–0.7 confidence
- API-verified sources: 0.85–1.0 confidence
- LLM-inferred: 0.4 confidence

---

## 7. `/api/osint/*` ROUTE MAP (Complete)

```
POST   /api/osint/enrich            — Full enrichment job (async, returns job_id)
GET    /api/osint/enrich/:job_id    — Poll enrichment status
GET    /api/osint/profile/:domain   — Fetch cached profile
DELETE /api/osint/profile/:domain   — Purge + re-enrich

GET    /api/osint/dns/:domain       — DNS records
GET    /api/osint/ssl/:domain       — SSL certificate
GET    /api/osint/tech/:domain      — Tech stack
GET    /api/osint/subdomains/:domain — Subdomain list
GET    /api/osint/headers/:domain   — Security headers analysis

GET    /api/osint/company/:domain   — Company info
GET    /api/osint/emails/:domain    — Email addresses
POST   /api/osint/verify-email      — SMTP email verification
GET    /api/osint/people/:domain    — Employee directory

GET    /api/osint/threats/:domain   — Security exposure
GET    /api/osint/breaches/:email   — Breach check
GET    /api/osint/ports/:ip         — Open ports

GET    /api/osint/news/:domain      — News feed
GET    /api/osint/jobs/:domain      — Job postings
POST   /api/osint/compare           — Competitive comparison

POST   /api/osint/watch             — Subscribe to domain monitoring
GET    /api/osint/watches           — List active watches
DELETE /api/osint/watch/:id         — Cancel watch

POST   /api/osint/report            — Generate paid PDF report
GET    /api/osint/report/:id        — Download report

GET    /api/osint/stats             — Usage stats + billing
```

---

## 8. REVENUE MODEL — OSINT AS A SERVICE

### Revenue Streams Enabled by This Integration

| Stream | Model | Est. Monthly Revenue |
|--------|-------|---------------------|
| OSINT API credits | $0.10/call, metered | $200–$2,000 |
| Domain watch subscriptions | $9/domain/mo | $90–$900 (10–100 clients) |
| One-time deep reports | $29/report | $290–$2,900 (10–100 reports) |
| Pro tier OSINT seat | $49/mo | $490–$4,900 (10–100 seats) |
| Enterprise data feeds | $499/mo | $499–$4,990 |
| Agent marketplace (AP2) | 5% of OSINT task value | $50–$500 |

**Compounding mechanism:**
- OSINT enriches leads → better email targeting → higher conversion → more PayFast revenue
- OSINT watches create lock-in → recurring subscription revenue
- OSINT reports are evergreen IP → resell updated versions quarterly
- BRDG token utility increases holding incentive → token price support

---

## 9. AFFILIATE AUGMENTATION

Add OSINT tool affiliates to `lib/affiliate-engine.js`:

```js
shodan: {
  name: 'Shodan',
  base_url: 'https://www.shodan.io',
  ref_param: 'ref',
  ref_id: process.env.AFFILIATE_SHODAN_ID || 'bridgeai',
  commission_type: 'one_time',
  commission_rate: '30%',
},
hunter: {
  name: 'Hunter.io',
  base_url: 'https://hunter.io',
  ref_param: 'via',
  ref_id: process.env.AFFILIATE_HUNTER_ID || 'bridgeai',
  commission_type: 'recurring',
  commission_rate: '20%',
},
apollo: {
  name: 'Apollo.io',
  base_url: 'https://www.apollo.io',
  ref_param: 'ref',
  ref_id: process.env.AFFILIATE_APOLLO_ID || 'bridgeai',
  commission_type: 'recurring',
  commission_rate: '20%',
},
```

**Trigger:** When an OSINT report hits the API limit for a free source,
show an upgrade prompt with affiliate link → earn commission on the user's upgrade.

---

## 10. AP2 MARKETPLACE INTEGRATION

OSINT tasks are a natural fit for the AP2 agent marketplace (`lib/ap2/`):

```
Task type: osint_enrich
Payload: { domain: "target.com", tier: "deep" }
Price: 0.5 BRDG (free) → 5 BRDG (deep)
Skills required: ["osint", "web_scraping", "data_enrichment"]
```

Any agent in the swarm can claim OSINT tasks, run enrichment,
and earn BRDG tokens — creating an autonomous intelligence workforce.

---

## 11. IMPLEMENTATION ORDER (CRITICAL PATH)

```
Day 1  [Foundation]
  ✓ Create public/migrations/003_osint_tables.sql
  ✓ Create lib/osint-domain.js (DNS + SSL + HTTP headers + tech stack)
  ✓ Create lib/osint-routes.js with /api/osint/enrich + /api/osint/profile/:domain
  ✓ Mount in server.js

Day 2  [Enrichment]
  ✓ Create lib/osint-email.js (Hunter.io free tier + SMTP probe)
  ✓ Create lib/osint-company.js (BuiltWith + Clearbit-free + crt.sh)
  ✓ Wire auto-enrichment hook into POST /api/crm/leads

Day 3  [Threat Intel]
  ✓ Create lib/osint-threat.js (HaveIBeenPwned + port probing + Censys)
  ✓ Add /api/osint/threats/:domain route

Day 4  [Competitive]
  ✓ Create lib/osint-news.js (RSS + Bing News)
  ✓ Create lib/osint-competitive.js (tech stack delta)

Day 5  [Alerts]
  ✓ Create lib/osint-alerts.js (cron + delta detection)
  ✓ Add /api/osint/watch routes
  ✓ Wire Telegram notifications (lib/telegram-bot.js already exists)

Day 6  [Reports + Monetization]
  ✓ Create lib/osint-report.js (HTML + LLM summary via lib/llm-client.js)
  ✓ Wire PayFast for paid reports
  ✓ Add BRDG token gate
  ✓ Wire affiliate links into report upgrade prompts

Day 7  [Polish + AP2]
  ✓ Add OSINT task type to AP2 marketplace
  ✓ Update OSINT affiliate networks in lib/affiliate-engine.js
  ✓ Add Notion sync for OSINT reports (lib/notion-sync.js)
  ✓ Integration tests
```

---

## 12. ENV VARS TO ADD (`.env`)

```bash
# OSINT — Free tier (no cost)
OSINT_HAVEIBEENPWNED_KEY=        # Free, get from haveibeenpwned.com
OSINT_GITHUB_TOKEN=              # GitHub PAT for org search (60→5000 req/hr)

# OSINT — Paid integrations (opt-in)
OSINT_HUNTER_KEY=                # Hunter.io API key
OSINT_CLEARBIT_KEY=              # Clearbit Enrichment
OSINT_SHODAN_KEY=                # Shodan API
OSINT_SECURITYTRAILS_KEY=        # SecurityTrails
OSINT_APOLLO_KEY=                # Apollo.io contact DB
OSINT_FULLCONTACT_KEY=           # FullContact person enrichment

# OSINT affiliate IDs
AFFILIATE_SHODAN_ID=bridgeai
AFFILIATE_HUNTER_ID=bridgeai
AFFILIATE_APOLLO_ID=bridgeai

# OSINT service config
OSINT_CREDITS_PER_FREE_TIER=3
OSINT_REPORT_PRICE_ZAR=540       # ~$29 at current rate
OSINT_WATCH_PRICE_ZAR=165        # ~$9/domain/mo
OSINT_BRDG_GATE_AMOUNT=100       # BRDG tokens for free tier unlock
```

---

## 13. QUICK WIN — START HERE

The fastest path to value: implement Phase 1 (domain intel) in `lib/osint-domain.js`
and wire the auto-enrichment hook into `POST /api/crm/leads`.

This single change means every new lead that enters the CRM automatically gets:
- Tech stack (are they on AWS? React? Shopify?)
- DNS records (is this a real company with real infrastructure?)
- SSL info (when does their cert expire → sales trigger)
- Security headers grade (enterprise compliance gap → upsell)

All without any paid API key, using only Node.js built-ins + axios.

**Target file to edit first:** [leadgen-engine.js](leadgen-engine.js) at line ~180 (after lead insert).
**New file to create first:** [lib/osint-domain.js](lib/osint-domain.js)
**Migration to run:** [public/migrations/003_osint_tables.sql](public/migrations/003_osint_tables.sql)
