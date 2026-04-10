#!/bin/bash
# Deploy supaclaw-core.js (and patched companions) to VPS.
# Run from: C:\aoe-unified-final\  (Git Bash / WSL)
# Usage: bash deploy-supaclaw.sh [VPS_USER] [VPS_IP]
#
# What this does:
#   1. Copies supaclaw-core.js, supaclaw.js, supaclaw-economy.js to /var/www/bridgeai/
#   2. Restarts the super-brain PM2 process
#   3. Tails PM2 logs for 10 seconds so you can confirm clean startup
#   4. Hits /api/core/invariants to verify the monitor is live

set -euo pipefail

VPS_USER="${1:-root}"
VPS_IP="${2:-102.208.228.44}"
VPS_DIR="/var/www/bridgeai"

echo "=== Supaclaw Deploy → $VPS_USER@$VPS_IP:$VPS_DIR ==="

# ── 1. Sync the three patched files ─────────────────────────────────────────
echo "[1/4] Syncing supaclaw files..."
rsync -avz \
  supaclaw-core.js \
  supaclaw.js \
  supaclaw-economy.js \
  "$VPS_USER@$VPS_IP:$VPS_DIR/"

echo "[1/4] Done."

# ── 2. Restart super-brain via PM2 ──────────────────────────────────────────
echo "[2/4] Restarting super-brain..."
ssh "$VPS_USER@$VPS_IP" "cd $VPS_DIR && pm2 restart super-brain --update-env"
echo "[2/4] Done."

# ── 3. Tail PM2 logs (10s) to confirm clean startup ─────────────────────────
echo "[3/4] PM2 log tail (10s) — look for INVARIANT MONITOR ACTIVE..."
ssh "$VPS_USER@$VPS_IP" "pm2 logs super-brain --lines 30 --nostream || true"
echo ""
echo "[3/4] Done."

# ── 4. Verify /api/core/invariants endpoint ──────────────────────────────────
echo "[4/4] Checking invariants endpoint..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  "https://go.ai-os.co.za/api/core/invariants" \
  --max-time 10 || echo "000")

if [ "$HTTP_STATUS" = "200" ]; then
  echo "[4/4] /api/core/invariants → 200 OK"
  curl -s "https://go.ai-os.co.za/api/core/invariants" | python3 -m json.tool 2>/dev/null || true
else
  echo "[4/4] WARNING: /api/core/invariants returned HTTP $HTTP_STATUS"
  echo "       The endpoint may not be registered yet — check brain.js router."
fi

echo ""
echo "=== Deploy complete ==="
echo ""
echo "Next: monitor for 1000 clean cycles, then treasury gate activates."
echo "  Watch: ssh $VPS_USER@$VPS_IP 'pm2 logs super-brain --lines 0'"
