# Bridge AI OS — Quick Deploy Guide

**Assumption**: All environment variables are configured in `.env` (no placeholders).

---

## One-Command Deploy (Local/Dev)

```bash
# 1. Preflight check (optional but recommended)
node scripts/preflight.js

# 2. Install dependencies
npm ci

# 3. Run migrations
node migrations/run-migrations.js

# 4. Start all services (PM2)
npm run pm2:prod

# 5. Verify
curl http://localhost:3000/health
```

---

## Production Deploy Options

### Option A: VPS (Ubuntu/Debian) — Recommended for Full Stack

```bash
# Copy deploy script to local machine, edit VPS_IP/VPS_USER
bash deploy-vps.sh
```

The script automates:
- Node.js, PM2, Nginx, Certbot installation
- Rsync code to `/var/www/bridgeai`
- Upload `.env`
- Run `npm ci` + migrations
- PM2 start (8 services)
- Nginx config + SSL via Certbot

---

### Option B: Docker Compose — Single-Command Multi-Service

```bash
# 1. Create .env with all secrets (same as VPS deploy)
cp .env.example .env  # fill all keys

# 2. Start everything
docker-compose -f docker-compose.prod.yml up -d

# 3. Check status
docker-compose -f docker-compose.prod.yml ps
docker-compose -f docker-compose.prod.yml logs -f

# 4. Health
curl http://localhost:3000/health
```

**Services started automatically**:
- PostgreSQL (port 5432)
- Redis (port 6379)
- Gateway (8080)
- Unified Server (3000)
- Super Brain (8000)
- Auth Service (5001)
- Terminal Proxy (5002)
- GOD MODE System (3001)
- SVG Engine (7070)
- BAN Engine (8001)
- Nginx (80/443)

---

### Option C: Vercel — Static Frontend Only

For hosting the 140+ HTML pages (no backend services):

```bash
# 1. Push to GitHub (Vercel auto-deploys)
git add .
git commit -m "deploy"
git push origin main

# 2. Or manual deploy:
vercel --prod
```

`vercel.json` is pre-configured for SPA routing + scheduled cron jobs.

**Limitations**: Vercel hosts static pages only — backend (API, brain, database) must run elsewhere (Railway, Render, or VPS).

---

### Option D: Render.com — Backend as a Service

1. Create Web Service in Render dashboard
2. Connect GitHub repo
3. Set Build Command: `npm ci && npm run build`
4. Set Start Command: `npm run pm2:prod` or `node server.js`
5. Add all env vars in Render dashboard
6. Deploy

---

### Option E: Railway — Containerized Cloud

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Initialize project
railway init

# Deploy
railway up
```

---

## Post-Deploy Verification

Run these checks **immediately** after deployment:

```bash
# 1. Main health endpoint
curl -f https://your-domain.com/health || echo "FAIL"

# 2. API health
curl -f https://your-domain.com/api/health || echo "FAIL"

# 3. Service status page (if accessible)
curl https://your-domain.com/status

# 4. Check logs for errors
pm2 logs --err  # or docker-compose logs -f

# 5. Test database connection
curl https://your-domain.com/api/registry/kernel \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# 6. Verify all 8 services (via health-monitor.js locally or on VPS)
node health-monitor.js
```

Expected output (PM2):
```
┌─────┬──────────────────────┬───────┬─────┬─────────┬───────┐
│ id  │ name                 │ mode  │ pid │ status  │ ...   │
├─────┼──────────────────────┼───────┼─────┼─────────┼───────┤
│ 0   │ bridge-gateway       │ fork  │ 123 │ online  │ ...   │
│ 1   │ unified-server       │ fork  │ 124 │ online  │ ...   │
│ 2   │ super-brain          │ fork  │ 125 │ online  │ ...   │
│ 3   │ auth-service         │ fork  │ 126 │ online  │ ...   │
│ 4   │ terminal-proxy       │ fork  │ 127 │ online  │ ...   │
│ 5   │ god-mode-system      │ fork  │ 128 │ online  │ ...   │
│ 6   │ ban-engine           │ fork  │ 129 │ online  │ ...   │
│ 7   │ svg-engine           │ fork  │ 130 │ online  │ ...   │
└─────┴──────────────────────┴───────┴─────┴─────────┴───────┘
```

---

## Common Gotchas & Fixes

| Issue | Solution |
|-------|----------|
| `Error: JWT_SECRET must be at least 32 characters` | Generate stronger secret: `openssl rand -hex 48` |
| `ECONNREFUSED PostgreSQL` | Start PostgreSQL: `sudo systemctl start postgresql` |
| `Cannot find module 'better-sqlite3'` | `npm rebuild better-sqlite3` or `npm ci --force` |
| `port already in use` | `pm2 stop all && kill -9 $(lsof -ti:3000)` |
| `Out of memory` | Increase VPS RAM or lower `max_memory_restart` in PM2 |
| `WebSocket connection failed` | Check nginx config includes `Upgrade` headers |
| `PayFast IPN failed` | Verify `PAYFAST_ENABLE_IP_ALLOWLIST` matches PayFast notify IPs |

---

## Zero-Downtime Updates

```bash
# Pull latest code
git pull origin main

# Install deps
npm ci --omit=dev

# Migrate DB (if needed)
node migrations/run-migrations.js

# Graceful reload
pm2 reload all

# Or restart specific service
pm2 restart super-brain
```

---

## Rollback

```bash
# View previous deployments
pm2 list

# Rollback to previous version (if tag exists)
git checkout v1.0.0
npm ci
npm run pm2:restart

# Or restore DB backup
pg_restore -U bridge -d bridge backup-20260420.dump
```

---

## Monitoring

```bash
# Real-time logs
pm2 logs --lines 100

# Metrics
pm2 monit

# Health checks (built-in)
node health-monitor.js  # polls all 8 endpoints every 60s

# Set up alerts (optional)
# Add to crontab: */5 * * * * curl -f https://domain/health >/dev/null || echo "ALERT"
```

---

## Next Steps After Deploy

1. **Set up SSL renewal auto** (already done by Certbot)
2. **Configure backups** (`scripts/backup-databases.sh` daily via cron)
3. **Add to GitHub Secrets** for CI/CD auto-deploy (`.github/workflows/deploy-vps.yml`)
4. **Enable PayFast payments** (test sandbox → live)
5. **Deploy smart contracts** to Linea mainnet (if using token system)
6. **Onboard first agents** to marketplace
7. **Configure domain DNS** for sub-brand apps (ehsa.ai-os.co.za, etc.)
8. **Set up Grafana/Prometheus** for advanced monitoring

---

**Need help?** Check `DEPLOY_CHECKLIST.md` for the exhaustive 12-phase deployment plan.
