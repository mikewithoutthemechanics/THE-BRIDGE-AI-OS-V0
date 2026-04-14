#!/bin/bash
# Bridge AI OS — VPS Emergency Recovery
# Run directly on the VPS as root to bring the site back online.
#
# One-liner from local machine:
#   ssh root@YOUR_VPS_IP 'cd /var/www/bridgeai && git pull --ff-only && bash scripts/vps-recover.sh'

set -e
APP_DIR="/var/www/bridgeai"
LOG="$APP_DIR/logs/recover-$(date +%s).log"
mkdir -p "$APP_DIR/logs"

echo "=== Bridge AI OS VPS Recovery $(date) ===" | tee "$LOG"

cd "$APP_DIR"

# ── 1. Pull latest code ──────────────────────────────────────────────────────
echo "[1/5] Pulling latest code..." | tee -a "$LOG"
git pull --ff-only 2>&1 | tee -a "$LOG" || {
  echo "git pull failed — continuing with current code" | tee -a "$LOG"
}

# ── 2. Install/update deps ────────────────────────────────────────────────────
echo "[2/5] Installing dependencies..." | tee -a "$LOG"
npm install --omit=dev 2>&1 | tail -3 | tee -a "$LOG"

# ── 3. Reapply nginx config (static-file resilience) ─────────────────────────
echo "[3/5] Updating nginx config..." | tee -a "$LOG"
bash scripts/update-nginx.sh 2>&1 | tee -a "$LOG"

# ── 4. Restart PM2 processes (delete + start clears max_restarts cap) ─────────
echo "[4/5] Restarting PM2..." | tee -a "$LOG"
if pm2 list > /dev/null 2>&1; then
  pm2 delete bridge-gateway 2>/dev/null || true
  pm2 start ecosystem.config.js --only bridge-gateway --env production 2>&1 | tee -a "$LOG"
  pm2 save
else
  echo "PM2 not running — full start" | tee -a "$LOG"
  NODE_ENV=production pm2 start ecosystem.config.js 2>&1 | tee -a "$LOG"
  pm2 save
  pm2 startup | tail -1 | bash 2>/dev/null || true
fi

# Ensure watchdog cron is registered
CRON="*/5 * * * * /var/www/bridgeai/scripts/watchdog.sh >> /var/www/bridgeai/logs/watchdog.log 2>&1"
(crontab -l 2>/dev/null | grep -v watchdog.sh; echo "$CRON") | crontab -
echo "Watchdog cron ensured." | tee -a "$LOG"

# ── 5. Smoke test ─────────────────────────────────────────────────────────────
echo "[5/5] Smoke testing..." | tee -a "$LOG"
sleep 3
HTTP=$(curl -so /dev/null -w "%{http_code}" --max-time 10 http://localhost:8080/health || echo "0")
if [ "$HTTP" = "200" ]; then
  echo "✅ Gateway healthy (HTTP $HTTP)" | tee -a "$LOG"
else
  echo "⚠️  Gateway returned $HTTP — check: pm2 logs bridge-gateway --lines 50" | tee -a "$LOG"
fi

# Static /apps served directly by nginx (no gateway needed after config update)
HTTP_APPS=$(curl -so /dev/null -w "%{http_code}" --max-time 5 http://localhost/50-applications.html || echo "0")
echo "   Static /apps via nginx: $HTTP_APPS" | tee -a "$LOG"

echo "" | tee -a "$LOG"
echo "=== Recovery complete ===" | tee -a "$LOG"
pm2 list 2>&1 | tee -a "$LOG"
