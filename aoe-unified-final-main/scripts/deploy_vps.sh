#!/usr/bin/env bash
# One-shot VPS deploy helper for the Orchestra Layer 1+2 stack.
# REQUIRES explicit confirmation. Never runs without CONFIRM=yes.
#
# Usage:
#   VPS_HOST=bridge-ai-os.com VPS_USER=root VPS_PATH=/opt/aoe-unified CONFIRM=yes \
#     scripts/deploy_vps.sh
#
# What it does:
#   1. rsync project root (minus node_modules, .git, logs/*) → $VPS_USER@$VPS_HOST:$VPS_PATH
#   2. ssh in and run: npm i --production (if package.json) + pm2 reload ecosystem.config.js
#   3. curl /healthz on the VPS to confirm Layer 1 binary signal
#
# Does NOT enable any cron — Phase 2A scheduling stays a manual decision.

set -euo pipefail

[ "${CONFIRM:-}" = "yes" ] || {
  echo "refusing: set CONFIRM=yes to deploy to shared VPS"
  echo "dry-run view:"
  echo "  host=${VPS_HOST:-UNSET} user=${VPS_USER:-UNSET} path=${VPS_PATH:-UNSET}"
  exit 2
}
: "${VPS_HOST:?set VPS_HOST}"
: "${VPS_USER:?set VPS_USER}"
: "${VPS_PATH:?set VPS_PATH}"

echo "[deploy] rsync → $VPS_USER@$VPS_HOST:$VPS_PATH"
rsync -az --delete \
  --exclude node_modules --exclude .git --exclude 'logs/*' \
  --exclude '*.bak' --exclude '*.original-*' \
  ./ "$VPS_USER@$VPS_HOST:$VPS_PATH/"

echo "[deploy] remote: pm2 reload + healthz"
ssh "$VPS_USER@$VPS_HOST" bash -s <<REMOTE
  set -e
  cd "$VPS_PATH"
  [ -f package.json ] && npm i --production --no-audit --no-fund || true
  pm2 reload ecosystem.config.js --update-env || pm2 start ecosystem.config.js
  pm2 save
  sleep 2
  CODE=\$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:7777/healthz)
  echo "[deploy] remote /healthz = \$CODE"
  [ "\$CODE" = "200" ] || { echo "[deploy] FAIL"; exit 1; }
REMOTE

echo "[deploy] OK"
