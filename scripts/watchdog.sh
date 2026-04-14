#!/bin/bash
# Bridge AI OS — PM2 watchdog
# Cron: */5 * * * * /var/www/bridgeai/scripts/watchdog.sh >> /var/www/bridgeai/logs/watchdog.log 2>&1

APP_DIR="/var/www/bridgeai"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

cd "$APP_DIR" || exit 1

# Check if PM2 daemon is running at all
if ! pm2 list > /dev/null 2>&1; then
  echo "[$TIMESTAMP] PM2 daemon dead — full restart"
  NODE_ENV=production pm2 start ecosystem.config.js
  pm2 save
  exit 0
fi

# Check each critical process
RESTARTED=0
for PROC in bridge-gateway unified-server super-brain auth-service; do
  STATUS=$(pm2 jlist 2>/dev/null | python3 -c "
import sys, json
procs = json.load(sys.stdin)
p = next((x for x in procs if x['name'] == '$PROC'), None)
print(p['pm2_env']['status'] if p else 'missing')
" 2>/dev/null || echo "missing")

  if [ "$STATUS" = "stopped" ] || [ "$STATUS" = "errored" ] || [ "$STATUS" = "missing" ]; then
    echo "[$TIMESTAMP] $PROC is $STATUS — restarting"
    pm2 restart "$PROC" 2>/dev/null || pm2 start ecosystem.config.js --only "$PROC"
    RESTARTED=$((RESTARTED + 1))
  fi
done

# Smoke test public health endpoint
HTTP_STATUS=$(curl -so /dev/null -w "%{http_code}" --max-time 5 http://localhost:8080/health 2>/dev/null || echo "0")
if [ "$HTTP_STATUS" != "200" ]; then
  echo "[$TIMESTAMP] Gateway health check failed ($HTTP_STATUS) — restarting gateway"
  pm2 restart bridge-gateway
  RESTARTED=$((RESTARTED + 1))
fi

if [ "$RESTARTED" -gt 0 ]; then
  echo "[$TIMESTAMP] Watchdog restarted $RESTARTED process(es)"
else
  echo "[$TIMESTAMP] All processes healthy"
fi
