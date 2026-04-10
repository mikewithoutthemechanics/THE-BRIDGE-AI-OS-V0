#!/bin/bash
# Bridge AI OS — VPS recovery + watchdog installer
# Run on VPS: bash /var/www/bridgeai/scripts/vps-recover.sh

set -e
APP_DIR="/var/www/bridgeai"
cd "$APP_DIR"

echo "=== Bridge AI OS Recovery ==="
echo "[1] Checking PM2..."

# Stop any zombie processes on our ports
for PORT in 8080 3000 8000 5001 5002 3001; do
  PID=$(lsof -ti:$PORT 2>/dev/null || true)
  if [ -n "$PID" ]; then
    echo "  Freeing port $PORT (pid $PID)"
    kill -9 $PID 2>/dev/null || true
  fi
done
sleep 1

echo "[2] Pulling latest config..."
# If deploy key is set up:
# git pull --ff-only

echo "[3] Installing/updating deps..."
npm ci --omit=dev --ignore-scripts 2>/dev/null || npm install --omit=dev

echo "[4] Starting all processes in production mode..."
pm2 delete all 2>/dev/null || true
NODE_ENV=production pm2 start ecosystem.config.js
pm2 save

echo "[5] Verifying..."
sleep 3
pm2 list

# Quick smoke test
for URL in "http://localhost:8080/health" "http://localhost:3000/health"; do
  STATUS=$(curl -so /dev/null -w "%{http_code}" --max-time 5 $URL || echo "ERR")
  echo "  $URL → $STATUS"
done

echo ""
echo "=== Installing watchdog cron ==="
# Watchdog runs every 5 min, restarts any stopped processes
CRON_JOB="*/5 * * * * /var/www/bridgeai/scripts/watchdog.sh >> /var/www/bridgeai/logs/watchdog.log 2>&1"
(crontab -l 2>/dev/null | grep -v watchdog.sh; echo "$CRON_JOB") | crontab -
echo "Watchdog cron installed."

echo ""
echo "=== Done. Sites should be live. ==="
echo "Check: curl https://go.ai-os.co.za/health"
