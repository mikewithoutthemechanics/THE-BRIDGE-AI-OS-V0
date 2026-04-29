# 06 — Configs

_Last updated: 2026-04-17_

Every config file, what it controls, and where it is consumed.

## Node / npm

| File | Purpose | Source |
|------|---------|--------|
| `package.json` | Dependencies, npm scripts. | src: `package.json` |
| `package-lock.json` | Locked deps (present). | repo root |

### npm scripts

| Script | Command | Source |
|--------|---------|--------|
| `test` | `jest --testPathPattern=tests/` | src: `package.json:scripts.test` |
| `ci` | `npm test` | same |
| `start` / `dev` | `node system.js` / `nodemon system.js` | same |
| `start:80` / `start:443` / `start:prod` | Cross-env + `node system.js` | same |
| `certs` | `node scripts/gen-certs.js` | same |
| `preflight` | `node scripts/preflight.js` | same |
| `health` | `node scripts/health-check.js` | same |
| `pm2:start` / `pm2:prod` / `pm2:stop` / `pm2:restart` / `pm2:logs` | PM2 control of `god-mode-topology` (also see ecosystem names below) | same |
| `deploy` / `deploy:{heroku,railway,render,fly}` | `node scripts/deploy.js [target]` | same |
| `deploy:public` | PowerShell deploy script `scripts/deploy-public.ps1` | same |
| `gateway` / `gateway:dev` | Run `gateway.js` | same |
| `cli` / `cli:{status,skills,econ,cloud}` | `node cli.js …` | same |

## PM2

| File | Purpose | Source |
|------|---------|--------|
| `ecosystem.config.js` | 8 PM2 apps: `bridge-gateway`, `unified-server`, `super-brain`, `auth-service`, `terminal-proxy`, `god-mode-system`, `ban-engine`, `svg-engine`. | src: `ecosystem.config.js` |

Note: npm scripts reference process name `god-mode-topology`; ecosystem file uses `god-mode-system`. Conflict noted in chapter 14.

## Docker / Procfile / platform-as-a-service

| File | Purpose | Source |
|------|---------|--------|
| `Dockerfile` | Node 20-alpine; runs `node brain.js`; exposes 8080/8000/3000/5002/5001; non-root `bridge` user. | src: `Dockerfile` |
| `Dockerfile.ban` | BAN engine image. | src: `Dockerfile.ban` |
| `Procfile` | `web: node system.js` (Heroku). | src: `Procfile` |
| `railway.json` | NIXPACKS builder; starts `node system.js`; healthcheck `/health`; 5 restart retries. | src: `railway.json` |
| `render.yaml` | Render web service `god-mode-topology`; `npm install`; `node system.js`; healthcheck `/health`. | src: `render.yaml` |

## Vercel

| File | Purpose | Source |
|------|---------|--------|
| `vercel.json` | `cleanUrls=true`, `trailingSlash=false`, builds via `build-static.js`; single function `api/index.js` (maxDuration 10s); security + CORS + cache headers; 40+ rewrites to `/api`. | src: `vercel.json` |
| `vercel-production.json` | Production variant. | src: `vercel-production.json` |

### Security headers (applied to `/(.*)`)

| Header | Value | Source |
|--------|-------|--------|
| `X-Content-Type-Options` | `nosniff` | src: `vercel.json:L18` |
| `X-Frame-Options` | `DENY` | src: `vercel.json:L19` |
| `X-XSS-Protection` | `1; mode=block` | src: `vercel.json:L20` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | src: `vercel.json:L21` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | src: `vercel.json:L22` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` | src: `vercel.json:L23` |
| `Content-Security-Policy` | `default-src 'self'` + script/style allowances + `connect-src` limited to `'self'`, `*.ai-os.co.za`, `*.bridge-ai-os.com`. | src: `vercel.json:L26` |

### Cache headers

`*.js`, `*.css`: immutable 1y. Images: 30d. HTML: `must-revalidate` (src: `vercel.json:L44-L67`).

### CORS (`/api/(.*)`)

`Access-Control-Allow-Origin: *`, methods `GET,POST,PUT,DELETE,OPTIONS`, headers `Content-Type, Authorization, X-Requested-With` (src: `vercel.json:L31-L36`).

## Environment

| File | Purpose | Source |
|------|---------|--------|
| `.env.example` | Template for ~60 env vars (Supabase, SMTP, PayFast, AI keys, auth, WP, Linea, Clerk, CF, DirectAdmin). | src: `.env.example` |

See chapter 02 for the full table.

## Nginx (VPS)

- Managed by `scripts/update-nginx.sh` (user memory `reference_bridgeai_vps.md`).
- Split into two blocks: `bridgeai` (HTTP) + `bridgeai-ssl` (HTTPS).
- All `proxy_pass` upstreams must use `127.0.0.1`, not `localhost`, because `localhost` resolves to `::1` and Node binds IPv4 → silent error 111 (user memory `feedback_nginx_ipv4_upstream.md`).

## Supabase config

| File | Purpose | Source |
|------|---------|--------|
| `supabase/migrations/*.sql` | Authoritative schema / RLS / RPCs. See chapter 04. | src: directory |
| `scripts/supabase-schema.sql` / `scripts/supabase-missing-tables.sql` | Ad-hoc schema patches (legacy). | src: `scripts/` |

## Other config

| File | Purpose | Source |
|------|---------|--------|
| `LAPTOP2_OPENCLAW_CONFIG.yaml` | Laptop-2 OpenClaw config. | src: repo root |
| `semgrep-report.json` | Last semgrep scan output. | src: repo root |

## Sources

- `package.json`
- `ecosystem.config.js`
- `Dockerfile`, `Dockerfile.ban`, `Procfile`, `railway.json`, `render.yaml`
- `vercel.json`, `vercel-production.json`
- `.env.example`
- User memory: `reference_bridgeai_vps.md`, `feedback_nginx_ipv4_upstream.md`
