# Bridge AI OS — Production Deployment Checklist
# 
# This document itemizes every required action to deploy the application
# to a production environment. All environment variables must be present.

# ── PHASE 1: LOCAL PREPARATION ────────────────────────────────────────────────

## 1.1 Generate Secrets (if not already generated)
# JWT_SECRET (min 32 chars, high entropy)
openssl rand -hex 48

# BRIDGE_INTERNAL_SECRET (for inter-service auth)
openssl rand -hex 16

# BRIDGE_SIWE_JWT_SECRET (for blockchain wallet auth)
openssl rand -hex 32

## 1.2 Create Production .env
cp .env.example .env
# Edit .env — replace every "CHANGE_ME" or empty key with actual values
# NO placeholder values are accepted in production

## 1.3 Verify Database Connectivity
# For Supabase:
node -e "require('./lib/supabase')"
# Should output Supabase client without errors

# For local PostgreSQL:
psql \$ECONOMY_DB_URL -c "\q" || echo "ECONOMY_DB_URL unreachable"

## 1.4 Run Database Migrations
node migrations/run-migrations.js
# Expected output:
# [migrate] applied: 001_create_users.sql
# ...
# [migrate] Done. N migration(s) applied.

## 1.5 Install Dependencies
npm ci --omit=dev
cd svg-engine && npm ci --omit=dev && cd ..

## 1.6 Run Test Suite
npm test
# All tests must pass before deployment
# Critical suites: auth, integration, contracts (if blockchain enabled)

## 1.7 Build Static Assets
node build-static.js
ls public/*.html | wc -l  # should be ≥140

# ── PHASE 2: CONTRACT DEPLOYMENT (if using blockchain) ────────────────────────

## 2.1 Deploy to Testnet First (Linea Sepolia)
npx hardhat run scripts/deploy-contracts.js --network linea-testnet

## 2.2 Verify Testnet Deployment
# Check .env.deployed-linea-testnet exists and contains addresses

## 2.3 Deploy to Mainnet (if testnet successful)
npx hardhat run scripts/deploy-contracts.js --network linea

## 2.4 Verify Mainnet Contracts on Lineascan
# Optional but recommended:
npx hardhat verify --network linea \$BRDG_ADDRESS
npx hardhat verify --network linea \$TREASURY_ADDRESS
npx hardhat verify --network linea \$STAKING_ADDRESS

## 2.5 Update .env with Contract Addresses
BRDG_TOKEN_ADDRESS=0x...
TREASURY_VAULT_ADDRESS=0x...
STAKING_VAULT_ADDRESS=0x...

# ── PHASE 3: VPS/INFRASTRUCTURE SETUP ─────────────────────────────────────────

## 3.1 Server Provisioning
# Target OS: Ubuntu 22.04 LTS (or Debian 12)
# Minimum: 4 vCPU, 8GB RAM, 100GB SSD
# Ensure ports: 22 (SSH), 80 (HTTP), 443 (HTTPS) open in firewall

## 3.2 Install System Dependencies
sudo apt update
sudo apt install -y nodejs npm nginx certbot python3-certbot-nginx \
  ufw redis-server postgresql-15

# Enable PostgreSQL
sudo systemctl start postgresql
sudo systemctl enable postgresql

## 3.3 Create PostgreSQL Database
sudo -u postgres psql -c "CREATE DATABASE bridge;"
sudo -u postgres psql -c "CREATE USER bridge WITH PASSWORD 'RANDOM_PASSWORD';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE bridge TO bridge;"

# Update .env:
DATABASE_URL=postgresql://bridge:RANDOM_PASSWORD@localhost:5432/bridge
ECONOMY_DB_URL=postgresql://bridge:RANDOM_PASSWORD@localhost:5432/bridge

## 3.4 Clone Application
sudo mkdir -p /var/www/bridgeai
sudo chown \$USER:\$USER /var/www/bridgeai
git clone <your-repo-url> /var/www/bridgeai
cd /var/www/bridgeai

## 3.5 Upload Production .env
scp .env user@vps:/var/www/bridgeai/.env

# ── PHASE 4: DEPLOYMENT EXECUTION ────────────────────────────────────────────

## 4.1 Install Dependencies (on VPS)
cd /var/www/bridgeai
npm ci --omit=dev
cd svg-engine && npm ci --omit=dev && cd ..

## 4.2 Run Migrations (on VPS)
node migrations/run-migrations.js

## 4.3 Start with PM2
npm run pm2:prod
pm2 save
pm2 startup systemd -u \$USER --hp /home/\$USER

## 4.4 Verify PM2 Status
pm2 list
# Should show: bridge-gateway, unified-server, super-brain, auth-service,
#              terminal-proxy, god-mode-system, ban-engine, svg-engine

## 4.5 Configure Nginx
sudo cp nginx-bridge.conf /etc/nginx/sites-available/bridgeai
sudo ln -sf /etc/nginx/sites-available/bridgeai /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

## 4.6 Obtain SSL Certificate
sudo certbot --nginx -d go.ai-os.co.za -d www.go.ai-os.co.za

## 4.7 Configure Firewall
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable

# ── PHASE 5: POST-DEPLOY VERIFICATION ────────────────────────────────────────

## 5.1 Health Checks
curl -f https://go.ai-os.co.za/health || echo "Main health FAILED"
curl -f https://go.ai-os.co.za/api/health || echo "API health FAILED"
curl -f https://go.ai-os.co.za/status || echo "Status FAILED"

## 5.2 Service Health (on VPS)
node health-monitor.js  # should log all 8 endpoints as OK

## 5.3 Log Inspection
pm2 logs --lines 100
# Look for: ERROR, FATAL, WARN
# Expected: startup messages only

## 5.4 Test Core Endpoints
# Authentication
curl -X POST https://go.ai-os.co.za/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@test.com","password":"test"}' || echo "Auth test FAILED"

# Agents
curl https://go.ai-os.co.za/api/agents || echo "Agents FAILED"

# Economy
curl https://go.ai-os.co.za/api/economy/accounts || echo "Economy FAILED"

# Neurolink
curl https://go.ai-os.co.za/api/neurolink/ambient || echo "Neurolink FAILED"

## 5.5 Payment Flow Test (if PayFast enabled)
# 1. Create test checkout
CHECKOUT_URL=$(curl -s "https://go.ai-os.co.za/checkout?ref=test&amount=10&client=Test" | \
  grep -oP '(?<=payment_url":")[^"]*' | head -1)
echo "Checkout URL: \$CHECKOUT_URL"

# 2. Simulate PayFast notification (use sandbox credentials)
curl -X POST https://go.ai-os.co.za/payfast/notify \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "merchant_id=\$PAYFAST_MERCHANT_ID&..."

## 5.6 AI Agent Test
curl -X POST https://go.ai-os.co.za/api/agents/execute \
  -H "Authorization: Bearer \$JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"agent_id":"test-agent","input":{"test":true}}' || echo "Agent execution FAILED"

## 5.7 WebSocket Connections
# Terminal
wscat -c "wss://go.ai-os.co.za/terminal/ws?token=\$JWT_TOKEN"

# Brain SSE
curl -N https://go.ai-os.co.za/api/neurolink/events || echo "SSE FAILED"

## 5.8 Blockchain (if deployed)
# Check token balance
npx hardhat run scripts/check-balance.js --network linea

# Verify staking
curl https://go.ai-os.co.za/api/staking/pools || echo "Staking FAILED"

# ── PHASE 6: MONITORING & ALERTS ──────────────────────────────────────────────

## 6.1 Set Up Log Rotation
# PM2 already handles log rotation, configure:
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7

## 6.2 Create Health Check Cron (redundant with health-monitor.js)
(crontab -l 2>/dev/null; echo "*/5 * * * * curl -f https://go.ai-os.co.za/health >/dev/null") | crontab -

## 6.3 Set Up Error Alerts (optional)
# Using pm2-logrotate's max_files and external service (Sentry, Slack)
pm2 set pm2-logrotate:compress true
pm2 set pm2-logrotate:dateFormat "YYYY-MM-DD"

## 6.4 Monitor Memory Usage
watch -n 1 'ps aux | grep node | sort -rk %mem | head -10'

## 6.5 Database Connection Pool
# Check PostgreSQL connections:
sudo -u postgres psql -c "SELECT * FROM pg_stat_activity WHERE datname='bridge';"

# ── PHASE 7: SCALING & BACKUP ─────────────────────────────────────────────────

## 7.1 Configure Daily Backups
crontab -e
# Add:
0 2 * * * /var/www/bridgeai/scripts/backup-databases.sh

## 7.2 Set Up S3 for Backups (optional)
# Create S3 bucket, configure AWS credentials in .env or IAM role
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_S3_BUCKET=bridgeai-backups

## 7.3 Test Backup & Restore
/var/www/bridgeai/scripts/backup-databases.sh --dry-run
# Verify backup file created in /tmp/ or S3

## 7.4 Load Balancing (if scaling horizontally)
# Configure multiple VPS instances behind Cloudflare or AWS ELB
# Ensure sticky sessions for WebSocket connections (terminal, brain)

## 7.5 CDN for Static Assets
# Upload public/static/* to Cloudflare R2 or S3 + CloudFront
# Update CSP in server.js to include CDN domain

# ── PHASE 8: SECURITY HARDENING ───────────────────────────────────────────────

## 8.1 Rotate Secrets Every 90 DAYS
# Schedule calendar event:
# - Generate new JWT_SECRET
# - Update .env on all servers
# - Restart PM2 processes: pm2 restart all
# - Invalidate existing sessions (users must re-login)

## 8.2 Enable Rate Limiting (already in code, tune values)
# In .env:
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=1000

## 8.3 Enable PayFast IP Allowlist (if using)
PAYFAST_ENABLE_IP_ALLOWLIST=true
PAYFAST_IP_ALLOWLIST="148.113.XX.XX,148.113.XX.XX"  # PayFast notify IPs

## 8.4 Set Up Webhook Signatures
# All webhooks (PayFast, WordPress, GitHub) verify signatures
# Ensure secrets: WP_HOOK_SECRET, WEBHOOK_SECRET set in .env

## 8.5 Enable TLS 1.3 Only (nginx)
# Edit /etc/nginx/nginx.conf:
ssl_protocols TLSv1.3 TLSv1.2;
ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512;
ssl_prefer_server_ciphers off;

## 8.6 Harden SSH
# /etc/ssh/sshd_config:
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes

sudo systemctl restart sshd

# ── PHASE 9: PERFORMANCE TUNING ───────────────────────────────────────────────

## 9.1 PostgreSQL Tuning (for 4GB+ RAM)
sudo -u postgres psql -c "ALTER SYSTEM SET shared_buffers = '1GB';"
sudo -u postgres psql -c "ALTER SYSTEM SET work_mem = '64MB';"
sudo -u postgres psql -c "ALTER SYSTEM SET maintenance_work_mem = '256MB';"
sudo systemctl restart postgresql

## 9.2 Redis Tuning (if using)
# Add to redis.conf:
maxmemory 512mb
maxmemory-policy allkeys-lru

## 9.3 Node.js Tuning
# Use Node 20+ (already specified in package.json)
# Add to ecosystem.config.js:
node_args: '--max-old-space-size=1024'  # for unified-server if heavy load

## 9.4 PM2 Cluster Mode (scale CPU-bound services)
# Edit ecosystem.config.js:
instances: 'max',  # or number of CPU cores
exec_mode: 'cluster'

# ── PHASE 10: ROLLBACK PLAN ───────────────────────────────────────────────────

## 10.1 Keep Previous Release
# Before each deploy, tag release:
git tag -a v1.0.0 -m "Production release v1.0.0"
git push origin v1.0.0

## 10.2 Zero-Downtime Deploy
# PM2 performs graceful reload:
pm2 reload all  # waits for new processes to start before killing old

## 10.3 Immediate Rollback
pm2 rollback <app-name>  # if configured
# Or manually:
git checkout v1.0.0
npm ci
npm run pm2:restart

## 10.4 Database Backups Before Schema Changes
# Always backup before running migrations:
cp users.db users.db.backup.\$(date +%s)
pg_dump -Fc bridge > backup-\$(date +%Y%m%d).dump

# ── PHASE 11: ONGOING MAINTENANCE ──────────────────────────────────────────────

## 11.1 Daily
- Check PM2 logs: pm2 logs --err [optional filter]
- Verify health: curl https://go.ai-os.co.za/health
- Check disk space: df -h
- Monitor error rate: grep ERROR logs/*.log | wc -l

## 11.2 Weekly
- Review backup logs: tail /var/log/bridgeai-backup.log
- Check Staking APY payouts
- Review agent marketplace revenue
- Update dependencies: npm outdated, npm update (after testing)

## 11.3 Monthly
- Rotate secrets (JWT_SECRET, ADMIN_TOKEN)
- Audit user accounts (privilege escalation)
- Review rate limiting logs for abuse
- Hardening updates (Node.js, nginx)

# ── PHASE 12: TROUBLESHOOTING ─────────────────────────────────────────────────

## Issue: "Cannot find module 'better-sqlite3'"
Solution: npm rebuild better-sqlite3 --build-from-source

## Issue: "port already in use"
Solution: pm2 stop all; kill -9 <pid>; pm2 start

## Issue: "Migration already applied"
Solution: Check _migrations table in DB; for SQLite: DELETE FROM _migrations WHERE filename='...';

## Issue: "GPU not found" (neurolink)
Solution: Without GPU, neurolink uses CPU fallback; set NEUROLINK_DEVICE=cpu in .env

## Issue: "Out of memory"
Solution: Increase VPS RAM or adjust max_memory_restart in ecosystem.config.js

## Issue: "WebSocket connection failed"
Solution: Check nginx config has WebSocket upgrade headers (proxy_set_header Upgrade \$http_upgrade)

# ── END OF CHECKLIST ───────────────────────────────────────────────────────────
