# Auth Coverage Audit — Gateway + Unified vs Python Backend

**Date:** 2026-04-19
**Context:** Phase 3 of VPS stabilization. This audit compares Node-side auth (gateway.js SENSITIVE_API + aoe-unified server.js allowlist middleware) against the Python backend's `require_jwt` coverage. Findings inverted once the unified server's allowlist design was surfaced — see section "Corrected understanding" below.

## The three layers (in request order)

Request flow for `GET https://bridge-ai-os.com/api/<x>`:

1. **nginx** (port 443) → strips TLS, forwards to gateway
2. **gateway.js** (port 8080) — has narrow `SENSITIVE_API` regex (live at `gateway.js:3306` on `hotfix/vps-emergency-2026-04-18`):

   ```javascript
   /^\/api\/(core\/(treasury\/(credit|debit)|snapshot|restore|halt|resume)|agents\/(pay|payroll|allocate))/
   ```

   Proxies dashboard paths (`/api/treasury/`, `/api/crm/`, ...) to `:3000` (aoe-unified server.js), not to Python.
3. **aoe-unified server.js** (port 3000) — `requireAuth` middleware at line 945 with **public-allowlist** approach. App-wide at line 1042: `app.all('/api/{*path}', requireAuth)`.
4. **Python backend** (port 8001 — BridgeLiveWall, NOT in the dashboard request path today) — domain routers use `Depends(require_jwt)`.

## aoe-unified public allowlist (server.js:946-1004)

Paths that BYPASS auth entirely (served anonymously):

```text
/api/health                /api/status              /api/uptime
/api/version               /api/platform/           /api/twin/
/api/siwe/                 /api/config-engine/health /api/uloe/health
/api/uloe/validate/        /api/hitl/stats          /api/orch/health
/api/revenue/status        /api/treasury            /api/mission/board
/api/projects              /api/skills              /api/marketplace/tasks
/api/twin/env-keys         /api/ubi/claim           /api/sensors/
/api/economy/              /api/analytics/          /api/tools
/api/intelligence/         /api/governance/         /api/pricing
/api/crm/                  /api/outreach/           /api/invoices
/api/marketing/            /api/compliance/         /api/ehsa/
/api/banks                 /api/defi/               /api/wallet/
/api/ledger                /api/founder/            /api/mail/
/api/subscriptions/        /api/credits             /api/user/
/api/live/                 /api/twins               /api/sdg/
/api/reputation/           /api/replication/        /api/secrets
/api/admin/                /api/notion/             /api/leadgen/
/api/wordpress/            /api/email/              /api/tvm/
/api/auth/login
```

## Corrected understanding

The original audit assumed "missing middleware = vulnerability." The actual design is:

- **aoe-unified server.js:** **allowlist-based** — global middleware 401s unknown `/api/*`, lets allowlisted prefixes through UNAUTHENTICATED. Each handler on an allowlisted prefix is then responsible for its own auth (via `requireAdmin`, `resolveUser()`, etc.), OR is deliberately anonymous.
- **Python backend:** **per-route** `Depends(require_jwt)` — opposite default.

Critical items on the allowlist that **look** public but depend on per-handler gates:

| Path | Allowlist? | Per-handler auth | Real exposure |
|------|-----------|------------------|---------------|
| `/api/secrets` (GET/POST/DELETE) | ✅ yes | ✅ `requireAdmin` (server.js:1044-1057) | Protected |
| `/api/admin/*` | ✅ yes | ? (needs audit) | **Unknown** |
| `/api/platform/*` | ✅ yes | ✅ `requireUser()` (per comment) | Protected |
| `/api/twin/*` | ✅ yes | ✅ `resolveUser()` (per comment) | Protected |
| `/api/treasury` | ✅ yes | ? Depends on handler | **Need audit** |
| `/api/crm/*` | ✅ yes | ? Depends on handler | **Need audit** |
| `/api/invoices` | ✅ yes | ? Depends on handler | **Need audit** |
| `/api/wallet/*` | ✅ yes | ? Depends on handler | **Need audit** |
| `/api/compliance/*` | ✅ yes | ? Depends on handler | **Need audit** |

## CRITICAL FINDINGS — `/api/admin/*` verified 2026-04-19

`/api/admin/` is on the aoe-unified public allowlist. Handler-by-handler results:

### Protected (inline auth) — OK

| Path | File:Line | Auth mechanism |
|------|-----------|----------------|
| `POST /api/admin/keys` | server.js:1946 | `requireAdmin` middleware |
| `POST /api/admin/withdraw/authorize` | server.js:2335 | `requireAdmin` |
| `POST /api/admin/withdraw/execute` | server.js:2348 | `requireAdmin` |
| `GET /api/admin/withdraw/audit` | server.js:2371 | `requireAdmin` |
| `GET /api/admin/users` | server.js:3160 | `requireSuperAdminUser` |
| `POST /api/admin/users/:id` | server.js:3184 | `requireSuperAdminUser` |
| `GET /api/admin/system-report` | server.js:3207 | `requireSuperAdminUser` |
| `GET /api/admin/ai-suggestions` | server.js:3261 | `requireSuperAdminUser` |
| `GET /api/admin/all-pages` | server.js:3337 | `requireSuperAdminUser` |
| `GET /api/admin/keys` | brain.js:924 | inline `BRIDGE_INTERNAL_SECRET` OR superadmin session |
| `POST /api/admin/withdraw/execute` | brain.js:3404 | inline `x-admin-token` + KeyForge token |
| `GET /api/admin/withdraw/audit` | brain.js:3458 | inline `x-admin-token` |
| `GET /api/admin/payouts` | brain.js:3468 | inline `x-admin-token` |
| `POST /api/admin/payouts/process` | brain.js:3477 | inline `x-admin-token` |

### VULNERABILITY — anonymous exposure

| Path | File:Line | Exposure | Severity |
|------|-----------|----------|----------|
| `GET /api/admin/superusers` | server.js:3095 | **Dumps entire SUPERUSERS list to any caller** | **CRITICAL** |
| `GET /api/admin/check-access?user_email=X` | server.js:3067 | Oracle: reveals whether any email is superuser + lists admin pages | **HIGH** |
| `POST /api/admin/notify-superuser` | server.js:3104 | Can send arbitrary notifications to superusers (message spam/phishing vector) | MEDIUM |

`/api/admin/superusers` is the loudest: an attacker scanning `bridge-ai-os.com/api/admin/superusers` gets back `{ ok: true, superusers: [...], count: N }` — a direct target list for phishing. No TODO or comment suggests this was intentional; it looks like a debug endpoint that was never gated.

### Recommended remediation (requires user OK)

```javascript
// server.js:3095 — add requireSuperAdminUser (matches /api/admin/users pattern)
app.get('/api/admin/superusers', requireSuperAdminUser, (req, res) => {
  res.json({ ok: true, superusers: SUPERUSERS, count: SUPERUSERS.length });
});

// server.js:3067 — add requireSuperAdminUser
app.get('/api/admin/check-access', requireSuperAdminUser, (req, res) => { /* ... */ });

// server.js:3104 — add requireSuperAdminUser
app.post('/api/admin/notify-superuser', requireSuperAdminUser, (req, res) => { /* ... */ });
```

All three handlers should adopt the same `requireSuperAdminUser` pattern already in use on neighboring admin routes (server.js:3160-3337).

## Real gap: handlers on the allowlist with no inline auth

These Node handlers are on the allowlist AND have no visible inline auth:

- `brain.js:487`: `app.get('/api/treasury/status', ...)` — returns full treasury state including on-chain balance, reserve, day-revenue. Allowlisted via `/api/treasury`. **Anonymous.**
- `brain.js:2030`: `app.get('/treasury/status', ...)` — returns buckets (ubi/treasury/ops/founder pools). **Anonymous.**

Plus everything under `/api/crm/*`, `/api/invoices*`, `/api/compliance/*`, `/api/wallet/*`, `/api/outreach/*` needs a handler-by-handler audit to confirm whether each enforces auth inline or serves anonymously.

## Recommendations

### Immediate (pre-authorization)

1. **Audit `/api/admin/*` handlers** — "admin" on a public allowlist is the loudest red flag. Grep every `app.(get|post|put|delete)\(['"]\/api/admin` and confirm inline `requireAdmin`.
2. **Document per-handler auth status** in each dashboard-facing endpoint. Currently there's no single source of truth for "is this anonymous or protected?"

### Needs user decision

3. **Narrow the allowlist:**
   - Replace `/api/treasury` blanket allow with `/api/treasury/summary` (redacted totals) only.
   - Require auth for `/api/crm/*`, `/api/invoices*`, `/api/compliance/*` unless a specific sub-path is identified as "dashboard anonymous".
   - Remove `/api/admin/` from the allowlist entirely — admin routes should fail closed.

4. **Extend gateway SENSITIVE_API regex** — belt-and-suspenders defense in case the unified server's allowlist regresses. Proposed (NEEDS USER OK):

   ```javascript
   const SENSITIVE_API = /^\/api\/((?:core\/)?treasury\/|core\/(?:snapshot|restore|halt|resume)|agents\/(?:pay|payroll|allocate)|invoices?\/|compliance\/|outreach\/|crm\/|identity\/|auth\/me|dex\/|ubi\/|marketplace\/(?:post|take|submit|bid)|keyforge\/|twins\/|admin\/|secrets)/;
   ```

### Structural

5. **BridgeLiveWall cutover** — once Python backend serves these paths directly (not via Node), `require_jwt` enforces the strict posture consistently. Until then, the split architecture makes every audit a moving target.

## Blast radius of narrowing the allowlist

**Will break:**
- Dashboard panels that currently fetch `/api/treasury`, `/api/crm/leads`, etc. without `Authorization` header. Every dashboard HTML (orchestra.html, admin-dashboard.html, settings-admin.html, unified executive dashboard) must be audited.
- External integrations polling these endpoints.
- Cron/systemd/PM2 internal jobs calling these from localhost.

**Pre-deploy checklist:**
1. Grep all client HTML + JS for fetches to allowlisted paths — confirm each attaches a JWT.
2. Canary with single path (e.g. `/api/crm/stats` first).
3. Monitor 401 rate in gateway + unified-server logs for 10min.
4. Rollback = revert server.js + `pm2 restart unified-server`.
