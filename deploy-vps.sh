#!/bin/bash
# BridgeAI Unified Server — VPS Deploy Script
# Target: go.ai-os.co.za (Webway VPS)
# Usage: bash deploy-vps.sh [VPS_IP] [VPS_USER]

set -e

VPS_IP="${1:-YOUR_VPS_IP}"
VPS_USER="${2:-root}"
VPS_DIR="/var/www/bridgeai"
DOMAIN="go.ai-os.co.za"

echo "=== BridgeAI Deploy → $VPS_USER@$VPS_IP ==="

# ── 1. Install dependencies on VPS (first deploy only) ──────────────────────
ssh "$VPS_USER@$VPS_IP" bash <<'REMOTE_SETUP'
  command -v node >/dev/null || (curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs)
  command -v pm2 >/dev/null || npm install -g pm2
  command -v nginx >/dev/null || apt-get install -y nginx
  command -v certbot >/dev/null || (apt-get install -y certbot python3-certbot-nginx)
  mkdir -p /var/www/bridgeai/logs
REMOTE_SETUP

# ── 2. Sync project files (exclude dev artifacts) ───────────────────────────
echo "Syncing files..."
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
  ./ "$VPS_USER@$VPS_IP:$VPS_DIR/"

# ── 3. Upload production env + database ─────────────────────────────────────
echo "Uploading .env.production..."
scp .env.production "$VPS_USER@$VPS_IP:$VPS_DIR/.env"

echo "Uploading users.db..."
scp users.db "$VPS_USER@$VPS_IP:$VPS_DIR/users.db"

# ── 4. Remote: install deps + run migrations + restart PM2 ──────────────────
ssh "$VPS_USER@$VPS_IP" bash <<REMOTE_DEPLOY
  set -e
  cd $VPS_DIR

  echo "Installing npm dependencies..."
  npm ci --omit=dev

  echo "Installing SVG Engine dependencies..."
  cd svg-engine && npm ci --omit=dev && cd ..

  echo "Running database migrations..."
  node migrations/run-migrations.js

  echo "Starting/restarting PM2 processes..."
  pm2 start ecosystem.config.js --env production || pm2 reload ecosystem.config.js --env production
  pm2 save

  echo "PM2 Status:"
  pm2 list
REMOTE_DEPLOY

# ── 5. Configure Nginx (first deploy only) ──────────────────────────────────
echo "Configuring Nginx..."
ssh "$VPS_USER@$VPS_IP" bash <<NGINX_SETUP
  cat > /etc/nginx/sites-available/bridgeai <<'NGINX_CONF'
server {
    listen 80;
    server_name go.ai-os.co.za www.go.ai-os.co.za;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 86400;
    }

    location /monitor/ {
        proxy_pass http://localhost:3001/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }

    location /svg-engine/ {
        proxy_pass http://localhost:7070/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_cache_bypass \$http_upgrade;
    }
}
NGINX_CONF

  ln -sf /etc/nginx/sites-available/bridgeai /etc/nginx/sites-enabled/
  rm -f /etc/nginx/sites-enabled/default
  nginx -t && systemctl reload nginx
  echo "Nginx configured"
NGINX_SETUP

# ── 6. SSL Certificate ───────────────────────────────────────────────────────
echo ""
echo "=== SSL Setup ==="
echo "Run this on the VPS to enable HTTPS:"
echo "  certbot --nginx -d $DOMAIN -d www.$DOMAIN"
echo ""

# ── 7. UFW Firewall ──────────────────────────────────────────────────────────
ssh "$VPS_USER@$VPS_IP" bash <<FIREWALL
  ufw allow 22/tcp   2>/dev/null || true
  ufw allow 80/tcp   2>/dev/null || true
  ufw allow 443/tcp  2>/dev/null || true
  ufw --force enable 2>/dev/null || true
  echo "Firewall: ports 22, 80, 443 open"
FIREWALL

# ── 8. PM2 auto-start on reboot ──────────────────────────────────────────────
ssh "$VPS_USER@$VPS_IP" "pm2 startup systemd -u $VPS_USER --hp /home/$VPS_USER 2>/dev/null || pm2 startup 2>/dev/null; pm2 save"

echo ""
echo "=== DEPLOY COMPLETE ==="
echo "  App:     http://$DOMAIN"
echo "  Monitor: http://$DOMAIN/monitor/"
echo "  Stats:   http://$DOMAIN/api/notion/stats"
echo "  Health:  http://$DOMAIN/health"
echo ""
echo "=== STILL NEEDED ==="
echo "  1. Fill PayFast keys in /var/www/bridgeai/.env on VPS"
echo "  2. Fill GitHub OAuth keys"
echo "  3. Run: certbot --nginx -d $DOMAIN"
echo "  4. Push Notion token: curl -X POST https://$DOMAIN/api/notion/sync"
