# 09 — Policies

_Last updated: 2026-04-17_

Security, access, data-handling, coding policies. Policies are quoted or tightly summarised from sources; source of truth remains the cited file.

## Authentication and session

### Token storage and verification

- User JWT stored in `localStorage('bridge_token')` and HTTP cookie; resolved by `GET /auth/me` (src: `SESSION-HANDOFF.md` "Key Architecture").
- Admin auth via `X-Admin-Token` header compared against the `ADMIN_TOKEN` env var (src: `SESSION-HANDOFF.md`; `.env.example:L64`).
- **Dual-auth policy**: admin-panel routes must accept either JWT or `X-Admin-Token` — historical bug: `/api/treasury/reconcile` was JWT-only and broke admin console until fixed (src: `SESSION-HANDOFF.md`).
- Secret rotation cadence: **every 90 days** (src: `.env.example:L59` comment).
- `JWT_SECRET` generation: `openssl rand -hex 48`; `BRIDGE_INTERNAL_SECRET`: `openssl rand -hex 16`; `BRIDGE_SIWE_JWT_SECRET`: `openssl rand -hex 32` (src: `.env.example:L60,L62,L87`).

### Super-admin override

> The platform now uses a canonical server-side identity constant for the super-admin account:
> ```js
> const SUPER_ADMIN_IDENTITY = Object.freeze({
>   email: 'ryanpcowan@gmail.com',
>   role: 'superadmin',
>   plan: 'infinite',
>   permissions: ['*'],
>   tenant: 'root',
> });
> ```

Source: `docs/SUPER_ADMIN_OVERRIDE_ARCHITECTURE.md:L5-L15`. Enforced by `withSuperAdminOverrides(user)` before token signing and before returning user payloads. Client-side guards in `public/auth-callback.html`, `public/bridge-auth.js` (`getPostLoginRoute`), `public/onboarding.html` (src: same file, L28-L32).

### Superuser list

Superusers verified via `GET /api/admin/check-access?user_email=<email>` + `GET /api/admin/superusers` + `POST /api/admin/notify-superuser`. Admin auth guard: `public/src/admin-auth.js` (src: `TESTING_GUIDE.md:L6-L16`).

## Row-level security

### Principles

- Every business-domain table has an RLS policy (src: `supabase/migrations/20260417020000_rls_initplan_wrap.sql`).
- Policies fall into four shapes: `service_role_all`, per-user `owner_id = auth.uid()`, company-scoped `IN (SELECT companies.id …)`, and service-only (src: same file + `20260411000000_hardened_treasury_schema.sql:L326-L328`).
- Performance: `auth.uid()` / `auth.role()` must be wrapped in `(SELECT …)` to elevate them to InitPlans (once per query, cached) (src: `20260417020000_rls_initplan_wrap.sql:L1-L14`).

## Payments

### PayFast IPN

- IPN endpoint `POST /payfast/notify` is rate-limited to max 30 per window (src: `server.js:L102`).
- Validation: signature + server-side ITN validate (src: `SESSION-HANDOFF.md`).

### Currency

- ZAR-aligned pricing: R0 (starter) / R499 (pro) / R2499 (enterprise) (src: `SESSION-HANDOFF.md`).

### Withdrawals

- `POST /api/admin/withdraw/authorize` and `POST /api/admin/withdraw/execute` both require `requireAdmin` (src: `server.js:L2325,L2338`).
- `admin_withdrawals` table persists authorised admin-initiated withdrawals (src: `supabase/migrations/20260411000000_hardened_treasury_schema.sql:L168`).

## Data handling

### ConsentVault OSINT stack principles

| Principle | Implementation |
|-----------|----------------|
| Explicit Consent | Signed consent receipts with cryptographic proof. |
| Purpose Limitation | Consent scope enforced in policy engine. |
| Data Minimization | Pre-defined data categories per consent. |
| Withdrawal Rights | Real-time revocation via self-service portal. |
| Transparency | Plain-language consent requests. |

Source: `consent-osint-stack/docs/policy.md:L14-L22`. Example consent types include `osint_collection` with `requires_verification=true` and `analytics` with `min_k_anonymity=5` (src: same file L28-L40).

### Audit chain

- `audit_log` is tamper-evident via SHA-256 hash-chain enforced by trigger `audit_hash_chain()` (src: `supabase/migrations/20260411000000_hardened_treasury_schema.sql:L179-L190`).
- Double-entry enforced by trigger `enforce_double_entry()` (src: same file, L81).

## HTTP security headers (Vercel)

Applied to every response from `/(.*)`:

> `X-Content-Type-Options: nosniff`; `X-Frame-Options: DENY`; `X-XSS-Protection: 1; mode=block`; `Referrer-Policy: strict-origin-when-cross-origin`; `Permissions-Policy: camera=(), microphone=(), geolocation=()`; `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`; `Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; … connect-src 'self' https://*.ai-os.co.za https://*.bridge-ai-os.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self';`

Source: `vercel.json:L14-L28`.

## Coding policies

- All new schema must ship as a dated file under `supabase/migrations/` (src: directory).
- Migrations that would run outside a transaction (`CREATE INDEX CONCURRENTLY`) must be run manually in the Supabase SQL editor and noted in the migration header (src: `supabase/migrations/20260417000000_tasks_market_perf.sql:L14-L16`).
- Hot paths use RPCs, not N+1 queries (src: `20260417010000_bulk_claim_tasks.sql:L1-L14`).
- Navigation uses `bridge-nav.js`; 41 pages still pending inclusion per the 2026-04-15 audit (src: `public/NAVIGATION_IMPLEMENTATION_PLAN.md:L3-L45`).
- Nginx `proxy_pass` must use `127.0.0.1` (user memory).
- PM2 apps share a `BASE` defaults object (max 50 restarts, 30s min_uptime, 1→16s backoff, 512M memory guard) (src: `ecosystem.config.js:L7-L23`).

## Sources

- `.env.example`
- `server.js`
- `vercel.json`
- `ecosystem.config.js`
- `supabase/migrations/20260411000000_hardened_treasury_schema.sql`
- `supabase/migrations/20260417020000_rls_initplan_wrap.sql`
- `supabase/migrations/20260417000000_tasks_market_perf.sql`
- `supabase/migrations/20260417010000_bulk_claim_tasks.sql`
- `docs/SUPER_ADMIN_OVERRIDE_ARCHITECTURE.md`
- `consent-osint-stack/docs/policy.md`
- `SESSION-HANDOFF.md`
- `TESTING_GUIDE.md`
- `public/NAVIGATION_IMPLEMENTATION_PLAN.md`
- User memory: `feedback_nginx_ipv4_upstream.md`
