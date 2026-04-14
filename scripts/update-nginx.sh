#!/bin/bash
# Idempotent nginx reconfiguration for Bridge AI OS VPS.
# Run as root on the VPS. Safe to re-run — writes sites-available/bridgeai,
# preserves any certbot-managed HTTPS block via `nginx -t` gating.
#
# Usage:
#   sudo bash scripts/update-nginx.sh
#
set -e

CONF=/etc/nginx/sites-available/bridgeai
BACKUP=/etc/nginx/sites-available/bridgeai.bak.$(date +%s)

if [ -f "$CONF" ]; then
  cp "$CONF" "$BACKUP"
  echo "Backed up existing config to $BACKUP"
fi

cat > "$CONF" <<'NGINX_CONF'
# Bridge AI OS — VPS nginx config
# Managed by scripts/update-nginx.sh (do not hand-edit; certbot HTTPS blocks OK)

server {
    listen 80 default_server;
    server_name bridge-ai-os.com www.bridge-ai-os.com go.ai-os.co.za _;

    # Gateway router (gateway.js :8080) owns all friendly routes:
    # /tokenomics, /gateway, /join, /twin, /marketplace, etc.
    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
    }

    # API calls go to the unified backend on :3000 (CRM, LeadGen, OSINT, Payments)
    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120;
    }

    # Monitor UI (pm2 monitor on :3001, if running)
    location /monitor/ {
        proxy_pass http://localhost:3001/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # SVG Skill Engine on :7070
    location /svg-engine/ {
        proxy_pass http://localhost:7070/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }

    # SSE — Cloudflare-safe (buffering off, chunking off, 25s keepalives from app)
    # Served by gateway.js on :8080 (see gateway.js:199)
    location /events/stream {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
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

ln -sf "$CONF" /etc/nginx/sites-enabled/bridgeai
rm -f /etc/nginx/sites-enabled/default

if nginx -t 2>&1; then
  systemctl reload nginx
  echo "nginx reloaded successfully"
else
  echo "nginx -t failed — restoring backup"
  if [ -f "$BACKUP" ]; then
    cp "$BACKUP" "$CONF"
    nginx -t && systemctl reload nginx || true
  fi
  exit 1
fi
