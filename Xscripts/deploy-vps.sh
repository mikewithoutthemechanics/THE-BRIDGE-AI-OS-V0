#!/bin/bash
# =============================================================================
# BRIDGE AI OS — Full VPS Deployment
# Target: ai-os.co.za (102.208.231.53)
# Subdomains: go.ai-os.co.za → gateway:8080
# =============================================================================
set -e

VPS_IP="102.208.231.53"
DOMAIN="ai-os.co.za"
SUB_GO="go.${DOMAIN}"
APP_DIR="/opt/bridge-ai-os"
REPO="https://github.com/bridgeaios/THE-BRIDGE-AI-OS-V0.git"

echo ""
echo "  ⚡ BRIDGE AI OS — VPS DEPLOYMENT"
echo "  ═══════════════════════════════════"
echo "  Target: ${VPS_IP} (${DOMAIN})"
echo "  App Dir: ${APP_DIR}"
echo ""

# ── Step 1: System packages ──────────────────────────────────────────────────
echo "  [1/8] Installing system packages..."
sudo apt-get update -qq
sudo apt-get install -y -qq nginx certbot python3-certbot-nginx python3 python3-pip python3-venv git curl build-essential

# ── Step 2: Node.js (v20 LTS) ───────────────────────────────────────────────
echo "  [2/8] Installing Node.js..."
if ! command -v node &>/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y -qq nodejs
fi
echo "  ✓ Node $(node -v)"

# ── Step 3: PM2 ─────────────────────────────────────────────────────────────
echo "  [3/8] Installing PM2..."
sudo npm install -g pm2 2>/dev/null
echo "  ✓ PM2 $(pm2 -v)"

# ── Step 4: Clone / Pull repo ───────────────────────────────────────────────
echo "  [4/8] Setting up application..."
if [ -d "${APP_DIR}" ]; then
  cd "${APP_DIR}" && git pull origin main
else
  sudo git clone "${REPO}" "${APP_DIR}"
  sudo chown -R $USER:$USER "${APP_DIR}"
fi
cd "${APP_DIR}"

# ── Step 5: Install dependencies ────────────────────────────────────────────
echo "  [5/8] Installing dependencies..."
npm install --production
cd BAN && pip3 install -r requirements.txt --quiet && cd ..
cp Xpublic/*.html public/ 2>/dev/null || true
mkdir -p logs certs

# ── Step 6: Nginx config ────────────────────────────────────────────────────
echo "  [6/8] Configuring Nginx..."
sudo tee /etc/nginx/sites-available/bridge-ai-os > /dev/null << 'NGINX'
# Bridge AI OS — Nginx reverse proxy
# Serves: ai-os.co.za + go.ai-os.co.za

# Main domain → gateway (port 8080)
server {
    listen 80;
    server_name ai-os.co.za go.ai-os.co.za;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Gateway (main entry)
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }

    # Terminal WebSocket
    location /terminal {
        proxy_pass http://127.0.0.1:5002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400;
    }

    # BAN WebSocket + API
    location /ban/ {
        proxy_pass http://127.0.0.1:8001/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400;
    }

    # SSE events
    location /events/stream {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400;
    }

    # System API
    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # Health check (for uptime monitors)
    location /health {
        proxy_pass http://127.0.0.1:8080/health;
    }
}
NGINX

sudo ln -sf /etc/nginx/sites-available/bridge-ai-os /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
echo "  ✓ Nginx configured"

# ── Step 7: SSL (Let's Encrypt) ─────────────────────────────────────────────
echo "  [7/8] Setting up SSL..."
sudo certbot --nginx -d "${DOMAIN}" -d "${SUB_GO}" --non-interactive --agree-tos -m "admin@${DOMAIN}" 2>/dev/null || echo "  ⚠ SSL setup requires DNS to be pointed — run manually later"

# ── Step 8: Start with PM2 ──────────────────────────────────────────────────
echo "  [8/8] Starting services with PM2..."
cd "${APP_DIR}"
pm2 delete all 2>/dev/null || true
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup systemd -u $USER --hp /home/$USER 2>/dev/null || true

echo ""
echo "  ═══════════════════════════════════════════════════"
echo "  ✓ BRIDGE AI OS DEPLOYED"
echo "  ═══════════════════════════════════════════════════"
echo ""
echo "  Dashboard:  https://${DOMAIN}"
echo "  Gateway:    https://${SUB_GO}"
echo "  Onboarding: https://${SUB_GO}/onboarding.html"
echo "  Terminal:   https://${SUB_GO}/terminal.html"
echo "  BAN Engine: https://${SUB_GO}/ban"
echo "  Status:     https://${SUB_GO}/system-status-dashboard.html"
echo "  Health:     https://${SUB_GO}/health"
echo ""
echo "  PM2 Status: pm2 status"
echo "  PM2 Logs:   pm2 logs"
echo "  PM2 Monitor: pm2 monit"
echo ""
echo "  DNS REQUIRED:"
echo "    A record: ${DOMAIN}     → ${VPS_IP}"
echo "    A record: ${SUB_GO}     → ${VPS_IP}"
echo "  ═══════════════════════════════════════════════════"
