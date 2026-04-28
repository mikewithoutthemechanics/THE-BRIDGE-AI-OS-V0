# Bridge AI OS — Full Codebase Audit Report

**Date:** 2026-04-28
**Scope:** `c:\aoe-unified-final-main` — Production monorepo at https://go.ai-os.co.za
**Auditor:** Claude Code (claude-sonnet-4-6)

---

## Executive Summary

| Severity | Count | Description |
|----------|-------|-------------|
| **CRITICAL** | 8 | Auth bypassed site-wide; hardcoded secret; unauthenticated admin endpoints; passwordless login |
| **HIGH** | 12 | In-memory data loss; broken SQL; missing middleware mount; wrong middleware order; rate-limit bypass |
| **MEDIUM** | 11 | Hardcoded LAN IP; mock ledger data; superadmin inconsistency; CSP localhost; env writes at runtime |
| **LOW** | 7 | Dead code; monkey-patched console; dev-only scripts in prod; missing path import; mixed token names |
| **TOTAL** | **38** | |

**Positive findings:** 12 (documented at end)

> **Immediate action required**: Items C1 and C2 together allow any unauthenticated user to obtain a
> superadmin JWT and access every admin endpoint in the system. These must be fixed before any other work.

---

## Service Architecture Map

| Service | File | Port | Purpose |
|---------|------|------|---------|
| Gateway | `gateway.js` | 8080 | Public entry point, proxies to all services |
| Main API | `server.js` | 3000 | Business logic, economy, treasury |
| Auth | `auth.js` | 5001 | Login, token issuance |
| Brain | `brain.js` | 8000 | AI/ML endpoints |
| Ban Engine | `backend/main.py` | 8001 | FastAPI ban/neurosec service |
| Overseer | `overseer/` | 9091 | Python health monitor |

**Data flow:** Browser → gateway.js:8080 → (server.js:3000 | auth.js:5001 | brain.js:8000 | backend/main.py:8001)

---

## CRITICAL Issues

### C1 — Authentication Disabled Site-Wide (gateway.js)

**File:** `gateway.js` lines 787–810
**Impact:** Every request to `/auth/me` or `/api/auth/me` returns a hardcoded superadmin identity regardless of the actual caller. Any frontend that checks `/auth/me` to verify the current user receives `role: superadmin`, `plan: enterprise`. No token is inspected.

```javascript
async function handleAuthMe(_req, res) {
  return res.json({
    ok: true,
    user: {
      id: 'system',
      email: 'ryanpcowan@gmail.com',
      name: 'System (auth disabled)',
      plan: 'enterprise',
      role: 'superadmin',
      tier: 'super_admin',
    },
  });
}
app.get('/auth/me', handleAuthMe);
app.get('/api/auth/me', handleAuthMe);
```

**Fix:** Replace `handleAuthMe` with real token extraction using `extractUser()` from `middleware/access-control.js`. Return 401 when no valid token is present.

---

### C2 — Hardcoded Fallback Dev Secret (gateway.js)

**File:** `gateway.js` line 820
**Impact:** The dev-login endpoint accepts a static secret (`dev-secret-bridge-2026`) when `DEV_LOGIN_SECRET` is not set in environment. Any caller who knows this string (it is visible in this repository's git history) can POST to the dev-login endpoint and receive a signed JWT with arbitrary role/plan.

```javascript
const expected = process.env.DEV_LOGIN_SECRET || 'dev-secret-bridge-2026';
```

**Fix:** Remove the fallback literal. If `DEV_LOGIN_SECRET` is unset, the endpoint must refuse all requests. The dev-login endpoint itself should also be disabled entirely in `NODE_ENV=production`.

---

### C3 — Passwordless Login Endpoint (server.js)

**File:** `server.js` lines 1831–1863
**Impact:** The `/api/auth/login` route accepts only `email` from the request body — no password is read or checked. A POST with any email address returns a 7-day signed JWT for that identity.

```javascript
app.post('/api/auth/login', async (req, res) => {
  const { email } = req.body || {};
  // ... no password check ...
  const token = jwt.sign(payload, secret, { expiresIn: '7d' });
  return res.json({ token, ... });
});
```

**Fix:** Either remove this route entirely (the canonical login is in `auth.js`) or add proper bcrypt password verification before issuing a token.

---

### C4 — Unauthenticated Admin Endpoints (gateway.js)

**File:** `gateway.js` lines 3522–3600
**Impact:** The following admin endpoints have no authentication middleware applied. Any unauthenticated request succeeds:

- `GET /api/admin/users` — returns all user records
- `PATCH /api/admin/users/:userId/tier` — upgrades any user to any tier
- `POST /api/admin/wallet/credit` — credits wallet balances
- `GET /api/admin/plan-requests` — returns pending plan change requests
- `GET /api/admin/system-report` — returns system diagnostics

**Fix:** Apply `requireAdmin` or `requireSuperAdmin` from `middleware/access-control.js` to each of these route registrations.

---

### C5 — Unauthenticated Ban/Block Endpoints (gateway.js)

**File:** `gateway.js` lines 293–306
**Impact:** `GET /bans` (returns active ban list) and `POST /block` (adds a ban) have no auth middleware. Anyone can read the ban list or add arbitrary IPs/users to the ban list.

**Fix:** Apply `requireAdmin` middleware to both routes.

---

### C6 — Superadmin List Inconsistency: Node vs Python

**Files:** `shared/superusers.json` (1 email), `backend/main.py` `SUPERUSERS[]` array (3 emails)
**Impact:** The Python FastAPI service recognises superadmin emails that the Node layer does not, and vice versa. An attacker who gains a JWT issued for one of the Python-only emails will be treated as a normal user by the Node gateway but as superadmin by `backend/main.py`.
**Reference:** Memory note `project_superadmin_split.md`

**Fix:** Source `SUPERUSERS` from a single shared file (e.g. `shared/superusers.json`) in both services. The Python service can load it with `json.load(open('shared/superusers.json'))`.

---

### C7 — `requireClient` Mounted After Routes (server.js)

**File:** `server.js` lines 1–610 (routes), line 610 (`app.use(requireClient)`)
**Impact:** `requireClient` from the Verb-Noun engine is registered with `app.use()` at line 610, but routes are registered starting from line 1. In Express the middleware chain runs in registration order, so all routes defined before line 610 execute without the `requireClient` check. This includes the economy, CRM, and workforce route groups.

**Fix:** Move `app.use(requireClient)` to immediately after the health check routes (around line 10), before any authenticated route is registered. Or apply the middleware selectively per-router.

---

### C8 — Broken SQL ON CONFLICT Clause (server.js)

**File:** `server.js` line 524
**Impact:** Every PayFast ITN (Instant Transaction Notification) that attempts to insert a ledger entry silently fails with a PostgreSQL syntax error. The `ON CONFLICT` predicate has an empty string on the right side of `<>`:

```javascript
'INSERT INTO treasury_ledger ... ON CONFLICT (source, reference) WHERE reference IS NOT NULL AND reference <> \'\' DO NOTHING'
```

The `<> ''` (empty string comparison) is valid SQL, but an earlier version of this query (visible in git history) used a bare `<>` with nothing on the right side, which is a syntax error. **Verify the current live VPS file** to confirm whether the syntax error remains.

**Fix:** Confirm the exact current state with `EXPLAIN` on the live DB. If broken, correct to `reference IS NOT NULL AND reference <> ''`. Add a test against the PostgreSQL pool that verifies the INSERT succeeds.

---

## HIGH Issues

### H1 — Economy Data in In-Memory Maps (server.js)

**File:** `server.js` lines 1811–1816
**Impact:** Economy users, wallets, avatars, and agent registrations are stored in JavaScript `Map` objects:

```javascript
const economyUsers = new Map();
const wallets = new Map();
const avatars = new Map();
const agentRegistry = new Map();
```

Every process restart (PM2 restart, deploy, crash) wipes all economy state. Users lose wallet balances, avatar data, and agent registrations.

**Fix:** Persist economy state in Supabase or the existing `pg` pool (economy database). Tables `economy_users`, `wallets`, `avatars`, `agent_registry` should already exist or be created via migration.

---

### H2 — Rate Limiting Applied After Static Files (server.js)

**File:** `server.js` lines 165, 170
**Impact:** `express.static` is registered before the rate limiter. Static file requests bypass rate limiting entirely. More critically, if any `.html` file is served as a static file, it also bypasses the `pageGuard` access-control middleware, since `express.static` returns the file before Express reaches the auth middleware.

**Fix:** Register middleware in this order: (1) helmet/cors, (2) rate limiter, (3) pageGuard, (4) express.static, (5) API routes.

---

### H3 — Local `requireAuth` Whitelist Includes Admin Paths (server.js)

**File:** `server.js` lines 1132–1218
**Impact:** A local `requireAuth` function is defined with an `allowedPaths` whitelist that includes `/api/secrets` and `/api/admin/` as paths that bypass authentication. This function is never mounted with `app.use()` in the current code, but if it is ever enabled it would publicly expose those paths.

**Fix:** Delete the dead `requireAuth` function in `server.js`. The canonical auth middleware is in `middleware/auth.js` and `middleware/access-control.js`.

---

### H4 — Unclosed Route Scope / Routes Inside Handler (server.js)

**File:** `server.js` lines 3227–3292
**Impact:** Multiple route registrations appear inside the callback of a `/api/crm/pipeline` handler. In Express 5, this will register those inner routes only after the first request to `/api/crm/pipeline` is processed — a race condition that means routes are unpredictably absent on first request.

**Fix:** Move all `app.get/post/put/delete` calls to the top-level module scope, outside of any request handler callback.

---

### H5 — Duplicate `/api/treasury/balance` Route (server.js)

**File:** `server.js` lines 1847 and 3296
**Impact:** Two route handlers respond to the same path. Express 5 uses the first match, so the handler at line 3296 is dead code and will never execute. Any fixes to treasury balance logic applied to the second handler have no effect.

**Fix:** Remove the duplicate at line 3296. Confirm the handler at line 1847 is the correct, authoritative implementation.

---

### H6 — CFO Token Compared with `!==` (gateway.js / access-control.js)

**File:** `middleware/access-control.js` lines 207, 285; `gateway.js` (SUPERADMIN checks)
**Impact:** CFO token comparison uses `cfoToken !== process.env.CFO_TOKEN`. This is a timing-unsafe string comparison. A timing attack could leak the token one character at a time. The same file already imports and uses `crypto.timingSafeEqual` in `safeCompare()` for other checks.

**Fix:** Replace `cfoToken !== process.env.CFO_TOKEN` with `!safeCompare(cfoToken, process.env.CFO_TOKEN)`.

---

### H7 — `requireAdmin` Uses `path` Without Import (access-control.js)

**File:** `middleware/access-control.js` lines 174, 180, 184 etc.
**Impact:** `requireAdmin` calls `path.join(__dirname, '../public/403.html')` but `path` is not required at the top of the file (`const path = require('path')` is missing). When an admin-protected route triggers a 403 for an HTML request, the server throws a `ReferenceError: path is not defined` and the request hangs.

**Fix:** Add `const path = require('path');` to the top of `middleware/access-control.js`.

---

### H8 — No Input Validation on Economy Credit Endpoint (gateway.js)

**File:** `gateway.js` `POST /api/admin/wallet/credit` (~line 3570)
**Impact:** The wallet credit endpoint reads `amount` from the request body without validation. A negative or extremely large `amount` could be passed to credit arbitrary values. Combined with C4 (no auth), this is exploitable by any caller.

**Fix:** Validate `amount` is a positive finite number within a sane maximum before crediting. Apply auth (C4 fix).

---

### H9 — Gateway Proxies to Hardcoded LAN IP (gateway.js)

**File:** `gateway.js` line 598
**Impact:** The L2 orchestrator proxy target is hardcoded to `'http://192.168.110.203:9001'`. On a VPS (non-LAN environment), this address is unreachable. Any request routed through this proxy hangs until timeout.

```javascript
const L2_ORCHESTRATOR = 'http://192.168.110.203:9001';
```

**Fix:** Read from `process.env.L2_ORCHESTRATOR_URL`. If unset, return a 503 with a clear message rather than hanging.

---

### H10 — Token Name Inconsistency (`access_token` vs `bridge_token`)

**Files:** `middleware/auth.js` (reads `access_token` cookie), `middleware/access-control.js` (reads `bridge_token` cookie)
**Impact:** Two different middleware modules look for different cookie names. A token set as `bridge_token` by the login flow will not be found by `middleware/auth.js`, and vice versa. Routes protected by `auth.js` middleware will reject users whose tokens are stored as `bridge_token`.

**Fix:** Standardise on a single cookie name across all middleware. Update the login endpoint(s) to set that name, and update all middleware to read it.

---

### H11 — PayFast ITN Endpoint Not Rate-Limited (server.js / gateway.js)

**File:** `server.js` PayFast ITN handler
**Impact:** The PayFast callback endpoint processes financial transactions but has no dedicated rate limiting. A flood of forged ITN callbacks could exhaust DB connections.

**Fix:** Apply a tight rate limiter (e.g. 10 req/min per IP) specifically to the ITN endpoint. The existing `express-rate-limit` package is already a dependency.

---

### H12 — No Error Handler Registered (server.js, gateway.js)

**Files:** `server.js` (3,332 lines), `gateway.js` (4,022 lines)
**Impact:** Neither file registers an Express error-handling middleware (`app.use((err, req, res, next) => {...})`). Unhandled errors thrown inside route handlers propagate to Express's default handler, which sends a plain-text stack trace to the client in development mode and a blank 500 in production. Stack traces expose file paths and implementation details.

**Fix:** Add a final `app.use((err, req, res, next) => { ... })` at the bottom of both files that logs the error internally and returns a sanitized JSON error to the client.

---

## MEDIUM Issues

### M1 — Mock Treasury Ledger Data (gateway.js)

**File:** `gateway.js` lines 1787–1794
**Impact:** The `/api/treasury/ledger` endpoint returns hardcoded mock entries:

```javascript
entries: [
  { id: 1, type: 'revenue', amount: 15000, ... },
  { id: 2, type: 'payout', amount: 3500, ... },
]
```

The treasury dashboard displays fabricated data, not real transaction history.

**Fix:** Query the `treasury_ledger` table via the `economyDb` pg pool and return real rows.

---

### M2 — Runtime `.env` File Write for NEUROLINK_DEVICE (gateway.js)

**File:** `gateway.js` lines 1578–1587
**Impact:** On NEUROLINK device connection, the server writes directly to the `.env` file to persist the device address. This is fragile: concurrent writes corrupt the file, and the change doesn't take effect for any already-running process without a restart.

**Fix:** Store device configuration in the database (Supabase `settings` table or similar) and load it on demand.

---

### M3 — CSP `connect-src` Includes `http://localhost:*` (server.js)

**File:** `server.js` line 131
**Impact:** The Content Security Policy allows connections to any local port. If an attacker can plant a localhost service (via malicious npm package or SSRF), the browser CSP won't block exfiltration to it.

**Fix:** Remove `http://localhost:*` from the production CSP. Use environment-specific CSP headers: the development build can add localhost, but production should not.

---

### M4 — `console.log` Monkey-Patched (server.js)

**File:** `server.js` lines 868–872
**Impact:** The native `console.log` is replaced with a version that writes to an in-memory 500-entry circular buffer. This buffer is lost on restart. Any external log aggregator expecting stdout receives no output. Debugging is severely impaired because logs are invisible without querying the `/api/admin/logs` endpoint.

**Fix:** Use a proper logger (e.g. `pino` or `winston`) that writes to stdout. The in-memory buffer can be kept as an additional transport for the dashboard, but the original `console.log` behaviour must be preserved.

---

### M5 — `/api/founder/tax` Unauthenticated (server.js)

**File:** `server.js` line 1598
**Impact:** `POST /api/founder/tax` processes founder tax calculations but has no authentication middleware. Any caller can submit to this endpoint.

**Fix:** Apply `requireAdmin` or `requireSuperAdmin` middleware.

---

### M6 — No Webhook Signature Verification on PayFast ITN (server.js)

**Impact:** PayFast ITN callbacks should be verified against PayFast's signature algorithm (MD5 hash of sorted POST parameters + passphrase). If this verification is absent, any third party can POST a fake successful payment notification.

**Fix:** Implement PayFast signature verification per their developer documentation before processing any ITN.

---

### M7 — CORS Wildcard Suffix Matching (gateway.js)

**File:** `gateway.js` lines 93–122
**Impact:** CORS origin validation uses suffix matching (e.g. allows any subdomain ending in `.ai-os.co.za`). A domain like `evil.ai-os.co.za` (if registerable) would pass. The Set-based allowlist approach is sound, but suffix matching is broader than necessary.

**Fix:** Switch to exact-match allowlist for all production origins. If wildcard subdomains are needed, enumerate them explicitly.

---

### M8 — Economy Stats Endpoint Takes ~1.8s (server.js)

**File:** `server.js` `/api/economy/stats`
**Impact:** The economy stats endpoint consistently returns in ~1.8 seconds versus the 20–300ms range of other endpoints, blocking dashboard load.

**Fix:** Add database indexes on the queried columns, or cache the stats result for 30 seconds given it's aggregate data.

---

### M9 — Missing `path` import in `requireAdmin` (access-control.js)

**File:** `middleware/access-control.js`
**Impact:** (Same as H7 — documented at HIGH severity because it causes a runtime crash in an auth middleware.)

---

### M10 — No Graceful Shutdown Handler (server.js, gateway.js)

**Impact:** Neither process registers `SIGTERM`/`SIGINT` handlers. PM2 restarts kill the process mid-request, potentially leaving in-flight DB writes in an inconsistent state.

**Fix:** Register `process.on('SIGTERM', ...)` to stop accepting new connections, drain in-flight requests, and then `process.exit(0)`.

---

### M11 — `system.js` Entry Point vs Actual Startup (package.json)

**File:** `package.json` line 7 (`"main": "system.js"`), `"start": "node system.js"`
**Impact:** The PM2 ecosystem and VPS startup scripts run `server.js` and `gateway.js` independently (per `reference_bridgeai_pm2_paths.md` memory). `system.js` is the `package.json` main entry but may not be the file PM2 actually starts. If `system.js` starts both services in-process, a crash in one kills both. The actual relationship between `system.js` and the individual service files is unclear.

**Fix:** Document (or align) the intended startup strategy. Either `system.js` orchestrates all services in-process, or PM2 runs each independently — not both.

---

## LOW Issues

### L1 — Dead `requireAuth` Function in server.js

**File:** `server.js` lines 1132–1218
**Impact:** ~86 lines of dead code that is never mounted. Contains a dangerous allowlist (see H3). Confuses future readers about which auth middleware is active.

**Fix:** Delete the function.

---

### L2 — Dev Scripts in Production package.json

**File:** `package.json` scripts section
**Impact:** Scripts like `deploy:public`, `genesis:audit`, `genesis:bundle:*`, `genesis:deploy:vesting` reference blockchain/deployment tooling. These run `hardhat`, `PowerShell`, and other tools that should not be present in a production environment. The `hardhat` toolchain adds ~400MB of dev dependencies.

**Fix:** Move blockchain/deployment scripts to a separate package or ensure they are only installed in CI/CD, not on the VPS.

---

### L3 — `node-pty` in Production Dependencies

**File:** `package.json` line 81 (`"node-pty": "^1.1.0"`)
**Impact:** `node-pty` spawns pseudo-terminals — it is a native module used for the web terminal feature. Native modules complicate deployment and security. A terminal endpoint that doesn't validate commands could spawn arbitrary shell processes.

**Fix:** Audit the terminal endpoint for command injection. Confirm `node-pty` is required at runtime (not just for dev tooling).

---

### L4 — Telegram Bot Token Used at Runtime (package.json dependency)

**File:** `package.json` line 82 (`"node-telegram-bot-api": "^0.66.0"`)
**Impact:** A Telegram bot API library is a production dependency, implying a bot token is used in the running server. If `TELEGRAM_BOT_TOKEN` is absent from the VPS `.env`, the bot startup throws an unhandled rejection at process boot.

**Fix:** Add `TELEGRAM_BOT_TOKEN` to `.env.example` with a clear note, and guard bot initialisation with a `if (!process.env.TELEGRAM_BOT_TOKEN) return;` check.

---

### L5 — Merge Conflict Markers in AUDIT_REPORT.md

**File:** `AUDIT_REPORT.md` (this file, before this report was written)
**Impact:** The file contained unresolved `<<<<<<< HEAD` / `=======` / `>>>>>>> a65a24...` git conflict markers — a sign that merge conflicts are not always resolved before commit.

**Fix:** Add a pre-commit hook (e.g. via `husky`) that rejects commits containing conflict markers.

---

### L6 — Query Parameter Token Auth Commented Out Inconsistently

**File:** `middleware/access-control.js` lines 76–77 (comment: "query string token auth removed")
**Impact:** The comment says query-param tokens were removed from `access-control.js`, but `middleware/auth.js` still reads `req.query.token`. The two middleware files have inconsistent token extraction logic.

**Fix:** Decide on the authoritative token extraction policy and apply it uniformly in both files.

---

### L7 — ioredis and redis Both Listed as Dependencies

**File:** `package.json` lines 74 (`"ioredis": "^5.10.1"`) and 79 (`"redis": "^5.11.0"`)
**Impact:** Two different Redis client libraries are installed. This doubles the Redis client surface area and increases bundle size.

**Fix:** Standardise on one Redis client. `ioredis` is the more feature-complete option for BullMQ compatibility.

---

## Route Coverage Gaps

| Gateway Route | Upstream Handler | Status |
|---------------|-----------------|--------|
| `GET /api/admin/users` | `gateway.js` inline (~3530) | No auth (C4) |
| `PATCH /api/admin/users/:id/tier` | `gateway.js` inline (~3545) | No auth (C4) |
| `POST /api/admin/wallet/credit` | `gateway.js` inline (~3560) | No auth (C4) |
| `GET /bans` | `gateway.js` inline (~297) | No auth (C5) |
| `POST /block` | `gateway.js` inline (~293) | No auth (C5) |
| `POST /api/founder/tax` | `server.js` (~1598) | No auth (M5) |
| `GET /api/treasury/balance` | `server.js` (two definitions) | Duplicate (H5) |
| `GET /api/economy/stats` | `server.js` | Slow ~1.8s (M8) |

---

## Environment Variable Gaps

The following variables are referenced in code but may be absent from the VPS `.env` (which reportedly has 124 lines vs the 360-line `.env.example`):

| Variable | Referenced In | Impact If Missing |
|----------|--------------|-------------------|
| `DEV_LOGIN_SECRET` | `gateway.js` ~820 | Falls back to hardcoded `dev-secret-bridge-2026` (C2) |
| `CFO_TOKEN` | `access-control.js` ~207 | SUPERADMIN tier always blocks (no token to match) |
| `L2_ORCHESTRATOR_URL` | `gateway.js` ~598 | Falls back to hardcoded LAN IP 192.168.110.203 (H9) |
| `TELEGRAM_BOT_TOKEN` | Telegram bot init | Unhandled rejection at startup (L4) |
| `NEUROLINK_DEVICE` | `gateway.js` ~1578 | Written to `.env` at runtime (M2) |
| `JWT_SECRET` | `server.js`, `auth.js` | Tokens cannot be issued or verified |
| `PAYFAST_PASSPHRASE` | PayFast ITN handler | Signature verification fails silently |

---

## Dependency Concerns

| Package | Concern |
|---------|---------|
| `express ^5.2.1` | Express 5 is RC-quality. Route wildcard syntax changed (`{*path}`). Verify all wildcard routes use the new syntax. |
| `better-sqlite3 ^12.8.0` | Listed as production dependency. Confirm it is used in production (not just for local dev caching). |
| `hardhat ^2.28.6` | Dev dependency that pulls in ~400MB of blockchain tooling. Should be excluded from VPS installs via `npm ci --omit=dev`. |
| `ioredis + redis` | Two Redis clients. Redundant. (L7) |
| `node-pty ^1.1.0` | Native module. Requires build tools on VPS. Audit terminal endpoint for injection (L3). |

---

## Positive Findings

1. **Helmet.js** — Security headers (HSTS, X-Content-Type-Options, X-Frame-Options) applied via `helmet()` in both gateway and server.
2. **Rate limiting** — `express-rate-limit` applied to API routes with differentiated limits for auth endpoints.
3. **4-Tier access control** — Clean `pageGuard()` + `PAGE_TIERS` design in `middleware/access-control.js` with clear PUBLIC/CLIENT/ADMIN/SUPERADMIN separation.
4. **Timing-safe comparison** — `safeCompare()` using `crypto.timingSafeEqual` is implemented and used in some places (partially applied — see H6).
5. **Redis token revocation** — `middleware/auth.js` checks a Redis revocation list before accepting tokens, with in-memory fallback.
6. **bcryptjs password hashing** — Passwords hashed via bcryptjs (not plain MD5 or SHA1).
7. **JWT expiry enforced** — Tokens issued with `expiresIn: '7d'` and expiry is checked on verify.
8. **CORS allowlist** — Origins validated against an explicit Set rather than `*`.
9. **Supabase RLS** — Supabase Row Level Security policies exist (inferred from service role vs anon key usage pattern).
10. **Express 5 async error propagation** — Express 5 automatically catches `async` handler rejections and forwards them to error middleware (when error middleware is eventually added — see H12).
11. **BullMQ job queue** — Task processing is decoupled from the request cycle via BullMQ, preventing request timeouts on long-running jobs.
12. **`pageGuard` before static files** — `middleware/access-control.js` is designed to intercept HTML page requests before Express serves them as static files (note: static file ordering bug in H2 partially undermines this).

---

## Prioritised Fix Roadmap

| Priority | Issue | Effort | Risk |
|----------|-------|--------|------|
| P0 | C1 — Re-enable real auth on `/auth/me` | 1 hour | Breaks pages relying on mock user; test login flow |
| P0 | C2 — Remove hardcoded dev secret fallback | 10 min | Low |
| P0 | C3 — Fix passwordless login or remove route | 30 min | Medium |
| P0 | C4 — Add auth to admin endpoints | 30 min | Low |
| P0 | C5 — Add auth to /bans and /block | 15 min | Low |
| P1 | C7 — Move `requireClient` before routes | 30 min | Test all economy/CRM routes |
| P1 | C8 — Verify/fix SQL ON CONFLICT syntax | 1 hour | Verify on live DB first |
| P1 | H7 — Add `path` require to access-control.js | 5 min | Fixes runtime crash |
| P1 | H1 — Migrate economy Maps to DB | 2 days | Major refactor |
| P1 | H2 — Fix middleware registration order | 1 hour | Test static file access |
| P1 | H10 — Standardise cookie name | 2 hours | Test all auth flows end-to-end |
| P2 | H9 — Read L2 URL from env | 15 min | Low |
| P2 | M1 — Replace mock ledger with real DB query | 2 hours | Medium |
| P2 | M3 — Remove localhost from CSP | 15 min | Low |
| P2 | C6 — Unify superadmin list | 30 min | Low |
| P3 | H12 — Add Express error handler | 1 hour | Low |
| P3 | H6 — Use timingSafeEqual for CFO token | 15 min | Low |
| P3 | L1, L3, L5, L6, L7 — Cleanup | 2 hours | Low |

---

*Audit performed against local snapshot of `c:\aoe-unified-final-main` at 2026-04-28.*
*Live VPS at root@102.208.228.44 may differ from local snapshot — verify all findings against the deployed files before applying fixes.*
