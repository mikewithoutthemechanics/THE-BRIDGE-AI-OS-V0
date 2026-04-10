#!/bin/bash
# Bridge AI OS — VPS Fix Script
# Paste this into your VPS terminal (PuTTY / Webway panel)
# Run: bash /var/www/bridgeai/vps-fix.sh

set -e
VPS_DIR="/var/www/bridgeai"
cd "$VPS_DIR"

echo "=== [1/4] Applying nginx config ==="
cp "$VPS_DIR/nginx-bridge.conf" /etc/nginx/sites-available/bridgeai
ln -sf /etc/nginx/sites-available/bridgeai /etc/nginx/sites-enabled/bridgeai
rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
nginx -t
systemctl reload nginx
echo "Nginx reloaded OK"

echo ""
echo "=== [2/4] Issuing SSL certs for vertical-market subdomains ==="
# Requires DNS for all 6 domains to point to this server first
certbot --nginx \
  -d ehsa.ai-os.co.za \
  -d hospitalinabox.ai-os.co.za \
  -d aid.ai-os.co.za \
  -d rootedearth.ai-os.co.za \
  -d aurora.ai-os.co.za \
  -d ubi.ai-os.co.za \
  --non-interactive --agree-tos -m admin@ai-os.co.za
echo "Certbot done"

echo ""
echo "=== [3/4] Restarting gateway ==="
npm ci --omit=dev 2>/dev/null || npm install --omit=dev
pm2 restart bridge-gateway
echo "Gateway restarted"

echo ""
echo "=== [4/4] Status ==="
pm2 list
nginx -t
echo ""
echo "=== DONE ==="
echo "Test: curl -I https://ehsa.ai-os.co.za/"
echo "Test: curl https://go.ai-os.co.za/ban"
echo "Test: curl -I https://go.ai-os.co.za/abaas.html"
