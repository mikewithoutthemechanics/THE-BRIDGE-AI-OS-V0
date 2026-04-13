#!/usr/bin/env bash
# Run on VPS from repo root (e.g. /var/www/bridgeai): sync to origin/main and restart gateway.
set -euo pipefail
cd "$(dirname "$0")/.."
echo "[vps-sync-main] Stashing local edits (including untracked that conflict)..."
git stash push -u -m "vps-auto-stash before pull $(date -u +%Y-%m-%dT%H:%M:%SZ)" || true
echo "[vps-sync-main] Pulling origin/main..."
git pull origin main
echo "[vps-sync-main] Restarting bridge-gateway..."
pm2 restart bridge-gateway
sleep 2
PORT="${PORT:-8080}"
echo "[vps-sync-main] Health check http://127.0.0.1:${PORT}/health ..."
curl -sS "http://127.0.0.1:${PORT}/health" | head -c 500 || true
echo
echo "[vps-sync-main] Done."
