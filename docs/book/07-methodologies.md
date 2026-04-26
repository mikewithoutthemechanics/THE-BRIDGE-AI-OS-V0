# 07 — Methodologies

_Last updated: 2026-04-17_

How work is done in this repo.

## Self-healing upgrade pipeline

Four-phase loop: **AUDIT → AUTO-REFACTOR → TEST → DEPLOY**, repeating while health score < 95% (src: `pipeline/PIPELINE.md:L1-L25`).

- **Audit** scans auth-service existence, `shared/` structure, seeded users, superadmin presence, referral init, frontend auth integration, session persistence (src: `pipeline/PIPELINE.md:L29-L35`).
- **Auto-refactor** creates missing `shared/`, seeds superadmin `ryanpcowan@gmail.com` (role: superadmin, plan: enterprise, credits: 999999), seeds default users, generates referral codes (src: `pipeline/PIPELINE.md:L38-L43`).
- **Evaluate** compares health score; production gate is ≥ 95%.

## Migration protocol

- All schema changes go through `supabase/migrations/*.sql`. File naming is `YYYYMMDDHHMMSS_description.sql` (src: directory listing).
- RLS: `auth.uid()` / `auth.role()` calls must be wrapped in `(SELECT …)` for InitPlan caching (src: `supabase/migrations/20260417020000_rls_initplan_wrap.sql:L1-L14`).
- Indexes added `CONCURRENTLY` cannot live inside Supabase's transaction wrapper — create manually from SQL editor on large tables (src: `supabase/migrations/20260417000000_tasks_market_perf.sql:L14-L16`).
- Hot-path queries should use RPCs (e.g. `bulk_claim_tasks`, `market_stats`) to collapse N+1 patterns (src: `supabase/migrations/20260417010000_bulk_claim_tasks.sql:L1-L14`).

## Deploy protocol (VPS)

1. `git pull` on `/var/www/bridgeai`.
2. `pm2 restart all` (src: `SESSION-HANDOFF.md` "Next Session Priorities").
3. Nginx managed via `scripts/update-nginx.sh`; never hand-edit the installed blocks (user memory).
4. All VPS services run from `/var/www/bridgeai/` post-2026-04-17 consolidation; `/opt/bridge-ai-os` is quarantined (user memory `reference_bridgeai_pm2_paths.md`).

## Deploy protocol (Vercel)

- `vercel.json` declares a single function `api/index.js` and static output from `public/`.
- `buildCommand: node build-static.js` runs pre-deploy to assemble static output.
- Headers + rewrites declared declaratively in `vercel.json`.
- Source: `vercel.json:L5-L13`.

## LLM fallback methodology

Provider order defined by `LLM_PROVIDER_ORDER=kilo,anthropic,openrouter,openai` (src: `.env.example:L56`). Client (`lib/llm-client.js`) walks the chain on failure (src: `SESSION-HANDOFF.md` "Key Architecture").

## Auth methodology

- User auth: JWT bearer in `localStorage('bridge_token')` and cookie. `GET /auth/me` resolves identity (src: `SESSION-HANDOFF.md`).
- Admin auth: `X-Admin-Token` header compared to `ADMIN_TOKEN` env var (src: `SESSION-HANDOFF.md`).
- Dual-auth pattern: routes that accept either JWT or admin token so admin-panel fetches don't break (src: `SESSION-HANDOFF.md` — fix log for `/api/treasury/reconcile`).
- SIWE (wallet) auth path uses `BRIDGE_SIWE_JWT_SECRET` over Linea RPC (src: `.env.example:L85-L87`).

## AI-agent protocol

- `HOW_TO_PROMPT_ALL_AIs.md` documents multi-laptop coordination prompts (src: root).
- `.claude/agents/book-of-knowledge.md` defines the BoK custodianship rules (this agent).
- `.claude/agents/librarian.md` defines the librarian that reads TVM.json and routes to chapters.

## Testing methodology

- Jest with `--testPathPattern=tests/` (src: `package.json:scripts.test`). Tests live under `tests/`.
- `scripts/health-check.js` runs operational health checks (src: `package.json:scripts.health`).
- `scripts/preflight.js` runs pre-launch checks (src: `package.json:scripts.preflight`).
- See `TESTING_GUIDE.md:L1-L30` for the superuser setup test matrix.

## Third-party verification methodology

Every metric on the Revenue Dashboard is independently verifiable. Three trust levels (src: `public/VERIFICATION.md:L10-L15`):

| Level | Definition | Verifier |
|-------|-----------|----------|
| Trustless (on-chain) | Read from public blockchain. | Anyone with RPC. |
| Hash-chain | SHA-256-chained rows (e.g. `audit_log`). | Anyone with API access. |
| Signed attestation | HMAC-SHA256. | Auditor with shared secret. |

Example: BRDG supply verified via `totalSupply()` on Linea contract `0x5f0541302bd4fC672018b07a35FA5f294A322947` (src: `public/VERIFICATION.md:L20-L36`).

## Commit convention

Sample recent commits show `type(scope): message` (e.g. `perf(tasks_market):…`, `fix(gateway):…`, `feat(auth):…`) (src: `git log` output in environment).

## Sources

- `pipeline/PIPELINE.md`
- `supabase/migrations/*.sql`
- `SESSION-HANDOFF.md`
- `.env.example`
- `package.json`
- `vercel.json`
- `public/VERIFICATION.md`
- `TESTING_GUIDE.md`
- `HOW_TO_PROMPT_ALL_AIs.md`
- `.claude/agents/book-of-knowledge.md`, `.claude/agents/librarian.md`
- User memory: `reference_bridgeai_pm2_paths.md`, `reference_bridgeai_vps.md`
