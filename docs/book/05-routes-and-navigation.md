# 05 — Routes and Navigation

_Last updated: 2026-04-17_

## Surfaces

| Surface | Handler | Count | Source |
|---------|---------|-------|--------|
| VPS gateway | `gateway.js` | 3 endpoints: `/`, `/block`, `/bans`, listens on port 3000 as written | src: `gateway.js:L19-L35` |
| Core API (VPS) | `server.js` | 172 `app.*()` handlers | src: `server.js` |
| Edge serverless | `api/index.js` via Vercel | `~3600 lines, all routes prefixed via vercel.json rewrites` | src: `vercel.json:L9`, `SESSION-HANDOFF.md` |
| Static HTML | `public/*.html` | 139 files | src: `ls public/*.html` |
| Documented routes | `public/ROUTE_MAP.md` | 98 documented routes (11 admin / 87 user) | src: `public/ROUTE_MAP.md:L3-L6` |

**Conflict:** `gateway.js` on the E: drive listens on **port 3000** (src: `gateway.js:L35`), while `ecosystem.config.js` starts `bridge-gateway` with `PORT=8080` (src: `ecosystem.config.js:L30-L42`). See chapter 14.

## Core server.js route map (selected)

| Method | Path | Auth | Source |
|--------|------|------|--------|
| POST | `/lead` | open | src: `server.js:L173` |
| POST | `/auto-close` | admin | src: `server.js:L194` |
| POST | `/create-payment`, `/create-payment-payfast` | open | src: `server.js:L208,L296` |
| GET | `/checkout` | open | src: `server.js:L226` |
| POST | `/api/checkout/confirm` | open | src: `server.js:L235` |
| POST | `/payfast/notify` | rate-limited | src: `server.js:L307`, `server.js:L102` |
| GET | `/payment/success`, `/payment/cancel` | open | src: `server.js:L386,L407` |
| POST | `/whatsapp` | open | src: `server.js:L429` |
| GET | `/api/registry/{kernel,network,security,federation,jobs,market,bridgeos,system,treasury}` | admin | src: `server.js:L458-L536` |
| GET | `/health`, `/api/health`, `/api/status` | open | src: `server.js:L552,L630,L1679` |
| GET | `/api/agents`, `/api/agents/pricing` | open | src: `server.js:L556,L610` |
| POST | `/api/agents/execute-paid`, `/api/agents/dispatch` | — | src: `server.js:L593,L2309` |
| GET | `/api/contracts`, `/api/economics`, `/api/full` | open | src: `server.js:L614-L658` |
| GET | `/skills/definitions`, `/api/skills`, `/api/tools` | open | src: `server.js:L679,L1765,L1761` |
| GET | `/api/logs` | admin | src: `server.js:L699` |
| GET | `/api/activity`, `/api/loop/status` | open | src: `server.js:L718,L822` |
| POST | `/api/loop/repair` | admin | src: `server.js:L833` |
| GET | `/share/:id/{context,history,metadata}` | open | src: `server.js:L875-L910` |
| GET/POST/DELETE | `/api/secrets[...]` | admin | src: `server.js:L1056-L1073` |
| POST | `/api/webhook/secrets-sync` | shared-secret | src: `server.js:L1073` |
| POST | `/api/notion/{init,sync}`; GET `/api/notion/stats` | admin | src: `server.js:L1108-L1126` |
| GET | `/api/treasury`, `/api/treasury/payments`, `/api/treasury/status`, `/api/treasury/ledger`, `/api/treasury/rails` | mixed | src: `server.js:L1138-L1725` |
| POST | `/auth/register`, `/auth/login` | open | src: `server.js:L1163,L1171` |
| POST | `/referral/claim` | open | src: `server.js:L1179` |
| POST | `/api/leadgen/auto-{prospect,nurture,close}` | admin | src: `server.js:L1189-L1210` |
| GET/POST | `/api/founder/{tax,balance}` | mixed | src: `server.js:L1314-L1345` |
| GET/POST | `/api/mail/{status,ping,test,send}` | mixed | src: `server.js:L1345-L1357` |
| GET/POST | `/api/email/{list,create,delete,forwarder,setup-bridge-profiles}` | mixed | src: `server.js:L1368-L1397` |
| GET/POST | `/api/wordpress/{status,data,preview,sync,sync/:site,users/:site}` | mixed | src: `server.js:L1428-L1460` |
| POST | `/api/pay` | open | src: `server.js:L1630` |
| GET/PUT/POST | `/api/tvm`, `/api/tvm/summary`, `/api/tvm/:topic`, `/api/tvm/:topic/{approve,reject,propose}` | open | src: `server.js:L1661-L1677` |
| GET | `/api/revenue/status` | open | src: `server.js:L1735` |
| GET | `/api/swarm/{agents,health}` | open | src: `server.js:L1746,L1751` |
| GET | `/api/analytics/summary` | open | src: `server.js:L1756` |
| GET | `/api/svg/graph.json`, `/api/svg/telemetry` | open | src: `server.js:L1822,L1837` |
| GET | `/api/mission/board`, `/api/projects` | open | src: `server.js:L1849,L1854` |
| GET | `/api/marketplace/{tasks,dex,wallet,skills,portfolio,stats}` | open | src: `server.js:L1866-L1914` |
| GET | `/api/twin/env-keys`, `/api/twins`, `/api/twins/leaderboard` | open | src: `server.js:L1920,L2017,L2024` |
| POST | `/api/admin/keys` | admin | src: `server.js:L1936` |
| POST | `/api/ubi/claim` | open | src: `server.js:L1944` |
| GET/PUT | `/api/user/settings` | open | src: `server.js:L1957,L1977` |
| GET | `/api/live/report`, `/api/sdg/metrics`, `/api/reputation/top`, `/api/replication/{status,nodes}`, `/api/sensors/mouse` | open | src: `server.js:L2010-L2062` |
| POST | `/api/demand/pump` | admin | src: `server.js:L2055` |
| GET | `/api/intelligence/{dashboard,model,opportunities,route}` | open | src: `server.js:L2067-L2261` |
| GET/POST | `/api/governance/{dashboard,proposals,vote,leaderboard,policies}` | mixed | src: `server.js:L2087-L2120` |
| GET | `/api/pricing` | open | src: `server.js:L2130` |
| GET/POST | `/api/invoices[...]` | open | src: `server.js:L2177-L2240` |
| GET | `/api/marketing/funnel`, `/api/compliance/status`, `/api/ehsa/dashboard`, `/api/brain/status` | open | src: `server.js:L2251-L2279` |
| POST | `/api/admin/withdraw/{authorize,execute}`; GET `/api/admin/withdraw/audit` | admin | src: `server.js:L2325-L2361` |
| GET/POST | `/api/banks`, `/api/banks/compound`, `/api/banks/trade`, `/api/banks/:id/history`, `/api/banks/status` | mixed | src: `server.js:L2445-L2536` |
| GET | `/api/wallet/balance`, `/api/defi/status` | open | src: `server.js:L2523,L2531` |
| GET/POST | `/api/economy/{loop-stats,run-cycle}` | mixed | src: `server.js:L2560-L2561` |
| POST | `/api/activation/{seed,process,won,lost}`; GET `/api/activation/pipeline` | open | src: `server.js:L2697-L2740` |
| POST/GET | `/api/lifecycle/{process,scores,events/:userId}` | open | src: `server.js:L2752-L2779` |
| GET | `/api/crm/leads`, `/api/crm/pipeline` | open | src: `server.js:L2814,L3021` |

## Gateway.js (as written on E: drive)

| Method | Path | Purpose | Source |
|--------|------|---------|--------|
| GET | `/` | Returns "ok". | src: `gateway.js:L20-L22` |
| POST | `/block` | Called by alert-engine, logs + returns "ok". | src: `gateway.js:L15-L18` |
| GET | `/bans` | Reads `bans` table from Supabase. | src: `gateway.js:L25-L35` |

Gateway also globally applies `auto-kill` middleware (src: `gateway.js:L12`). The git log commit `4371188` mentions "fix(gateway): route /api/twin and /api/bank to unified-server (3000)" — that routing is **not present** in the current E:-drive `gateway.js` (see chapter 14).

## Vercel edge rewrites

All `/api/*`, `/auth/*`, `/referral/*` go to `api/index.js`; pretty aliases: `/apps → /50-applications`, `/dashboard → /aoe-dashboard`, `/treasury-dash → /treasury-dashboard`, `/status → /system-status-dashboard`, `/ehsa → /ehsa-home`, `/supac → /supac-home`, `/ban → /ban-home`, `/ubi → /ubi-home`, `/aid → /aid-home`, `/aurora → /aurora-home` (src: `vercel.json:L69-L110`).

Other flat rewrites to `/api`: `/health`, `/live-map`, `/telemetry`, `/swarm/*`, `/econ/*`, `/ubi/status`, `/ubi/claim`, `/treasury/summary`, `/treasury/ingest`, `/teach/*`, `/ban-ultra.svg`, `/ban-live-console.svg`, `/output`, `/output/`, `/api/svg/*`, `/events/stream`, `/orchestrator/status`, `/billing`, `/ask`, `/api/l1/*`, `/api/l2/*`, `/api/l3/*`, `/api/treasury/*`, `/api/agents/dispatch`, `/api/agents/queue`, `/api/marketplace/tasks/*`, `/api/users`, `/api/events/recent` (src: `vercel.json:L80-L109`).

## Public HTML navigation

- 139 `.html` files under `public/`. 98 are documented in `public/ROUTE_MAP.md` (src: `public/ROUTE_MAP.md:L3`).
- 11 admin routes require `admin` role (src: `public/ROUTE_MAP.md:L14-L25`). Includes `/admin-command.html`, `/admin-revenue.html`, `/admin.html`, `/admin-withdraw.html`, `/admin-sitemap.html`, `/intelligence.html`, `/executive-dashboard.html`, `/aoe-dashboard.html`, `/bridge-audit-dashboard.html`, `/auth-dashboard.html`, `/settings.html` (dual role).
- 87 user routes across Core / Verticals / Business Suite / Economy & DeFi / Agents & System / Settings & Docs (src: `public/ROUTE_MAP.md:L36-L51`).
- Navigation implemented via `bridge-nav.js`. 41 pages still listed as missing `bridge-nav.js` as of 2026-04-15 (src: `public/NAVIGATION_IMPLEMENTATION_PLAN.md:L5-L45`).

## Auth bearer conventions

- User JWT in `localStorage('bridge_token')` + cookie → `GET /auth/me` (src: `SESSION-HANDOFF.md` "Key Architecture").
- Admin: `X-Admin-Token` header compared against `ADMIN_TOKEN` env (src: `SESSION-HANDOFF.md`; `.env.example:L64`).
- Dual-auth routes accept either JWT or `X-Admin-Token` (src: `SESSION-HANDOFF.md` — fix to `/api/treasury/reconcile`).

## Sources

- `gateway.js`
- `server.js`
- `vercel.json`
- `public/ROUTE_MAP.md`
- `public/PAGE_DOCUMENTATION.md`
- `public/NAVIGATION_IMPLEMENTATION_PLAN.md`
- `SESSION-HANDOFF.md`
- `ecosystem.config.js`
