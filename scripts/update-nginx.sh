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
#
# Resilience design:
#   - Static HTML from /var/www/bridgeai/public/ is served DIRECTLY by nginx.
#     Pages like /apps, /tokenomics, /join work even if gateway.js is down.
#   - Dynamic routes (API, SSE, auth, agents) fall through to gateway:8080.

# HTTP → HTTPS redirect for all domains
server {
    listen 80 default_server;
    server_name bridge-ai-os.com www.bridge-ai-os.com go.ai-os.co.za ai-os.co.za aid.ai-os.co.za _;

    location /.well-known/acme-challenge/ {
        root /var/www/letsencrypt;
        try_files $uri =404;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

# HTTPS — bridge-ai-os.com + go.ai-os.co.za
server {
    listen 443 ssl http2;
    server_name bridge-ai-os.com www.bridge-ai-os.com go.ai-os.co.za ai-os.co.za;
    ssl_certificate /etc/letsencrypt/live/bridge-ai-os.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/bridge-ai-os.com/privkey.pem;

    # Serve static files directly — gateway-bypass resilience
    root /var/www/bridgeai/public;
    index index.html;

    # Friendly-URL rewrites (mirror vercel.json rewrites)
    rewrite ^/apps$            /50-applications.html last;
    rewrite ^/dashboard$       /aoe-dashboard.html last;
    rewrite ^/treasury-dash$   /treasury-dashboard.html last;
    rewrite ^/status$          /system-status-dashboard.html last;
    rewrite ^/ehsa$            /ehsa-home.html last;
    rewrite ^/supac$           /supac-home.html last;
    rewrite ^/ban$             /ban-home.html last;
    rewrite ^/ubi$             /ubi-home.html last;
    rewrite ^/aid$             /aid-home.html last;
    rewrite ^/aurora$          /aurora-home.html last;

    # SSE — no buffering, gateway:8080
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

    # API — gateway:8080
    location /api/ {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 30;
    }

    # Auth — gateway:8080
    location /auth/ {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 30;
    }

    # WebSocket (terminal, brain)
    location /terminal {
        proxy_pass http://localhost:5002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }

    location /ws {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }

    # SVG Skill Engine
    location /svg-engine/ {
        proxy_pass http://localhost:7070/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }

    # Admin sidecar
    location /admin/ {
        proxy_pass http://localhost:4011/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Monitor UI
    location /monitor/ {
        proxy_pass http://localhost:3001/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Everything else: static file first, then gateway
    location / {
        try_files $uri $uri.html $uri/index.html @gateway;
    }

    location @gateway {
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
}

# HTTPS — aid.ai-os.co.za (dedicated cert)
server {
    listen 443 ssl http2;
    server_name aid.ai-os.co.za;
    ssl_certificate /etc/letsencrypt/live/aid.ai-os.co.za/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/aid.ai-os.co.za/privkey.pem;

    root /opt/ai-os/public;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
NGINX_CONF

ln -sf "$CONF" /etc/nginx/sites-enabled/bridgeai
rm -f /etc/nginx/sites-enabled/default

if nginx -t 2>&1; then
  if systemctl is-active --quiet nginx; then
    systemctl reload nginx
    echo "nginx reloaded successfully"
  else
    systemctl start nginx
    echo "nginx started successfully"
  fi
else
  echo "nginx -t failed — restoring backup"
  if [ -f "$BACKUP" ]; then
    cp "$BACKUP" "$CONF"
    nginx -t && systemctl reload nginx || true
  fi
  exit 1
fi
