# BridgeAI ENV Variable Matrix

**Source of truth:** [`config/env-matrix.json`](../config/env-matrix.json) (machine-readable)
**Validator:** `node scripts/env-matrix-validate.js [path/to/.env]`
**Generated:** 2026-04-19

360 variables across 18 concern categories, compiled from:

- All `.env*` files in `C:/aoe-unified-final`, `C:/aoe-unified-final-main`, `E:/BridgeAI/BridgeLiveWall`
- All `process.env.XXX` references across Node/JS
- All `os.getenv()` / `os.environ[]` references across Python (`backend/app/domains/*`)

## How to use this matrix

```bash
# Validate the live .env against the matrix
node scripts/env-matrix-validate.js .env

# CI mode (JSON output, exit code gates)
node scripts/env-matrix-validate.js .env --json

# Validate the currently loaded process.env
node scripts/env-matrix-validate.js
```

**Exit codes:** `0` = all required present + no weak secrets · `1` = missing required · `2` = weak-looking secret values · `3` = matrix file corrupt.

## Categories at a glance

| # | Category | Role | Count |
|---|----------|------|-------|
| 1 | 🔐 Auth & Sessions | JWT, admin tokens, internal secrets, keyforge | 44 |
| 2 | 🗄️ Supabase | **PRIMARY datastore** — Auth, storage, realtime | 4 |
| 3 | 🗄️ Postgres / Redis / Neo4j | Secondary stores + caching + graph | 22 |
| 4 | 🏦 Payments | Paystack (live), PayPal, PayFast, Stripe | 19 |
| 5 | 📧 Email / SMTP | Brevo, SMTP, SendGrid, Resend, Gmail | 25 |
| 6 | 🧠 AI / LLM Providers | Anthropic, OpenAI, OpenRouter, Kilo, Together, HF | 21 |
| 7 | 🔗 Web3 / Blockchain | Linea, Ethereum, Infura, BRDG contract | 12 |
| 8 | 🎙️ Voice / Audio / Music | ElevenLabs, Twilio SIP, local TTS | 7 |
| 9 | 🔬 Science / ML weights | Priority vector, drift thresholds, evolution budget | 28 |
| 10 | 📡 NeuroLink / BCI | Emotiv EEG integration | 5 |
| 11 | 💸 Economy / Treasury | Kill-switches, splits, withdrawal thresholds, FX | 23 |
| 12 | 🗺️ Sites / Domains / Routing | Hostnames, ports, proxy targets, CORS | 33 |
| 13 | 📡 Frequencies / Intervals | Polling intervals, rate limits, timeouts, TTLs | 23 |
| 14 | 🤝 Integrations & Webhooks | Slack, Discord, Telegram, Notion, GH, Google, CF | 44 |
| 15 | 📝 WordPress / CMS | 4-site WP integration (app passwords) | 13 |
| 16 | 🎨 Invoices / Branding | Company metadata stamped on invoices | 5 |
| 17 | ⚙️ Runtime Flags | NODE_ENV, DEBUG, LOG_LEVEL, test markers | 23 |
| 18 | 🚀 Backup / Infrastructure | Backup schedule, Docker registry, Grafana | 9 |

## Cross-cutting concerns

### Spatial awareness (WHERE services live)

Read from category **🗺️ Sites / Domains / Routing**:

- `DOMAIN` = `bridge-ai-os.com` (primary vhost)
- Ports: `3000` unified-server, `8080` bridge-gateway, `8000` super-brain, `5001` auth, `5002` terminal-proxy, `3001` god-mode-monitor, `8001` ban-engine (python), `7070` svg-engine, `4721` config-advisor, `7777` orchestra-core
- `CORS_ORIGINS` — must include every allowed frontend origin
- `SYSTEM_HOST` / `BRIDGE_CLOUD` / `BRIDGE_GATEWAY` — internal service discovery

### Frequencies (WHEN things happen)

Read from **📡 Frequencies / Intervals**:

- `HEALTH_CHECK_INTERVAL=30000` (30s) — PM2 heartbeat
- `CONFIG_ENGINE_ANOMALY_INTERVAL_MS=60000` — anomaly scan cadence
- `CONFIG_ENGINE_RECONCILE_INTERVAL_MS=300000` — reconcile loop (5min)
- `RATE_LIMIT_WINDOW_MS=60000` / `RATE_LIMIT_MAX=100` — public API rate limit
- `CRYPTO_RATE_LIMIT_MAX=10` — tight crypto endpoint limit
- `BRIDGE_CLAIM_TTL_SEC=300` — task claim TTL (5min)
- `SESSION_TIMEOUT=3600` (1hr)
- `KEYFORGE_EPOCH_SEC=3600` — key rotation cadence

### Music / Art / Science layers

- **🎙️ Music / Voice:** `ELEVENLABS_API_KEY` (voice synthesis), `TWILIO_*` (SIP/SMS), `LOCAL_TTS_URL` (offline fallback)
- **🎨 Art / Visual:** served via `svg-engine` on port 7070 (`SVG_ENGINE_PORT` in ecosystem.config.js)
- **🔬 Science:** ML priority-vector weights (`BRIDGE_PRIORITY_W_*`), drift thresholds, evolution budget, entropy circuit-breakers — all in `science_ml_weights` category

### UX / Routing

Read from **🗺️ Sites / Domains**:

- Frontend: `BRIDGE_FRONTEND_URL`, `BRIDGE_API_URL`, `BRIDGE_WS_URL`, `NEXT_PUBLIC_BASE_URL`, `VITE_CLERK_PUBLISHABLE_KEY`
- Backend proxy targets: `BRAIN_HOST`/`BRAIN_PORT`, `GATEWAY_PORT`, `AUTH_SVC`
- OAuth providers live in **🤝 Integrations**: Clerk, Google, GitHub, Azure

### Data management flow

```
Browser
  ↓ (Clerk/SIWE session)
bridge-gateway :8080 (nginx proxy target)
  ├─ /api/admin/*     → unified-server :3000 (writes)
  ├─ /api/treasury/*  → unified-server :3000 (reads)
  ├─ /api/*           → super-brain :8000 (catch-all)
  └─ /settings/*      → orchestra-core :7777 (new)
       ↓
   ┌────────────────────────────┐
   │  Supabase (primary)        │ ← SUPABASE_URL + SUPABASE_SERVICE_KEY
   │  Postgres (direct)         │ ← DATABASE_URL
   │  Redis (cache/queue)       │ ← REDIS_URL
   │  Neo4j (relationships)     │ ← NEO4J_URI
   │  Local JSON (settings)     │ ← data/settings.runtime.json
   └────────────────────────────┘
```

## Most-critical subset (top 20 — boot blockers + live-money gates)

| Rank | Key | Why it matters |
|------|-----|----------------|
| 1 | `JWT_SECRET` | All authenticated requests fail without it |
| 2 | `BRIDGE_SIWE_JWT_SECRET` | Wallet auth rejects all logins without it |
| 3 | `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` | Everything DB-backed errors out |
| 4 | `DATABASE_URL` / `POSTGRES_PASSWORD` | Python backend + migrations fail |
| 5 | `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | All AI features disabled |
| 6 | `PAYSTACK_SECRET_KEY` + `PAYSTACK_WEBHOOK_SECRET` | Live payments blocked + webhook forgery vector |
| 7 | `PAYPAL_CLIENT_SECRET` + `PAYPAL_WEBHOOK_ID` | PayPal settlements fail |
| 8 | `ADMIN_TOKEN` | `/api/admin/*` write endpoints reject all calls |
| 9 | `ORCHESTRA_ADMIN_TOKEN` + `ORCHESTRA_SESSION_SECRET` | Settings/admin UI sessions invalidate on reboot |
| 10 | `ADVISOR_SHARED_SECRET` | config-advisor returns 401 for all AI inquiries |
| 11 | `SECRETS_MASTER_KEY` | `lib/secrets.js` can't decrypt stored creds |
| 12 | `KEYFORGE_MASTER` | Key-rotation service can't derive epoch keys |
| 13 | `DEPLOYER_PRIVATE_KEY` / `TREASURY_PRIVATE_KEY` | ⚠️ WALLET KEYS — never expose |
| 14 | `BRIDGE_ALLOW_TREASURY_WRITES=0` | Kill-switch: leave at `0` unless disbursing |
| 15 | `CORS_ORIGINS` | Browser fetches cross-origin fail silently |
| 16 | `DOMAIN` | Wrong value breaks all absolute-URL generation |
| 17 | `BRIDGE_INTERNAL_SECRET` | Server ↔ brain internal calls 401 |
| 18 | `CFO_TOKEN` | Treasury write-path gate |
| 19 | `REDIS_URL` | Rate-limiter + job queue fall back to in-mem (no clustering) |
| 20 | `NODE_ENV=production` | Controls cookie Secure-flag + logging verbosity |

## See also

- [`AUTH_COVERAGE_AUDIT.md`](AUTH_COVERAGE_AUDIT.md) — how auth/middleware uses a subset of these secrets
- [`config/env-matrix.json`](../config/env-matrix.json) — machine source-of-truth
- [`scripts/env-matrix-validate.js`](../scripts/env-matrix-validate.js) — CI validator
