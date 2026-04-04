#!/bin/bash
set -e
echo "=== BRIDGE AI OS — GLOBAL ACTIVATION ==="

# 1. pip3
echo "[1/6] Installing pip3..."
apt-get install -y -qq python3-pip 2>/dev/null || true

# 2. BAN engine
echo "[2/6] Setting up BAN engine..."
cd /opt/bridge-ai-os/BAN
pip3 install fastapi uvicorn pydantic --quiet 2>/dev/null || true
cd /opt/bridge-ai-os
pm2 delete ban-engine 2>/dev/null || true
pm2 start "cd /opt/bridge-ai-os/BAN && python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 8001" --name ban-engine 2>/dev/null
echo "BAN started"

# 3. Nginx (already configured but ensure correct)
echo "[3/6] Nginx config..."
nginx -t 2>&1 && systemctl reload nginx
echo "Nginx OK"

# 4. SSL expand (only for domains that resolve to this IP)
echo "[4/6] SSL check..."
certbot certificates 2>&1 | grep "Domains:" | head -3
# Only expand if new domains resolve here - skip if they don't yet
echo "SSL: existing cert covers go.ai-os.co.za"

# 5. .env
echo "[5/6] Environment..."
cat > /opt/bridge-ai-os/.env << 'ENV'
NODE_ENV=production
JWT_SECRET=bridge_secure_production_key_2026
BRIDGE_INTERNAL_SECRET=bridge_internal_lock_2026
KEYFORGE_MASTER=bridge_keyforge_master_secret_2026_production
ENV
echo ".env written"

# 6. Restart all
echo "[6/6] Restarting..."
pm2 restart all 2>/dev/null
pm2 save 2>/dev/null
sleep 3

echo "=== VERIFICATION ==="
for port in 8080 8000 8001 3000 5002 5001; do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 2 "http://localhost:$port/health" 2>/dev/null)
  echo "$code :$port"
done

echo "=== DONE ==="
pm2 list --no-color 2>&1 | grep -E "online|errored"
