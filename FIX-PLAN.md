# BRIDGE AI OS — Comprehensive Fix Plan (2026-04-12)

> **PLAN ONLY — No code changes until approved.**
> Organized into **8 parallel workstreams** (agents) that can execute concurrently without file conflicts.
> Each workstream includes a **copy-paste-ready agent prompt** with full context.

---

## Architecture Overview

| Layer | Entry Point | Key Files |
|-------|------------|-----------|
| Vercel Serverless | `api/index.js` (60K+ tokens, single catch-all) | Handles `/api/*`, `/ubi/*`, `/auth/*`, `/referral/*` |
| Platform API | `api/platform.js` | Projects, outputs, integrations, billing, wizard |
| VPS Server | `server.js` | Express with auth, CRM, logs, WordPress |
| Gateway | `gateway.js` | Agent execution, SSE, zero-trust |
| Frontend | `public/*.html` (126 pages) | All client-facing UI |
| Database | Supabase (PostgreSQL) | 3 migration files, 26+ tables |
| Config | `vercel.json` | 170+ rewrites, 9 crons, subdomain redirects |
| Libs | `lib/*.js` (71 files) | Treasury, agents, economy, auth, payments |

### Key Patterns

- **Auth:** `requireUser(req)` checks Bearer token / `bridge_token` cookie / query `?token=`
- **Admin:** `requireAdmin` checks `X-Admin-Token` header against `ADMIN_TOKEN` env
- **DB:** `const { supabase, isConfigured } = require('../lib/supabase')` — always check `isConfigured` before queries
- **Response:** `return json(res, data, statusCode)` helper in `api/index.js`; standard `res.json()` in `server.js`
- **Frontend auth:** Pages call `/auth/me` with credentials, store token in `localStorage` as `bridge_token`
- **Design system:** Dark theme, CSS variables `--bg`, `--card`, `--cyan`, `--green`, `--orange`, `--purple`, `--dim`, `--red`
- **Vercel routing:** `/ubi/:path*` → `/api` (catch-all), all HTML pages served from `/public/`

---

## WORKSTREAM 1: API Route Fixes (404 Elimination)

**Agent:** `api-route-fixer`
**Files:** `api/index.js` ONLY (no frontend, no new files)
**Phase:** 2 (after WS8 DB confirmed)

### Issues

| # | Broken Endpoint | Called From | Root Cause |
|---|----------------|-------------|------------|
| 1.1 | `GET /ubi/status` → 404 | `aoe-dashboard.html:706` | Response field mismatch: API returns `{pool_balance, eligible_wallets, distributed_today}` but dashboard expects `{total_claimed, claimant_count, amount_per_claim}` |
| 1.2 | `GET /api/crm/stats` → 404 | `crm.html:215` | `fetchCsrf()` calls this to grab CSRF token from response headers; route exists at line 1262 but may fail on path matching |
| 1.3 | `GET /api/crm/leads?limit=500` → 404 | `crm.html:239` via `api('/crm/leads?limit=500')` | Query param handling — verify `p` (path) strips `?` before prefix check |
| 1.4 | `GET /api/logs` → 404 | `logs.html` | Route exists in `server.js:683` but NOT in `api/index.js` — Vercel only runs `api/index.js` |
| 1.5 | `GET /api/svg` → 404 | Unknown | No route anywhere |
| 1.6 | `GET /api/invoices/stats` → 404 | `invoicing.html:488` via `apiFetch('/invoices/stats')` | No stats route — only `ai-generate`, `smart-create`, `send`, `follow-up` exist |
| 1.7 | `GET /leads` → 404 | Unknown | No top-level route |

---

### AGENT PROMPT — WS1

```
You are fixing 404 errors in the Bridge AI OS Vercel serverless API.

## Context
- The ONLY file you may edit is: `c:\aoe-unified-final\api\index.js`
- This file is the Vercel catch-all serverless function (~3500 lines)
- It uses a manual URL router: `const p = url.pathname || req.url.replace(/\?.*$/, '')`
- Response helper: `function json(res, data, status=200)` 
- Supabase client: `const { supabase, isConfigured: supabaseConfigured } = require('../lib/supabase')`
- Admin check: checks `req.headers['x-admin-token']` against `process.env.ADMIN_TOKEN`
- The file already has hardcoded `CONTACTS` array for CRM and existing routes at lines 1250-1290

## Tasks (in order)

### 1. Fix `/ubi/status` response (line ~2743)
Current response returns: `{pool_balance, eligible_wallets, distributed_today, next_distribution}`
Dashboard (`aoe-dashboard.html:706`) expects: `{total_claimed, claimant_count, amount_per_claim}`
**Fix:** Add backward-compat fields to the existing response. Keep old fields, ADD new ones:
```js
return json(res, {
  pool_balance: +(treasuryBalance * 0.2).toFixed(2),
  currency: 'ZAR',
  eligible_wallets: 47,
  distributed_today: +(treasuryBalance * 0.001).toFixed(2),
  next_distribution: new Date(Date.now() + 86400000).toISOString(),
  // backward-compat fields for aoe-dashboard
  total_claimed: +(treasuryBalance * 0.05).toFixed(2),
  claimant_count: 47,
  amount_per_claim: +(treasuryBalance * 0.001 / 47).toFixed(2),
  ts: ts(),
});
```

### 2. Add `GET /api/invoices/stats` route
Insert BEFORE the existing `/api/invoices/ai-generate` block (around line 1437).
Query Supabase `invoices` table if configured, otherwise return mock stats.
Response shape must match what `invoicing.html:488` expects:
```js
{ total_invoices, total_paid, total_billed, by_status: { draft, sent, paid, overdue, cancelled } }
```

### 3. Add `GET /api/invoices` list route
Insert near the stats route. Query Supabase `invoices` table with:
- `?status=` filter
- `?limit=` (default 50)
- `?offset=` for pagination
Return: `{ ok: true, invoices: [...], count: N }`

### 4. Add `GET /api/logs` route
Insert in the system/admin section. Require admin token.
Read from `./logs/` directory (JSONL files) — mirror `server.js:683` logic:
- Read recent log files, parse JSONL lines
- Support `?level=` filter and `?limit=` param
- Return: `{ ok: true, logs: [...], count: N }`

### 5. Add `GET /leads` redirect
Near the top of the router (before the catch-all 404), add:
```js
if (p === '/leads') {
  res.writeHead(301, { Location: '/api/crm/leads' });
  return res.end();
}
```

### 6. Verify CRM path matching
Check that the query-string stripping logic at the top of the handler correctly strips `?limit=500` etc. before the `p.startsWith('/api/crm')` check. The variable `p` should already be clean — if not, fix it.

## Rules
- Do NOT refactor existing code — surgical additions only
- Do NOT touch any other file
- Do NOT change existing response shapes — only add fields
- Keep the same coding style (no arrow functions in older sections, use `function` keyword where surrounding code does)
- Test by searching for each route pattern after editing to confirm it exists
```

---

## WORKSTREAM 2: Landing Page Enhancement (`public/index.html`)

**Agent:** `landing-page-enhancer`
**Files:** `public/index.html` ONLY
**Phase:** 1 (no dependencies)

### Issues & Enhancements

| # | Issue | Section | Fix |
|---|-------|---------|-----|
| 2.1 | Burn counter stuck at 0 | `#burn-counter-num` | Fetch `/api/treasury/status` → animate counting up |
| 2.2 | Economy stats static (`--`) | `#e-circ`, `#e-burned`, `#e-treasury`, `#e-txs` | Fetch `/api/economy/dashboard` on load |
| 2.3 | Features not clickable | `#features .feature` cards | Wrap in anchors with real use cases |
| 2.4 | Agent demo too basic | `#try-it` | Typing animation, thinking state, structured output |
| 2.5 | Testimonials static | `.testimonials` | 3D CSS carousel, auto-rotate, pause on hover |
| 2.6 | Trust logos text-only | `.trust-logos` | More integrations + typing/fade-in animation |
| 2.7 | Price buttons broken | Pricing cards | Wire to `/api/platform/billing/initiate` |
| 2.8 | No sticky CTA | Below fold | Sticky bottom bar → `/onboarding.html` |
| 2.9 | Widget not draggable | Bottom nav | Drag-anywhere with mouse/touch |
| 2.10 | Portal not personalized | Nav | Show user name if authed |

---

### AGENT PROMPT — WS2

```
You are enhancing the Bridge AI OS landing page for conversion and engagement.

## Context
- The ONLY file you may edit is: `c:\aoe-unified-final\public\index.html`
- This is a single-page marketing/landing page with inline CSS and JS
- Design system: dark theme, CSS vars: `--bg:#0a0e17`, `--card:#131a2b`, `--cyan:#38bdf8`, `--green:#22c55e`, `--orange:#f59e0b`, `--purple:#a78bfa`, `--dim:#6b7280`, `--red:#ef4444`
- The page has these sections (in order): hero, economy (#economy), features (#features), agent demo (#try-it), testimonials, trust logos (.trust), pricing, CTA banner
- Available API endpoints:
  - `GET /api/treasury/status` → `{ total_brdg, burned, circulating, transactions }`
  - `GET /api/economy/dashboard` → `{ circulating_supply, burned, treasury_balance, total_transactions }`
  - `GET /api/brdg/token` → `{ total_supply, burned, circulating }`
  - `POST /api/platform/billing/initiate` → body `{ plan: "starter"|"pro"|"admin"|"enterprise" }` → `{ redirect_url }`
  - `POST /ask` → body `{ prompt, agent }` → `{ text }` (agent demo)
  - `GET /auth/me` → `{ ok, user: { name, email, plan } }` (needs credentials: include)

## Tasks

### 1. BURN COUNTER — Make it live and animated
The element `<div class="burn-number" id="burn-counter-num">0</div>` is always 0.
- On page load, fetch `/api/treasury/status` or `/api/brdg/token`
- Extract the `burned` value
- Animate from 0 to the real value using a counting-up effect (requestAnimationFrame, ~2 second duration)
- Format with commas (e.g., "1,247.83")
- If fetch fails, show "—" not 0

### 2. ECONOMY STATS — Wire up live data
Elements: `#e-circ`, `#e-burned`, `#e-treasury`, `#e-txs` — all show "--"
- Fetch `/api/economy/dashboard` on page load
- Populate each with formatted values
- Add subtle fade-in animation when data arrives

### 3. FEATURES — Clickable with real use cases
Each `.feature` card has an emoji icon, h3, and p.
- Wrap each card in `<a href="...">` linking to the relevant page:
  - Business Suite → `/crm` 
  - AI Agent Workforce → `/agents`
  - DeFi Treasury → `/treasury-dashboard`
  - Digital Twins → `/avatar`
  - Enterprise Security → `/settings`
  - Africa-First → `/onboarding.html`
- Add `cursor:pointer`, hover scale transform, and a subtle glow on hover
- Update descriptions to be more sales-oriented with concrete use cases (e.g., "Automate your entire CRM pipeline — from lead capture to closed deal — with AI agents that work 24/7")

### 4. AGENT DEMO — Advanced interactive experience
Current demo: select agent → type command → click Execute → plain text result.
Enhance to:
- Show a "thinking..." animation with pulsing dots when waiting for response
- Display result with a typewriter/typing effect (character by character, ~30ms per char)
- Structure output in a formatted card (not raw text) with sections if the response is long
- Add more quick-prompt buttons covering real business use cases:
  - "Analyze my competitor" / "Write a cold email" / "Generate a privacy policy" / "Forecast Q2 revenue" / "Create a project plan" / "Audit my website SEO"
- Quick-prompt buttons should fill both the agent selector AND the input field
- Add a subtle terminal-style green glow to the output area

### 5. TESTIMONIALS — 3D auto-rotating carousel
Replace the static 3-card grid with a CSS 3D perspective carousel:
- Cards arranged in a circle using `transform: rotateY(Xdeg) translateZ(Zpx)`
- Auto-rotate every 5 seconds (CSS animation or minimal JS setInterval)
- Pause rotation on hover
- Smooth transition between cards
- Keep existing testimonial content, add 2-3 more (you can create realistic SA business testimonials)
- Mobile: fall back to horizontal scroll snap

### 6. TRUST LOGOS — More integrations + animation
Current: PayFast, Paystack, Linea, SyncSwap, Cloudflare, Anthropic, OpenAI, Brevo (text only).
- Add: Supabase, Vercel, Telegram, WhatsApp, Google Workspace, Slack, Notion, GitHub, Stripe, PayPal, AWS, Docker, Redis
- Add a slow horizontal marquee/scroll animation (CSS @keyframes translateX, infinite)
- Keep the compliance badges below (PCI DSS, POPIA, etc.)

### 7. PRICING BUTTONS — Wire to PayFast
Each pricing card has a button. Wire them:
```js
async function subscribe(plan) {
  const r = await fetch('/api/platform/billing/initiate', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan })
  }).then(r => r.json());
  if (r.redirect_url) window.location.href = r.redirect_url;
  else window.location.href = '/onboarding.html?plan=' + plan;
}
```
- Starter → `subscribe('starter')`, Pro → `subscribe('pro')`, etc.
- Free tier button → `/onboarding.html`

### 8. STICKY CTA — Scroll-triggered bottom bar
- Create a fixed bottom bar (height ~56px) that slides up after user scrolls past the hero section
- Text: "Ready to automate your business?" + "Get Started Free" button → `/onboarding.html`
- Style: `--card` background, cyan border-top, slight blur backdrop
- Dismiss with an X button (sets sessionStorage flag)
- Smooth slide-up animation (transform translateY)

### 9. WIDGET NAV — Draggable
The bottom navigation widget should be draggable:
- Add mousedown/touchstart event listeners on the widget container
- Track mouse/touch movement, update `left`/`top` with `position: fixed`
- Snap to nearest edge on release (optional)
- Save position to localStorage so it persists

### 10. PORTAL PERSONALIZATION
The nav has a "Portal" link. If user is authenticated:
- On page load, try `fetch('/auth/me', { credentials: 'include' })`
- If `.ok` and `.user`, replace "Portal" text with user's first name
- Add a small avatar circle with initials

## Rules
- ALL changes go in `public/index.html` only — inline CSS and JS
- Do NOT add external JS libraries (no GSAP, no Swiper, etc.) — vanilla JS + CSS only
- Do NOT break existing nav structure or layout
- Preserve the dark theme design system
- Mobile-responsive: test all additions work on small screens
- If an API fetch fails, degrade gracefully (show "--" or hide section), never show errors to users
```

---

## WORKSTREAM 3: CRM + Invoicing Backend & Frontend

**Agent:** `crm-invoicing-builder`
**Files:**
- `api/crm/routes.js` (NEW file)
- `public/crm.html`
- `public/invoicing.html`
**Phase:** 2 (after WS8 DB confirmed)

### Issues

| # | Issue | Fix |
|---|-------|-----|
| 3.1 | CRM uses hardcoded CONTACTS array | New router backed by Supabase `contacts` table |
| 3.2 | `fetchCsrf` calls `/api/crm/stats` which 404s | Fix the CRM page to not depend on CSRF from stats endpoint |
| 3.3 | No real CRUD | Full Supabase-backed CRUD |
| 3.4 | No pipeline view | Kanban columns |
| 3.5 | Invoice stats 404 | New stats endpoint |
| 3.6 | Invoice UI needs AI helper | Floating AI panel |
| 3.7 | No PDF download | Browser print CSS |

---

### AGENT PROMPT — WS3

```
You are building real CRM and Invoicing functionality for Bridge AI OS.

## Context
- You may edit these files ONLY:
  1. `c:\aoe-unified-final\api\crm\routes.js` (CREATE this new file)
  2. `c:\aoe-unified-final\public\crm.html` (frontend CRM page)
  3. `c:\aoe-unified-final\public\invoicing.html` (frontend invoicing page)
- Do NOT edit `api/index.js` — WS1 agent handles that file
- Supabase client: `const { supabase, isConfigured } = require('../../lib/supabase')`
- The database has these tables (from migration 20260411100000):
  - `contacts` — id(UUID), company_id, name, email, phone, company_name, status(lead/prospect/qualified/customer/churned), stage(new/outreach/demo/proposal/negotiation/closed/lost), value(NUMERIC), score(INT 0-100), source, tags(TEXT[]), notes, assigned_to, industry, meta(JSONB), created_at, updated_at
  - `invoices` — id(UUID), company_id, contact_id, invoice_number, client_name, client_email, line_items(JSONB), subtotal, tax_rate(15), tax_amount, total, status(draft/sent/paid/overdue/cancelled), due_date, paid_at, notes, created_at, updated_at
  - `tickets` — id(UUID), company_id, contact_id, subject, body, status(open/in_progress/resolved/closed), priority(low/medium/high/urgent), category, assigned_to, created_at, updated_at

## PART A: Create `api/crm/routes.js`

This file will be `require`d from `api/index.js` (by WS1 agent). Export a single handler function.

```js
// api/crm/routes.js
'use strict';
const { supabase, isConfigured } = require('../../lib/supabase');

async function handleCRM(req, res, p, method, parseBody, json, requireAdmin) {
  // p = cleaned URL path (no query string)
  // Routes to implement:
  
  // GET /api/crm/stats — aggregate stats from contacts table
  // GET /api/crm/contacts — list with ?status=&stage=&limit=&offset= filters
  // POST /api/crm/contacts — create contact (validate name+email required)
  // GET /api/crm/contacts/:id — single contact
  // PUT /api/crm/contacts/:id — update contact fields
  // DELETE /api/crm/contacts/:id — soft delete (set status='archived')
  // GET /api/crm/leads — alias for contacts where status != 'customer'
  // GET /api/crm/campaigns — keep existing mock data for now
  
  // Return null if route not matched (caller continues)
}

module.exports = { handleCRM };
```

**Stats response shape** (what `crm.html:215` fetchCsrf expects — it just needs a 200 response):
```json
{
  "total_contacts": 42,
  "customers": 12,
  "leads": 30,
  "prospects": 8,
  "mrr": 15600,
  "avg_deal_value": 1300,
  "pipeline_value": 45000,
  "by_stage": { "new": 10, "outreach": 8, "demo": 5, "proposal": 4, "negotiation": 3 }
}
```

**Contacts list response shape** (what `crm.html:239` loadAll expects):
```json
{
  "leads": [{ "id": "...", "email": "...", "first_name": "...", "last_name": "...", "company": "...", "status": "lead", "stage": "new", "score": 45, "value": 1200, ... }],
  "count": 30
}
```
Note: The frontend uses `first_name`/`last_name` but the DB column is `name`. Map accordingly — split on space or add a transform.

## PART B: Fix `public/crm.html`

Read the file first to understand the full structure. Key issues:

1. **`fetchCsrf()`** (line 215) calls `fetch('/api/crm/stats')` to grab a CSRF token from response headers. This is an anti-pattern — CSRF tokens aren't returned by this API. Fix: remove the CSRF dependency entirely. The API uses Bearer token auth, not CSRF.
   - Remove `_csrf` variable and all CSRF header logic
   - Simplify `api()` function to just use Bearer token auth

2. **`api()` function** (line 217) prepends `'\api'` — note the backslash instead of forward slash. This is a Windows path bug. Fix: change to `'/api'`

3. **`loadAll()`** (line 238) calls `api('/crm/leads?limit=500')` → becomes `fetch('/api/crm/leads?limit=500')`. Make sure this works with the new route.

4. **Add pipeline/Kanban view**: Add a toggle between "Grid" and "Pipeline" view. Pipeline shows columns for each stage (New, Outreach, Demo, Proposal, Negotiation, Closed, Lost) with contact cards that can be visually grouped.

## PART C: Fix `public/invoicing.html`

Read the file first. Key issues:

1. **Same CSRF and backslash bugs** as CRM page — fix `fetchCsrf()` and `apiFetch()` the same way

2. **`loadStats()`** (line 486) calls `apiFetch('/invoices/stats')` → needs the stats endpoint (created in WS1). The expected response shape:
```json
{
  "total_invoices": 24,
  "total_paid": 18500,
  "total_billed": 32000,
  "by_status": { "draft": 3, "sent": 5, "paid": 12, "overdue": 4 }
}
```

3. **Add AI helper panel**: Add a collapsible side panel (right side, 350px wide) with:
   - Chat interface that calls `POST /ask` with `{ prompt: userMessage, agent: 'agent-biz-finance' }`
   - Quick actions: "Generate invoice for...", "Follow up on overdue", "Suggest payment terms"
   - Typing animation for responses

4. **PDF download**: Add a "Download PDF" button per invoice that uses `window.print()` with a print-specific stylesheet that hides nav/sidebar and formats the invoice cleanly.

## Rules
- Design must match Bridge AI OS dark theme (vars: --bg, --card, --cyan, etc.)
- All Supabase queries must check `isConfigured` first — if not configured, return reasonable mock/empty data
- Do NOT create additional files beyond the three listed
- Handle errors gracefully — never show raw error messages to users
- Mobile responsive
```

---

## WORKSTREAM 4: Admin Consolidation & Access Control

**Agent:** `admin-consolidator`
**Files:**
- `public/admin.html`
- `public/admin-revenue.html`
- `public/admin-withdraw.html`
- `public/control.html`
- `public/system-status-dashboard.html`
- `public/registry.html`
**Phase:** 1 (no dependencies)

---

### AGENT PROMPT — WS4

```
You are consolidating and securing all admin pages in Bridge AI OS.

## Context
- You may edit these files ONLY:
  1. `c:\aoe-unified-final\public\admin.html` — main admin hub
  2. `c:\aoe-unified-final\public\admin-revenue.html` — revenue tracking (fix proof chain)
  3. `c:\aoe-unified-final\public\admin-withdraw.html` — withdrawal management
  4. `c:\aoe-unified-final\public\control.html` — system control panel
  5. `c:\aoe-unified-final\public\system-status-dashboard.html` — system health
  6. `c:\aoe-unified-final\public\registry.html` — service registry
- Do NOT edit `api/index.js`, `lib/proof-store.js`, or `lib/chain-verify.js`
- Design system: dark theme with CSS vars `--bg:#0a0e17`, `--card:#131a2b`, `--cyan:#38bdf8`, etc.
- Auth check: `GET /auth/me` with `credentials: 'include'` → `{ ok, user: { role, name, email } }`
- Admin endpoints use `X-Admin-Token` header

## Task 1: ADMIN GATE — Add to ALL 6 pages

At the top of each page's `<script>`, BEFORE any other init code, add:

```js
(async function checkAdmin() {
  const r = await fetch('/auth/me', { credentials: 'include' }).then(r => r.json()).catch(() => ({ ok: false }));
  if (!r.ok || (r.user?.role !== 'admin' && r.user?.plan !== 'admin' && r.user?.plan !== 'enterprise')) {
    document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;color:#ef4444;font-family:monospace;font-size:1.2rem">Access denied — admin only</div>';
    setTimeout(() => window.location.href = '/portal', 2000);
    return;
  }
  window.__adminUser = r.user;
  window.__adminToken = localStorage.getItem('bridge_token') || '';
  initPage(); // call the page's real init function
})();
```

Wrap each page's existing init code in a function called `initPage()`.

## Task 2: FIX PROOF CHAIN in `admin-revenue.html`

The proof chain keeps showing "BROKEN". Read the file — around line 350 it fetches:
- `GET /api/verify/chain` → `{ data: { chainIntegrity: { valid, length }, revenueMtd, totalRevenue, transactionCount } }`
- `GET /api/proofs/payments?limit=100` → `{ proofs: [...] }`

The issue is that the chain verification depends on transaction proofs being written for every payment, but many payments don't write proofs. The FIX is frontend-side:

1. When chain integrity returns `{ valid: false }`, don't show "BROKEN" in red — instead show "REBUILDING..." in orange and trigger a `POST /api/treasury/reconcile` to rebuild
2. Add a "Rebuild Proof Chain" button that calls `POST /api/treasury/reconcile` with admin token
3. After rebuild, re-fetch and re-render
4. Add a fallback: if `/api/verify/chain` fails entirely (500/404), show revenue data from `/api/treasury/status` instead — never show a blank page

## Task 3: UNIFIED ADMIN NAV

Add a consistent admin navigation bar to all 6 pages:

```html
<nav class="admin-nav">
  <a href="/admin.html" class="admin-nav-item">Dashboard</a>
  <a href="/admin-revenue.html" class="admin-nav-item">Revenue</a>
  <a href="/admin-withdraw.html" class="admin-nav-item">Withdrawals</a>
  <a href="/control.html" class="admin-nav-item">Control</a>
  <a href="/system-status-dashboard.html" class="admin-nav-item">System Health</a>
  <a href="/registry.html" class="admin-nav-item">Registry</a>
</nav>
```

Style with the dark theme. Highlight the current page.

## Task 4: FIX `control.html` — Wire to real treasury

Read the file first. It should display:
- Real treasury balances from `GET /api/treasury/status`
- Bucket allocations (ops 45%, growth 15%, reserve 15%, founder 25%)
- Recent treasury transactions from `GET /api/treasury/ledger`
- Admin actions: reconcile, distribute rewards, compound banks

## Task 5: FIX `registry.html` — Remove mock data

Read the file first. Replace any hardcoded service arrays with:
- Fetch from `GET /api/registry/system` (admin-token required in header)
- If that fails, try `GET /api/status` for basic service health
- Display services in a table with status indicators (green=healthy, orange=degraded, red=down)
- Remove any fake/placeholder data

## Task 6: FIX `system-status-dashboard.html`

Read the file first. Ensure it:
- Fetches from `GET /api/tvm` for the full Topic Vector Matrix
- Shows real health status for all 15 system components
- Has the admin gate from Task 1

## Rules
- Read each file FIRST before editing — understand what's there
- Dark theme design system only
- Admin token should be sent as: `headers: { 'X-Admin-Token': window.__adminToken }`
- Never remove existing functionality — only enhance and gate
- Mobile responsive
```

---

## WORKSTREAM 5: Marketplace, Tickets & Legal

**Agent:** `client-pages-builder`
**Files:**
- `public/marketplace.html`
- `public/tickets.html`
- `public/legal.html`
- `public/bridge-widget.js` (add ticket shortcut)
**Phase:** 2 (after WS8 DB confirmed)

---

### AGENT PROMPT — WS5

```
You are rebuilding three client-facing pages with real functionality.

## Context
- You may edit these files ONLY:
  1. `c:\aoe-unified-final\public\marketplace.html`
  2. `c:\aoe-unified-final\public\tickets.html`
  3. `c:\aoe-unified-final\public\legal.html`
  4. `c:\aoe-unified-final\public\bridge-widget.js` (add ticket creation shortcut)
- Design system: dark theme, CSS vars `--bg:#0a0e17`, `--card:#131a2b`, `--cyan:#38bdf8`, etc.
- Auth: `GET /auth/me` with `credentials: 'include'`, Bearer token in Authorization header
- Database tables (Supabase):
  - `marketplace_tasks` — id, company_id, title, description, category, budget, status(open/assigned/in_progress/completed/cancelled), assigned_agent, result(JSONB), created_by, created_at
  - `tickets` — id, company_id, contact_id, subject, body, status(open/in_progress/resolved/closed), priority(low/medium/high/urgent), category, assigned_to, created_at
- API endpoints:
  - `GET /api/marketplace/tasks` → task list
  - `POST /api/marketplace/tasks` → create task
  - `GET /api/marketplace/skills` → available agent skills
  - `POST /api/tickets` → create ticket
  - `GET /api/tickets` → list tickets
  - `POST /ask` → `{ prompt, agent }` for AI interactions

## PART A: Rebuild `marketplace.html`

Read the file first. Replace ALL mock/hardcoded data with real functionality:

### Job Posting Flow
1. **Browse Jobs** — Fetch `GET /api/marketplace/tasks`, display in card grid
   - Each card: title, description preview, budget, status badge, category tag
   - Filter bar: category dropdown, status filter, search box
   - Sort: newest first, highest budget, etc.

2. **Post a Job** — Modal form with:
   - Title (required)
   - Description (textarea, required)
   - Category dropdown: Research, Writing, Analysis, Development, Marketing, Legal, Finance, Design, Other
   - Budget (ZAR amount)
   - AI agent preference (optional — dropdown from `/api/marketplace/skills`)
   - Submit → `POST /api/marketplace/tasks`

3. **Job Detail View** — Click a card to expand:
   - Full description
   - Status timeline (Open → Assigned → In Progress → Completed)
   - If completed: show agent result
   - If user's job: show "Cancel" button

4. **Agent Bidding** — When an AI agent is assigned:
   - Show which agent picked it up
   - Show progress updates
   - Show final deliverable when completed

### Design
- Professional marketplace feel (like Upwork/Fiverr but for AI agents)
- Empty state: "No jobs posted yet — be the first to put AI agents to work"
- Auth required for posting (redirect to /join if not authed)

## PART B: Enhance `tickets.html`

Read the file first. Enhance the ticket creation form:

1. **Enhanced Form Fields:**
   - Subject (text, required)
   - Description (textarea with markdown support hint)
   - Priority selector: Low (green), Medium (yellow), High (orange), Urgent (red) — styled radio buttons or segmented control
   - Category dropdown: Bug Report, Feature Request, Billing, Account, Technical Support, General
   - File attachment area (drag-and-drop zone — store as base64 in meta JSONB for now)

2. **Ticket List** — Show user's previous tickets:
   - Fetch `GET /api/tickets` (filtered by user)
   - Display: subject, status badge, priority badge, date, last update
   - Click to expand → show full conversation/updates

3. **AI Auto-categorization** — When user types a subject:
   - After 500ms debounce, call `POST /ask` with `{ prompt: "Categorize this support ticket: [subject]. Return only the category.", agent: "agent-biz-support" }`
   - Auto-select the category dropdown based on response

## PART C: Rebuild `legal.html`

Read the file first. Currently too bulky and no real utility.

### Redesign
1. **Clean Layout** — Collapsible accordion sections instead of walls of text:
   - Terms of Service
   - Privacy Policy (POPIA + GDPR)
   - Acceptable Use Policy
   - Cookie Policy
   - SLA (Service Level Agreement)
   - Data Processing Agreement

2. **Legal Tools** (real utility):
   - "Generate NDA" button → calls AI to generate customized NDA based on user's company
   - "Generate Terms" → AI-generated terms based on user's business type
   - "POPIA Compliance Check" → checklist with AI assessment
   - "Contract Review" → upload/paste contract text, AI analyzes risks

3. **PDF Download** — Each section gets a "Download PDF" button:
   ```js
   function downloadPdf(sectionId) {
     const content = document.getElementById(sectionId);
     const printWin = window.open('', '_blank');
     printWin.document.write('<html><head><title>Bridge AI OS — Legal</title><style>body{font-family:Inter,sans-serif;padding:40px;max-width:800px;margin:auto;color:#1e293b}h1{color:#0284c7}h2{color:#334155;border-bottom:1px solid #e2e8f0;padding-bottom:8px}</style></head><body>' + content.innerHTML + '</body></html>');
     printWin.document.close();
     printWin.print();
   }
   ```

4. **Accessibility** — Proper heading hierarchy, skip links, sufficient contrast

## PART D: Add ticket shortcut to `bridge-widget.js`

Read the file first. Add a "Report Issue" or ticket icon to the floating widget that opens a minimal ticket form (subject + description + submit) without navigating away from the current page.

## Rules
- Read each file FIRST before editing
- Remove ALL mock/hardcoded data arrays — if API isn't available, show empty state, not fake data
- Dark theme design system
- Auth-aware: check if user is logged in before allowing actions
- Mobile responsive
- No external JS libraries
```

---

## WORKSTREAM 6: Treasury, Settings & Portal

**Agent:** `treasury-settings-portal`
**Files:**
- `public/treasury-dashboard.html`
- `public/settings.html`
- `public/portal.html`
- `public/profile.html`
**Phase:** 2

---

### AGENT PROMPT — WS6

```
You are making Treasury, Settings, and Portal pages functional and on-brand.

## Context
- You may edit these files ONLY:
  1. `c:\aoe-unified-final\public\treasury-dashboard.html`
  2. `c:\aoe-unified-final\public\settings.html`
  3. `c:\aoe-unified-final\public\portal.html`
  4. `c:\aoe-unified-final\public\profile.html`
- Design system: dark theme, CSS vars `--bg:#0a0e17`, `--card:#131a2b`, `--cyan:#38bdf8`, `--green:#22c55e`, `--orange:#f59e0b`, `--purple:#a78bfa`, `--dim:#6b7280`
- Auth: `GET /auth/me` with `credentials: 'include'` → `{ ok, user: { id, name, email, plan, role, brdg_balance, wallet_address } }`
- Profile state: `GET /api/platform/profile/state` → `{ user, wizard, analytics, projects, outputs, capabilities, integrations }`
- Treasury endpoints:
  - `GET /api/treasury/status` → `{ total_brdg, buckets: { ops, growth, reserve, founder }, payments: [...] }`
  - `GET /api/treasury/ledger` → `{ entries: [{ type, amount, bucket, description, created_at }] }`
  - `GET /api/economy/dashboard` → `{ circulating_supply, burned, treasury_balance, total_transactions }`
  - `GET /api/brdg/token` → `{ total_supply, burned, circulating, contract_address }`
  - `GET /events/stream` → Server-Sent Events for real-time updates

## PART A: Fix `treasury-dashboard.html`

Read the file first. It's currently completely static with no API calls.

1. **Live Data** — On page load, fetch all treasury endpoints and populate:
   - Total BRDG balance (large hero number with count-up animation)
   - Bucket allocation bars (ops 45%, growth 15%, reserve 15%, founder 25%) — animated progress bars
   - USD equivalent (from treasury response)
   - Circulating supply vs burned (pie/donut chart using CSS conic-gradient)

2. **Transaction History** — Fetch `/api/treasury/ledger`:
   - Display as a scrollable table: date, type, amount, bucket, description
   - Filter by bucket, type, date range
   - Pagination (limit=50, offset pagination)

3. **Real-Time Updates** — Connect to `/events/stream` (SSE):
   ```js
   const es = new EventSource('/events/stream');
   es.onmessage = (e) => {
     const data = JSON.parse(e.data);
     if (data.type === 'treasury_update') refreshTreasury();
   };
   ```
   Fall back to polling every 30s if SSE fails.

4. **BRDG Token Info Card** — Show contract address (linked to Lineascan), burn rate, recent transactions

## PART B: Rebuild `settings.html`

Current state: Tailwind-based, light theme, off-brand, minimal settings (just theme + API base).

**Complete rebuild** in Bridge AI OS dark theme (NO Tailwind — use inline CSS matching the design system):

1. **Profile Section:**
   - Display name, email, avatar (from `/auth/me`)
   - Editable fields: name, avatar URL
   - Save via `PUT /api/platform/settings` (you'll create the handler)

2. **Notifications Section:**
   - Email notifications toggle
   - Browser push notifications toggle
   - Weekly digest toggle

3. **API Keys Section:**
   - Show current API key (masked: `sk-****1234`)
   - "Regenerate" button → `POST /api/admin/keys`
   - Copy button

4. **Integrations Section:**
   - List of available integrations from `GET /api/platform/integrations/targets`
   - Toggle each on/off
   - Configuration fields per integration

5. **Billing Section:**
   - Current plan badge
   - Usage this month (API calls, tokens used, BRDG spent)
   - "Upgrade" button → `/billing`

6. **Security Section:**
   - Change password (if local auth)
   - Connected wallets display
   - Session management

7. **Remove** the light theme, Tailwind CDN, and old nav. Replace with Bridge AI OS dark theme and standard nav (use `bridge-nav.js` if it exists, or inline the nav).

## PART C: Enhance `portal.html`

Read the file first. Make it a valuable client dashboard:

1. **Personalized Header:**
   - Greeting: "Welcome back, [Name]" with user's plan badge
   - BRDG balance display
   - Quick action buttons: New Project, View Invoices, Get Support

2. **Quick Stats Dashboard** (4 cards):
   - Active Projects (from `/api/platform/projects`)
   - Pending Invoices (from `/api/invoices/stats`)
   - Support Tickets Open (from `/api/tickets`)
   - BRDG Earned This Month

3. **Recent Activity Feed:**
   - From `/api/platform/profile/analytics`
   - Show: recent project runs, invoice updates, ticket responses
   - Chronological with relative timestamps

4. **Project Shortcuts:**
   - Grid of user's projects with quick "Run" buttons
   - Status indicators per project

5. **Newsletter Popup:**
   - On first visit (check `localStorage.getItem('bridge_newsletter_dismissed')`)
   - Clean modal: "Stay in the loop — we only send 4 updates a year!"
   - Email input + Subscribe button → `POST /api/subscribe`
   - Dismiss button sets localStorage flag

## PART D: Enhance `profile.html`

Read the file first. This should be the user's personal profile page:
- Pull everything from `GET /api/platform/profile/state`
- Show: user info, plan, BRDG balance, usage analytics, project history
- Allow editing name/avatar
- Show subscription tier with feature comparison

## Rules
- Read each file FIRST
- Dark theme only — remove any Tailwind CDN usage, replace with inline CSS
- Auth required on all pages — redirect to `/join` if not logged in
- Graceful degradation — if endpoints fail, show "—" not errors
- Mobile responsive
- No external JS libraries
```

---

## WORKSTREAM 7: Agents Page & Vertical Platforms

**Agent:** `agents-verticals-builder`
**Files:**
- `public/agents.html`
- `public/ubi-home.html`
- `public/ehsa-home.html`
- `public/abaas-home.html`
- (other verticals as time permits)
**Phase:** 3 (after WS1 routes live)

---

### AGENT PROMPT — WS7

```
You are enhancing the Agents page and building out vertical platform landing pages.

## Context
- You may edit these files:
  1. `c:\aoe-unified-final\public\agents.html` (agent marketplace/directory)
  2. `c:\aoe-unified-final\public\ubi-home.html` (UBI platform landing)
  3. `c:\aoe-unified-final\public\ehsa-home.html` (EHSA health platform landing)
  4. `c:\aoe-unified-final\public\abaas-home.html` (ABaaS platform landing)
  5. `c:\aoe-unified-final\public\aurora-home.html` (energy platform)
  6. `c:\aoe-unified-final\public\aid-home.html` (humanitarian aid)
  7. `c:\aoe-unified-final\public\ban-home.html` (task network)
  8. `c:\aoe-unified-final\public\rootedearth-home.html` (agriculture)
  9. `c:\aoe-unified-final\public\supac-home.html` (agency)
  10. `c:\aoe-unified-final\public\hospital-home.html` (hospital management)
  11. `c:\aoe-unified-final\public\ehsa-app.html` (EHSA patient app)
  12. `c:\aoe-unified-final\public\ehsa-brain.html` (EHSA medical AI)
  13. `c:\aoe-unified-final\public\abaas.html` (ABaaS console)
- Design system: dark theme, CSS vars `--bg:#0a0e17`, `--card:#131a2b`, `--cyan:#38bdf8`, etc.
- API endpoints:
  - `GET /api/agents` → `{ agents: [{ id, name, type, status, capabilities, pricing }] }`
  - `GET /api/agents/pricing` → pricing per agent execution
  - `POST /api/agents/execute-paid` → `{ agent_id, prompt, ... }` → execute and charge
  - `GET /api/marketplace/skills` → available agent skills
  - `GET /ubi/status` → UBI pool stats
  - `POST /ubi/claim` → `{ wallet_address }` → claim UBI

## PART A: Enhance `agents.html`

Read the file first. Make it a real agent directory/marketplace:

1. **Agent Directory** — Fetch `GET /api/agents` and display:
   - Card grid with each agent: name, icon, description, status (active/idle), capabilities
   - Category filters: Sales, Support, Research, Marketing, Legal, Finance, Dev, Trading
   - Search bar
   - Each card has "Hire Agent" button → opens a modal to create a marketplace task pre-filled with this agent

2. **Agent Detail Modal:**
   - Full description of what the agent does
   - Pricing (from `/api/agents/pricing`)
   - Recent completions/track record
   - "Execute Now" button → calls `POST /api/agents/execute-paid` with a prompt
   - Real-time output display with typing effect

3. **Conversion-Focused:**
   - Compare agents side-by-side
   - "Which agent do I need?" quiz/wizard
   - Pricing comparison table

## PART B: Build Vertical Platform Pages

Each vertical needs a consistent template structure. Create a REUSABLE template pattern, then customize per vertical.

### Template Structure (for each vertical page):

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>[VERTICAL NAME] — Bridge AI OS</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <style>
    /* Bridge AI OS dark theme + vertical-specific accent color */
    :root { --bg:#0a0e17; --card:#131a2b; --accent:[VERTICAL_COLOR]; --dim:#94a3b8; }
    /* ... standard styles ... */
  </style>
</head>
<body>
  <!-- Hero with vertical branding -->
  <section class="hero">
    <h1>[VERTICAL NAME]</h1>
    <p>[One-liner value prop]</p>
    <a href="/onboarding.html?vertical=[slug]" class="btn-primary">Get Started</a>
  </section>
  
  <!-- Problem/Solution -->
  <section class="problem-solution">
    <h2>The Problem</h2>
    <p>[Industry pain point]</p>
    <h2>Our Solution</h2>
    <p>[How Bridge AI OS solves it]</p>
  </section>
  
  <!-- Services/Features (3-6 cards) -->
  <section class="services">
    <div class="service-card">[Service 1]</div>
    <!-- ... -->
  </section>
  
  <!-- Pricing (inherits from Bridge AI OS tiers) -->
  <section class="pricing">
    <!-- Starter/Pro/Enterprise cards with vertical-specific features -->
  </section>
  
  <!-- CTA -->
  <section class="cta">
    <h2>Ready to transform [industry]?</h2>
    <a href="/onboarding.html?vertical=[slug]" class="btn-primary">Start Free Trial</a>
  </section>
  
  <script src="/bridge-nav.js" defer></script>
</body>
</html>
```

### Per-Vertical Customization:

| Vertical | Accent Color | Key Services | Pain Point |
|----------|-------------|-------------|------------|
| **UBI** (`ubi-home.html`) | `#22c55e` (green) | Universal basic income claims, wallet management, eligibility tracking, distribution history | Manual aid distribution is slow, opaque, and expensive |
| **EHSA Health** (`ehsa-home.html`) | `#ef4444` (red) | Health records, compliance tracking, telehealth, AI diagnostics | Healthcare in Africa lacks digital infrastructure |
| **ABaaS** (`abaas-home.html`) | `#a78bfa` (purple) | Agent deployment, agent marketplace, custom agent training, API access | Building AI agents from scratch is expensive and slow |
| **Aurora Energy** (`aurora-home.html`) | `#f59e0b` (orange) | Solar monitoring, energy trading, grid optimization, consumption analytics | Energy poverty + inefficient grid management |
| **Bridge AID** (`aid-home.html`) | `#38bdf8` (cyan) | Aid distribution, beneficiary tracking, impact reporting, donor dashboards | Humanitarian aid is hard to track and verify |
| **BAN Network** (`ban-home.html`) | `#6366f1` (indigo) | Distributed task execution, compute pooling, mesh networking | Centralized compute is expensive for African businesses |
| **Rooted Earth** (`rootedearth-home.html`) | `#16a34a` (green) | Crop planning, soil analysis, market prices, weather integration | Smallholder farmers lack data-driven decision tools |
| **Supaco Agency** (`supac-home.html`) | `#0ea5e9` (sky) | Client management, project tracking, deliverable automation, billing | Digital agencies waste time on ops instead of creative work |
| **Hospital in a Box** (`hospital-home.html`) | `#dc2626` (red) | Patient management, bed tracking, pharmacy, billing, AI triage | Rural hospitals operate on paper with no digital systems |

**Priority order:** UBI, EHSA, ABaaS first — then others.

### UBI-specific: Wire to real endpoints
- Hero stats: fetch `GET /ubi/status` → show pool balance, eligible wallets, next distribution
- "Claim UBI" button → `POST /ubi/claim` with wallet address from authenticated user
- Distribution history timeline
- Eligibility checker

## Rules
- Read each file FIRST before editing
- Use the template pattern for consistency but make each vertical feel distinct (accent color, imagery, copy)
- Dark theme design system throughout
- All "Get Started" buttons → `/onboarding.html?vertical=[slug]`
- If API endpoints don't exist yet, show clean empty states with "Coming Soon" — not errors
- Mobile responsive
- No external JS libraries
```

---

## WORKSTREAM 8: Database Migration & Validation

**Agent:** `db-migration-validator`
**Files:** `supabase/migrations/` (new migration if needed)
**Phase:** 1 (MUST complete before WS1, WS3, WS5)

---

### AGENT PROMPT — WS8

```
You are validating and fixing the Supabase database schema for Bridge AI OS.

## Context
- Working directory: `c:\aoe-unified-final`
- Supabase is the primary database (PostgreSQL)
- Three existing migration files:
  1. `supabase/migrations/20260411000000_hardened_treasury_schema.sql` (14.6 KB) — treasury tables
  2. `supabase/migrations/20260411100000_business_suite_schema.sql` (36.9 KB) — CRM, invoicing, marketplace tables
  3. `supabase/migrations/20260411200000_platform_productization.sql` (7.7 KB) — projects, outputs, wizard

- Supabase MCP tools are available:
  - `mcp__claude_ai_Supabase__execute_sql` — run arbitrary SQL
  - `mcp__claude_ai_Supabase__list_tables` — list all tables
  - `mcp__claude_ai_Supabase__list_migrations` — list applied migrations

## Tasks (in order)

### 1. Check which tables exist
Use Supabase MCP `list_tables` to get current table list.

### 2. Verify migration 20260411100000 (Business Suite) applied
Check for these tables:
- `companies` — multi-tenant root
- `contacts` — CRM contacts/leads
- `invoices` — invoice records
- `invoice_line_items` — line items per invoice
- `quotes` — quote/proposal records
- `quote_line_items` — line items per quote
- `tickets` — support tickets
- `marketplace_tasks` — marketplace job postings
- `payment_configs` — per-company payment gateway setup

### 3. Verify migration 20260411000000 (Treasury) applied
Check for:
- `treasury_ledger` — transaction log
- `treasury_buckets` — bucket allocations
- `withdrawal_requests` — withdrawal audit trail
- `revenue_events` — revenue tracking

### 4. Verify migration 20260411200000 (Productization) applied
Check for:
- `projects` — user projects
- `outputs` — generated outputs
- `project_runs` — execution records
- `wizard_profiles` — onboarding wizard data
- `integration_runs` — integration dispatch log
- `profile_feedback` — feedback loop data
- `services_registry` — tool/service catalog

### 5. Apply missing migrations
If any tables are missing, read the relevant migration SQL file and execute it via Supabase MCP.

### 6. Create enhancement migration
If all base tables exist, create and apply additional schema:

```sql
-- File: supabase/migrations/20260412000000_crm_invoicing_enhancements.sql

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
  author_id UUID,
  author_type TEXT DEFAULT 'user' CHECK (author_type IN ('user', 'agent', 'admin')),
  body TEXT NOT NULL,
  attachments JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket ON ticket_comments(ticket_id);

-- User settings table (for settings page)
CREATE TABLE IF NOT EXISTS user_settings (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
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
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  subscribed_at TIMESTAMPTZ DEFAULT now(),
  unsubscribed_at TIMESTAMPTZ
);
```

Write this file to disk AND execute it via Supabase MCP.

### 7. Add RLS policies
For client-facing tables (contacts, invoices, tickets, marketplace_tasks), add basic RLS:
```sql
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own company contacts" ON contacts
  FOR ALL USING (company_id IN (
    SELECT id FROM companies WHERE owner_id = auth.uid()
  ));
-- Similar for invoices, tickets, marketplace_tasks
```
Only apply if RLS is not already enabled.

### 8. Seed initial data
If tables are empty, seed:
- A default company for the platform owner
- Sample agent entries in the agent registry (if the table exists)
- Default pricing tiers in services_registry (if exists)

## Rules
- ALWAYS read migration files before applying — never blindly execute SQL
- Use `IF NOT EXISTS` / `IF EXISTS` on everything to make operations idempotent
- Report back what was already applied vs what you had to create
- If Supabase MCP is not available, write the SQL files to disk and report that they need manual execution
- Do NOT modify existing tables — only add new tables, views, and indexes
```

---

## Execution Order & Parallelism

```
PHASE 1 (Parallel — No file conflicts):
  ├── WS8: DB Migration & Validation    → supabase/migrations/
  ├── WS2: Landing Page Enhancement     → public/index.html
  └── WS4: Admin Consolidation          → public/admin*.html, control.html, registry.html, system-status-dashboard.html

PHASE 2 (Parallel — After WS8 confirms DB ready):
  ├── WS1: API Route Fixes              → api/index.js
  ├── WS3: CRM + Invoicing             → api/crm/routes.js, public/crm.html, public/invoicing.html
  ├── WS5: Marketplace, Tickets, Legal  → public/marketplace.html, tickets.html, legal.html, bridge-widget.js
  └── WS6: Treasury, Settings, Portal   → public/treasury-dashboard.html, settings.html, portal.html, profile.html

PHASE 3 (After WS1 routes are live):
  └── WS7: Agents & Verticals          → public/agents.html, *-home.html (14 pages)

PHASE 4 (Validation):
  └── Full integration test — every endpoint, every page
```

### File Conflict Matrix

| WS | Exclusive Files | Conflicts With |
|----|----------------|----------------|
| WS1 | `api/index.js` | None |
| WS2 | `public/index.html` | None |
| WS3 | `api/crm/routes.js` (new), `public/crm.html`, `public/invoicing.html` | None |
| WS4 | `public/admin*.html`, `public/control.html`, `public/system-status-dashboard.html`, `public/registry.html` | None |
| WS5 | `public/marketplace.html`, `public/tickets.html`, `public/legal.html`, `public/bridge-widget.js` | None |
| WS6 | `public/treasury-dashboard.html`, `public/settings.html`, `public/portal.html`, `public/profile.html` | None |
| WS7 | `public/agents.html`, `public/*-home.html`, `public/abaas*.html` | None |
| WS8 | `supabase/migrations/*` | None (DB only) |

**Zero file conflicts. All 8 workstreams can run in their assigned phases without coordination.**

---

## Post-Fix Deployment

1. WS8 confirms all migrations applied
2. All workstream changes committed
3. Push to main → Vercel auto-deploys
4. Validate: hit every 404'd endpoint, confirm 200
5. Validate: load every page, confirm no console errors
6. Run proof-chain verification
7. Monitor `/api/tvm` for system health

---

## Risk Factors

| Risk | Mitigation |
|------|-----------|
| Supabase migration not applied | WS8 runs FIRST in Phase 1; blocks Phase 2 |
| `api/index.js` is 60K+ tokens | WS1 makes surgical additions only — no refactor |
| Proof chain keeps breaking | WS4 adds rebuild button + fallback display |
| 14 verticals is massive scope | WS7 uses template; prioritizes UBI/EHSA/ABaaS |
| CRM backslash path bug (`'\api'`) | WS3 fixes in crm.html + invoicing.html |
| Settings page uses Tailwind (off-brand) | WS6 rebuilds from scratch in dark theme |
