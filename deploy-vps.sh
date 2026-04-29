<<<<<<< HEAD
# ============================================================================
# BRIDGE AI OS - VPS Deployment Script
# ============================================================================
# Run this on your VPS to set up the environment
# ============================================================================

# Create application directory
mkdir -p /var/www/bridgeai
cd /var/www/bridgeai

# Create .env file with production configuration
cat > .env << 'EOF'
# ============================================================================
# THE BRIDGE AI OS - Production Environment Configuration
# ============================================================================
# VPS Deployment - Update API keys below
# ============================================================================

# --- Core Application Settings -----------------------------------------------
NODE_ENV=production
PORT=8080
PROMPT_ENGINE_MODE=live

# Domain Configuration (update to your actual domain)
DOMAIN=bridgeaios.com
SSL_ENABLED=true

# --- Core HTTP Gate (Admin & Settings) ---------------------------------------
ORCHESTRA_ADMIN_TOKEN=97YBKPuj5wtzHEkmbiOyQTWJLRh4Nofe6pMFS8rUVGvAsxcD2la0ZXd1qgCIn3
ORCHESTRA_RATE_LIMIT=60
ORCHESTRA_ALLOW_IFRAME=0

# --- Config Advisor Service -------------------------------------------------
ADVISOR_SHARED_SECRET=9bc38cf3f01df7177dc5639ea20878bb56d2c72ba91cb28a057d64f9385314b4
ADVISOR_PORT=4721
ADVISOR_PROVIDER=auto

# --- AI Provider Configuration ----------------------------------------------

# Anthropic (REQUIRED - Add your key here)
ANTHROPIC_API_KEY=YOUR_ANTHROPIC_API_KEY_HERE
ANTHROPIC_MODEL=claude-haiku-4-5-20251001

# OpenAI (optional fallback)
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini

# OpenAI-Compatible Gateway (optional)
OPENAI_COMPAT_API_KEY=
OPENAI_COMPAT_BASE_URL=
OPENAI_COMPAT_MODEL=

# --- MCP Configuration ------------------------------------------------------
MCP_WPCOM_URL=https://public-api.wordpress.com/wpcom/v2/mcp/v1
MCP_TIMEOUT=30000

# --- Logging Configuration --------------------------------------------------
LOG_LEVEL=warn
LOG_MAX_SIZE=10m
LOG_MAX_FILES=5

# --- Security Configuration -------------------------------------------------
CORS_ORIGINS=https://bridgeaios.com,https://www.bridgeaios.com
RATE_LIMIT_WINDOW=15
RATE_LIMIT_MAX_REQUESTS=100

# --- Performance Configuration ---------------------------------------------
CACHE_ENABLED=true
CACHE_TTL=3600
COMPRESSION_ENABLED=true

# --- Monitoring Configuration ----------------------------------------------
HEALTH_CHECK_INTERVAL=30000
METRICS_ENABLED=true

# --- Database Configuration -------------------------------------------------
DATABASE_URL=postgresql://bridge_user:secure_password_123@localhost:5432/bridge_ai_os
REDIS_URL=redis://localhost:6379

# --- Supabase Configuration -------------------------------------------------
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
SUPABASE_ANON_KEY=

# --- Email Configuration ----------------------------------------------------
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# --- Analytics Configuration ------------------------------------------------
GA_TRACKING_ID=GA-XXXXXXXXXX
MIXPANEL_TOKEN=your-mixpanel-token

# ============================================================================
EOF

# Set proper permissions
chmod 600 .env

echo "✅ Environment file created successfully!"
echo "📝 IMPORTANT: Edit .env and add your actual API keys:"
echo "   - ANTHROPIC_API_KEY (required)"
echo "   - DATABASE_URL with real credentials"
echo "   - SMTP settings if using email"
echo ""
echo "🔧 Next: Install Node.js and dependencies"
echo "   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -"
echo "   sudo apt-get install -y nodejs"
echo "   npm install -g pm2"
echo ""
echo "📦 Then install your application:"
echo "   git clone [your-repo-url] app"
echo "   cd app && npm install"
echo "   pm2 start ecosystem.config.js --env production"
=======
#!/bin/bash
# BridgeAI Unified Server — VPS Deploy Script
# Target: bridge-ai-os.com (Webway VPS)
# Usage: bash deploy-vps.sh [VPS_IP] [VPS_USER]

set -e

VPS_IP="${1:-YOUR_VPS_IP}"
VPS_USER="${2:-root}"
VPS_DIR="/var/www/bridgeai"
DOMAIN="bridge-ai-os.com"

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
  pm2 start ecosystem.admin-api.config.js || pm2 reload ecosystem.admin-api.config.js
  pm2 save

  echo "PM2 Status:"
  pm2 list
REMOTE_DEPLOY

# ── 5. Configure Nginx (first deploy only) ──────────────────────────────────
echo "Configuring Nginx..."
ssh "$VPS_USER@$VPS_IP" bash <<NGINX_SETUP
  cat > /etc/nginx/sites-available/bridgeai <<'NGINX_CONF'
server {
    listen 80 default_server;
    server_name bridge-ai-os.com www.bridge-ai-os.com go.ai-os.co.za;

    # Gateway router (gateway.js :8080) owns all friendly routes:
    # /tokenomics, /gateway, /join, /twin, /marketplace, etc.
    # server.js on :3000 is the unified backend for CRM/LeadGen/API only.
    location / {
        proxy_pass http://localhost:8080;
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

    # API calls go to the unified backend on :3000 (CRM, LeadGen, OSINT, Payments)
    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120;
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

    # SSE — Cloudflare-safe (buffering off, no chunking, 25s keepalives emitted by app)
    # Served by gateway.js on :8080 (see gateway.js:199)
    location /events/stream {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        chunked_transfer_encoding off;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
        keepalive_timeout 65;
        add_header X-Accel-Buffering no always;
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
echo "  certbot --nginx -d go.ai-os.co.za   # extend cert to the short vanity domain"
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
>>>>>>> a65a24150727639fde77daadeba4361af473827a
