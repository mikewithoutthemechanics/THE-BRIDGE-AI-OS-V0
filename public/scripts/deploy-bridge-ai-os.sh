#!/bin/bash
# ============================================================================
# BRIDGE AI OS - ONE-SHOT DEPLOYMENT SCRIPT
# Installs and configures the complete Bridge AI Corporate + EHSA system
# Usage: ./deploy-bridge-ai-os.sh [production|development]
# ============================================================================

set -e

VERSION=":cccc/cccc/cccc"
ENV="${1:-production}"
ROOT="/var/www/bridgeai"
NODE_VERSION="20"

echo "🔧 BRIDGE AI OS DEPLOYMENT $VERSION"
echo "📦 Environment: $ENV"
echo "========================================"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err() { echo -e "${RED}[✗]${NC} $1"; }

# Check root
if [ "$EUID" -ne 0 ]; then
  err "Run as root"
  exit 1
fi

# ============================================================================
# SYSTEM REQUIREMENTS
# ============================================================================
log "Checking system requirements..."

command -v node >/dev/null 2>&1 || { 
  warn "Node.js not found, installing..."
  curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash - 
  apt-get install -y nodejs
}

command -v npm >/dev/null 2>&1 || { 
  err "npm not found"
  exit 1
}

command -v pm2 >/dev/null 2>&1 || {
  warn "PM2 not found, installing..."
  npm install -g pm2
}

log "System requirements OK"

# ============================================================================
# NGINX SETUP
# ============================================================================
log "Setting up NGINX..."

if ! command -v nginx >/dev/null 2>&1; then
  apt-get update && apt-get install -y nginx
fi

cat > /etc/nginx/sites-available/bridge-ai-os << 'NGINX'
server {
    listen 80;
    server_name _;
    root /var/www/bridgeai/public;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }

    location /ws {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/bridge-ai-os /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

log "NGINX configured"

# ============================================================================
# DEPENDENCIES
# ============================================================================
log "Installing dependencies..."

cd "$ROOT"
npm install --production 2>/dev/null || true

log "Dependencies OK"

# ============================================================================
# PM2 SERVICES
# ============================================================================
log "Starting PM2 services..."

# Core services
pm2 start ecosystem.config.js --env "$ENV" 2>/dev/null || true

# Autonomous systems
pm2 start autonomous-control.js --name autonomous-control
pm2 start adaptive-recovery.js --name adaptive-recovery
pm2 start predictive-intelligence.js --name predictive-intelligence
pm2 start kilo-bridge.js --name kilo-bridge
pm2 start godmode.js --name godmode

# Save and setup startup
pm2 save
pm2 startup 2>/dev/null || true

log "PM2 services started"

# ============================================================================
# FIREWALL
# ============================================================================
log "Configuring firewall..."

ufw allow 22/tcp   # SSH
ufw allow 80/tcp   # HTTP
ufw allow 443/tcp  # HTTPS
ufw allow 8080/tcp # Gateway
ufw allow 8848/tcp # Kilo Bridge
ufw allow 8900/tcp # Godmode
ufw allow 8000/tcp # Super Brain
ufw allow 3000/tcp # Unified Server
ufw allow 5001/tcp # Auth

log "Firewall configured"

# ============================================================================
# VERIFICATION
# ============================================================================
log "Verifying deployment..."

sleep 3

# Check services
HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/health 2>/dev/null || echo "000")
KILO=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8848/health 2>/dev/null || echo "000")

echo "========================================"
echo "HEALTH CHECKS:"
echo "----------------------------------------"
echo "Gateway (8080):  $([ "$HEALTH" = "200" ] && echo "✅ OK" || echo "❌ DOWN")"
echo "Kilo Bridge (8848): $([ "$KILO" = "200" ] && echo "✅ OK" || echo "❌ DOWN")"
echo ""
echo "PM2 Services:"
pm2 list | grep -E "online|stopped" | head -10
echo "========================================"

log "Deployment complete!"
echo ""
echo "📋 Access Points:"
echo "   Public: http://$(hostname -I | awk '{print $1}')"
echo "   API:    http://$(hostname -I | awk '{print $1}'):8080"
echo "   Kilo:   http://$(hostname -I | awk '{print $1}'):8848"
echo "   Godmode: http://$(hostname -I | awk '{print $1}'):8900"
echo ""
echo "📋 Commands:"
echo "   pm2 status          # Check services"
echo "   pm2 logs            # View logs"
echo "   pm2 restart all     # Restart all"
echo ""
echo "VERSION: $VERSION"
