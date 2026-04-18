# 08 — Procedures

_Last updated: 2026-04-17_

Runbooks. Each procedure names the script(s) that perform it.

## Deploy

### Vercel (frontend + serverless API)

1. Commit to `main`.
2. Vercel CI runs `node build-static.js` then publishes `public/` + `api/index.js`.
3. Verify `https://go.ai-os.co.za` (src: `vercel.json`, `SESSION-HANDOFF.md`).

### VPS (PM2 stack)

1. SSH into `root@102.208.228.44` (user memory `reference_bridgeai_vps.md`).
2. `cd /var/www/bridgeai && git pull` (src: user memory `reference_bridgeai_pm2_paths.md`).
3. `pm2 restart all` (src: `SESSION-HANDOFF.md` "Next Session Priorities").
4. Verify with `scripts/health-check.js` (`npm run health`, src: `package.json:scripts.health`).

### Railway / Render / Heroku

- `npm run deploy:railway`, `npm run deploy:render`, `npm run deploy:heroku` dispatch through `scripts/deploy.js` (src: `package.json:scripts`).
- All three use `node system.js` as start command and `/health` as healthcheck (src: `railway.json`, `render.yaml`, `Procfile`).

## Backup

### Databases

`scripts/backup-databases.sh` — automated DB backup to S3 + local retention; cron at `0 2 * * *` (src: `scripts/backup-databases.sh:L1-L4`).

### Comprehensive

`scripts/backup-restore-recovery.sh backup|restore|recovery` — full utility for backup/restore/recovery (src: `scripts/backup-restore-recovery.sh:L1-L6`).

### Infrastructure deploy

`scripts/deploy-backup-infrastructure.sh` — provisions backup infra (src: `scripts/`).

## VPS recovery

`scripts/vps-recover.sh` — emergency recovery, runs as root on the VPS to bring the site back online (src: `scripts/vps-recover.sh:L1-L5`).

## Watchdog

`scripts/watchdog.sh` — PM2 watchdog; cron `*/5 * * * *` → `/var/www/bridgeai/logs/watchdog.log` (src: `scripts/watchdog.sh:L1-L5`).

## Nginx update

`scripts/update-nginx.sh` — manages `bridgeai` (HTTP) and `bridgeai-ssl` (HTTPS) blocks; never hand-edit the installed config (src: user memory `reference_bridgeai_vps.md`).

**Always use `127.0.0.1` in `proxy_pass` upstreams** — `localhost` resolves to `::1` and Node binds IPv4, producing silent error 111 (user memory `feedback_nginx_ipv4_upstream.md`).

## Secrets

`scripts/load-secrets-from-aws.sh` — load secrets from AWS (src: `scripts/`). VPS receives env via base64-encoded `VPS_ENV_BLOB` (user memory `reference_vps_env_blob.md`).

## Seeding

- `scripts/seed-dashboard-data.js` — dashboard seed data.
- `scripts/seed-hitl-queue.js` — HITL queue seed.
- `scripts/seed-liquidity.js` — liquidity seed.
- `scripts/seed-sample-leads.js` — CRM lead seed.
- `scripts/set-superadmin.js` — promote user to superadmin.
- Sources: `ls scripts/`.

## Contracts / token

- `scripts/deploy-contracts.js` — deploy Linea contracts.
- `scripts/deploy-brdg.js` — deploy BRDG token.
- `scripts/deploy-modular-vault.js` — deploy modular vault.
- `scripts/create-dex-pool.js` — create DEX pool.
- `scripts/test-brdg-distribution.js` — validate BRDG distribution.
- Sources: `ls scripts/`.

## Migration

- `scripts/migrate-sqlite-to-supabase.js` — one-way migration of `task-market.db` / `users.db` SQLite → Supabase (src: `ls scripts/`, `task-market.db` / `users.db` present in root).
- `scripts/apply-hardened-schema.js` — apply the hardened treasury schema (src: `scripts/`).
- `scripts/apply-supabase-schema.js` — apply full Supabase schema (src: `scripts/`).

## Health / preflight

- `npm run preflight` → `node scripts/preflight.js` (src: `package.json`).
- `npm run health` → `node scripts/health-check.js` (src: `package.json`).
- `scripts/audit-test.js`, `scripts/burn-in-test.js` — audit + burn-in (src: `scripts/`).

## Invoices / PDFs

- `scripts/sendEmails.js` — batch emails (src: `scripts/`).
- `scripts/generate-assets.js` — asset generation (src: `scripts/`).

## Incident / quarantine

- Quarantined: `/opt/bridge-ai-os.QUARANTINED-20260417-160126` (1.2 GB). Delete on or after 2026-04-18 (user memory `project_quarantine_cleanup.md`).

## Certs / TLS

`npm run certs` → `node scripts/gen-certs.js` (src: `package.json:scripts.certs`).

## One-liner VPS deploy helpers (root)

- `quick-deploy.sh`, `quick-deploy-v3.sh`, `vps-deploy-now.sh`, `vps-fix.sh`, `vps-fix-commands.sh`, `safe-bridgeai-recovery.sh`, `setup-laptop2-unattended.sh`, `setup-laptop3-unattended.sh`. Read each before running (src: repo root listing).

## Sources

- `scripts/*.sh` / `scripts/*.js`
- `package.json`
- `SESSION-HANDOFF.md`
- `vercel.json`, `railway.json`, `render.yaml`, `Procfile`
- User memory: `reference_bridgeai_vps.md`, `reference_bridgeai_pm2_paths.md`, `reference_vps_env_blob.md`, `feedback_nginx_ipv4_upstream.md`, `project_quarantine_cleanup.md`
