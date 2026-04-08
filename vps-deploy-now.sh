#!/bin/bash
# Run this ON the VPS (ssh in first, then paste this whole script)
# Or run locally: ssh root@102.208.231.53 'bash -s' < vps-deploy-now.sh

set -e
cd /var/www/bridgeai || { echo "Creating /var/www/bridgeai..."; mkdir -p /var/www/bridgeai && cd /var/www/bridgeai; }

echo "============================================"
echo "  Bridge AI OS — VPS Deploy"
echo "============================================"

# Pull latest code
if [ -d ".git" ]; then
  echo "[1/5] Pulling latest from GitHub..."
  git pull origin main
else
  echo "[1/5] Cloning repo..."
  git clone https://github.com/bridgeaios/THE-BRIDGE-AI-OS-V0.git .
fi

# Install deps
echo "[2/5] Installing dependencies..."
npm ci --omit=dev 2>/dev/null || npm install --omit=dev

# Copy env if not present
if [ ! -f .env ]; then
  echo "[3/5] No .env found — creating from template..."
  cat > .env << 'ENVFILE'
NODE_ENV=production
PORT=3000
BRAIN_PORT=8000
GATEWAY_PORT=8080

# LLM — Kilo free tier
KILO_API_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbnYiOiJwcm9kdWN0aW9uIiwia2lsb1VzZXJJZCI6ImJjOTlkNjM5LTJlNWQtNDk4NS1iM2M4LTE0NDFhODM1YWI5OSIsImFwaVRva2VuUGVwcGVyIjpudWxsLCJ2ZXJzaW9uIjozLCJpYXQiOjE3NzU2NjI5MjEsImV4cCI6MTkzMzM0MjkyMX0.WQkLrdtgWPFZa9ztD8rIkctMkfhHrKkrR6iCgElaq7U
LLM_PROVIDER_ORDER=kilo,anthropic,openrouter,openai

# Fill these from your local .env:
JWT_SECRET=CHANGE_ME
BRIDGE_INTERNAL_SECRET=CHANGE_ME
BRIDGE_SIWE_JWT_SECRET=CHANGE_ME
PAYFAST_MERCHANT_ID=14638844
PAYFAST_MERCHANT_KEY=CHANGE_ME
PAYFAST_PASSPHRASE=CHANGE_ME
ENVFILE
  echo "  !! IMPORTANT: Edit .env and fill in the CHANGE_ME values !!"
else
  echo "[3/5] .env exists — keeping current config"
fi

# Run migrations if they exist
echo "[4/5] Running migrations..."
node migrations/run-migrations.js 2>/dev/null || echo "  No migrations to run"

# Start/restart PM2
echo "[5/5] Restarting services..."
if pm2 list 2>/dev/null | grep -q "bridge-gateway"; then
  pm2 restart ecosystem.config.js --env production
else
  pm2 start ecosystem.config.js --env production
fi
pm2 save

echo ""
echo "============================================"
echo "  DEPLOY COMPLETE"
echo "============================================"
pm2 list
echo ""
echo "Test endpoints:"
echo "  curl http://localhost:8080/health"
echo "  curl http://localhost:8080/api/brdg/token"
echo "  curl http://localhost:8080/api/llm/status"
echo "  curl http://localhost:8080/api/plans"
echo ""
