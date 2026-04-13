#!/bin/bash
# Quick deploy — sync to VPS and restart PM2.
# Requires: SSH key auth to the VPS (no passwords in this file).
#
# Usage:
#   export VPS_IP=your.vps.ip
#   export VPS_USER=root
#   export VPS_DIR=/var/www/bridgeai   # optional
#   bash quick-deploy.sh

set -euo pipefail

VPS_IP="${VPS_IP:-}"
VPS_USER="${VPS_USER:-root}"
VPS_DIR="${VPS_DIR:-/var/www/bridgeai}"

if [[ -z "$VPS_IP" ]]; then
  echo "Set VPS_IP (and optionally VPS_USER, VPS_DIR), then re-run."
  echo "Example: VPS_IP=203.0.113.10 bash quick-deploy.sh"
  exit 1
fi

echo "=== Deploy to ${VPS_USER}@${VPS_IP}:${VPS_DIR} ==="

echo "[1/4] rsync (excludes node_modules, .git, .env)…"
rsync -avz --progress \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='*.log' \
  --exclude='users.db-shm' \
  --exclude='users.db-wal' \
  --exclude='.env' \
  --exclude='.env.local' \
  --exclude='LOGS' \
  --exclude='STANDUPS' \
  ./ "${VPS_USER}@${VPS_IP}:${VPS_DIR}/"

echo "[2/4] npm install (production)…"
ssh "${VPS_USER}@${VPS_IP}" "cd ${VPS_DIR} && npm install --omit=dev"

echo "[3/4] pm2 restart…"
ssh "${VPS_USER}@${VPS_IP}" "cd ${VPS_DIR} && (pm2 restart all || pm2 start ecosystem.config.js --env production)"

echo "[4/4] health…"
ssh "${VPS_USER}@${VPS_IP}" "curl -sS http://127.0.0.1:8080/health || true"
echo "=== done ==="
