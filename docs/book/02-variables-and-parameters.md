# 02 — Variables and Parameters

_Last updated: 2026-04-17_

Environment variables, port bindings, and tunables. Authoritative sample lives in `.env.example`.

## Server / runtime

| Name | Default | Purpose | Source |
|------|---------|---------|--------|
| `PORT` | 3000 | Main server bind port. | src: `.env.example:L2` |
| `NODE_ENV` | development | Node environment flag. | src: `.env.example:L3` |
| `CONTAINERX_PORT` | 3001 | ContainerX service port. | src: `.env.example:L6` |
| `PORT_MAPPER_PORT` | 3999 | Port-mapper service. | src: `.env.example:L7` |
| `BRAIN_PORT` | 8000 | Super-brain service port. | src: `ecosystem.config.js:L66` |
| `AUTH_PORT` | 5001 | Auth service port. | src: `ecosystem.config.js:L79` |
| `TERMINAL_PROXY_PORT` | 5002 | Terminal proxy port. | src: `ecosystem.config.js:L94` |
| `SVG_ENGINE_PORT` | 7070 | SVG engine port. | src: `ecosystem.config.js:L140` |
| `BRIDGE_API_BASE` | http://localhost:8000 | Base URL SVG engine uses to reach brain. | src: `ecosystem.config.js:L141` |
| `BAN_PYTHON` | `/usr/bin/python3` | Python binary for BAN engine. | src: `ecosystem.config.js:L117` |
| `BAN_CWD` | `/var/www/bridgeai` | BAN working directory on VPS. | src: `ecosystem.config.js:L119` |

## Supabase / Postgres

| Name | Purpose | Source |
|------|---------|--------|
| `SUPABASE_URL` | Project URL. | src: `.env.example:L10` |
| `SUPABASE_SERVICE_KEY` | Service-role key. | src: `.env.example:L11` |
| `SUPABASE_ANON_KEY` | Public anon key. | src: `.env.example:L12` |
| `DATABASE_URL` | Postgres fallback DSN. | src: `.env.example:L15` |

## Mail (SMTP + relays)

| Name | Purpose | Source |
|------|---------|--------|
| `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`/`SMTP_FROM`/`SMTP_FROM_NAME`/`SMTP_SECURE`/`SMTP_TLS_REJECT_UNAUTHORIZED` | Primary SMTP. | src: `.env.example:L18-L26` |
| `BREVO_SMTP_USER`/`BREVO_SMTP_KEY`/`BREVO_FROM`/`BREVO_FROM_NAME` | Brevo relay. | src: `.env.example:L29-L32` |
| `GMAIL_USER`/`GMAIL_APP_PASS` | Gmail fallback. | src: `.env.example:L35-L36` |

## Payments

| Name | Purpose | Source |
|------|---------|--------|
| `PAYFAST_MERCHANT_ID`/`MERCHANT_KEY`/`PASSPHRASE` | PayFast credentials. | src: `.env.example:L43-L45` |
| `PAYFAST_NOTIFY_URL` / `RETURN_URL` / `CANCEL_URL` | PayFast callbacks. | src: `.env.example:L46-L48` |

## AI providers (routed via fallback chain)

| Name | Purpose | Source |
|------|---------|--------|
| `OPENAI_API_KEY` | OpenAI. | src: `.env.example:L52` |
| `ANTHROPIC_API_KEY` | Anthropic (Claude). | src: `.env.example:L53` |
| `OPENROUTER_API_KEY` | OpenRouter. | src: `.env.example:L54` |
| `KILO_API_KEY` | Kilo (free tier). | src: `.env.example:L55` |
| `LLM_PROVIDER_ORDER` | `kilo,anthropic,openrouter,openai` | src: `.env.example:L56` |

## Auth / secrets (rotate every 90 days)

| Name | Purpose | Source |
|------|---------|--------|
| `JWT_SECRET` | JWT signing (generate with `openssl rand -hex 48`). | src: `.env.example:L60` |
| `BRIDGE_INTERNAL_SECRET` | Internal service auth. | src: `.env.example:L62` |
| `ADMIN_TOKEN` | Simple admin bearer token. | src: `.env.example:L64` |
| `BRIDGE_SIWE_RPC_URL` | Linea RPC for SIWE. | src: `.env.example:L85` |
| `BRIDGE_SIWE_CHAIN_ID` | 59144 (Linea). | src: `.env.example:L86` |
| `BRIDGE_SIWE_JWT_SECRET` | SIWE JWT signing. | src: `.env.example:L87` |
| `DEPLOYER_PRIVATE_KEY` | Contract deployer wallet. | src: `.env.example:L90` |
| `TREASURY_ADDRESS` | Receives initial 10M BRDG mint. | src: `.env.example:L92` |
| `CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` | Clerk auth (optional). | src: `.env.example:L95-L96` |

## Brain identity

| Name | Default | Purpose | Source |
|------|---------|---------|--------|
| `BRAIN_ADMIN_EMAIL` | `admin@your-domain.com` | Brain admin email. | src: `.env.example:L67` |
| `BRAIN_ADMIN_NAME` | `Mr. Myburg` | Display name. | src: `.env.example:L68` |
| `BRAIN_IDENTITY` | `mr-myburg` | Brain identity slug. | src: `.env.example:L69` |

## WordPress multi-domain sync

| Name | Purpose | Source |
|------|---------|--------|
| `WP_BRIDGE_AI_OS_URL` / `USER` / `APP_PASS` | Primary WP site. | src: `.env.example:L72-L74` |
| `WP_GATEWAY_URL` / `USER` / `APP_PASS` | Gateway WP. | src: `.env.example:L75-L77` |
| `WP_HOOK_SECRET` | Webhook shared secret. | src: `.env.example:L78` |
| `WP_URL` / `WP_USERNAME` / `WP_APP_PASSWORD` | WordPress.com. | src: `.env.example:L81-L83` |
| `WP_COM_URL` / `WP_COM_USER` / `WP_COM_APP_PASS` | WP.com REST. | src: `.env.example:L84-L86` |

## Cloud integrations (optional)

| Name | Purpose | Source |
|------|---------|--------|
| `CF_API_TOKEN` / `CF_ZONE_ID` | Cloudflare. | src: `.env.example:L99-L100` |
| `DA_BASE_URL` / `DA_USERNAME` / `DA_LOGIN_KEY` | DirectAdmin. | src: `.env.example:L103-L105` |

## PM2 process defaults (tunables)

| Tunable | Value | Source |
|---------|-------|--------|
| `instances` | 1 | src: `ecosystem.config.js:L11` |
| `max_restarts` | 50 | src: `ecosystem.config.js:L13` |
| `min_uptime` | `30s` | src: `ecosystem.config.js:L14` |
| `exp_backoff_restart_delay` | 1000ms, caps at 16s | src: `ecosystem.config.js:L15` |
| `max_memory_restart` | 512M (128M for terminal-proxy, 256M for ban-engine) | src: `ecosystem.config.js:L20,L92,L125` |
| `kill_timeout` | 5000ms | src: `ecosystem.config.js:L21` |
| `listen_timeout` | 10000ms | src: `ecosystem.config.js:L22` |

## VPS env blob

The VPS receives a base64-encoded, newline-separated `KEY=VALUE` blob via `VPS_ENV_BLOB`. It carries Supabase + JWT + Google OAuth. When adding keys, update the sed dedup step (src: user memory `reference_vps_env_blob.md`).

## Sources

- `.env.example`
- `ecosystem.config.js`
- User memory: `reference_vps_env_blob.md`
