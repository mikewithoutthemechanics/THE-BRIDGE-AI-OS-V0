#!/bin/bash
# Idempotent nginx reconfiguration for Bridge AI OS VPS.
# Run as root on the VPS. Safe to re-run — writes sites-available/bridgeai,
# ensures a single active symlink and removes stale bak symlinks.
#
# Usage:
#   sudo bash scripts/update-nginx.sh
#
set -e

NGINX_AVAILABLE="/etc/nginx/sites-available/bridgeai"
NGINX_SSL_AVAILABLE="/etc/nginx/sites-available/bridgeai-ssl"
NGINX_ENABLED_DIR="/etc/nginx/sites-enabled"
BACKUP="${NGINX_AVAILABLE}.bak.$(date +%s)"
BACKUP_SSL="${NGINX_SSL_AVAILABLE}.bak.$(date +%s)"

if [ -f "$NGINX_AVAILABLE" ]; then
  cp "$NGINX_AVAILABLE" "$BACKUP"
  echo "Backed up existing config to $BACKUP"
fi

if [ -f "$NGINX_SSL_AVAILABLE" ]; then
  cp "$NGINX_SSL_AVAILABLE" "$BACKUP_SSL"
  echo "Backed up existing SSL config to $BACKUP_SSL"
fi

# Remove any stale bridgeai*.bak* symlinks from sites-enabled (including non-dangling and dangling ones)
find "$NGINX_ENABLED_DIR" -maxdepth 1 -type l -name 'bridgeai*.bak*' -delete
echo "Removed stale bak symlinks from $NGINX_ENABLED_DIR (if any)"

# Force a deterministic enabled-sites set by disabling the packaged default site
# and ensuring the managed bridgeai symlink is the active entry.
if [ -e "$NGINX_ENABLED_DIR/default" ] || [ -L "$NGINX_ENABLED_DIR/default" ]; then
  rm -f "$NGINX_ENABLED_DIR/default"
  echo "Removed default site from $NGINX_ENABLED_DIR/default"
fi

# Force deterministic symlinks: bridgeai (HTTP) + bridgeai-ssl (HTTPS)
rm -f "$NGINX_ENABLED_DIR/bridgeai" "$NGINX_ENABLED_DIR/bridgeai-ssl"
ln -sf "$NGINX_AVAILABLE" "$NGINX_ENABLED_DIR/bridgeai"
ln -sf "$NGINX_SSL_AVAILABLE" "$NGINX_ENABLED_DIR/bridgeai-ssl"
echo "Symlink: $NGINX_ENABLED_DIR/bridgeai -> $NGINX_AVAILABLE"
echo "Symlink: $NGINX_ENABLED_DIR/bridgeai-ssl -> $NGINX_SSL_AVAILABLE"

# ---- HTTP config (port 80): ACME challenges + redirect to HTTPS ----
cat > "$NGINX_AVAILABLE" <<'NGINX_CONF'
# Bridge AI OS — VPS nginx HTTP config
# Managed by scripts/update-nginx.sh (do not hand-edit — overwritten each run).
# HTTPS lives in sites-available/bridgeai-ssl (also managed by this script).

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

    location /health {
        proxy_pass http://127.0.0.1:8080/health;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
NGINX_CONF

echo "HTTP config written to $NGINX_AVAILABLE"

# ---- HTTPS config (port 443): SPA + API/auth/admin proxies ----
# All upstreams use 127.0.0.1 (NOT localhost) to avoid IPv6 resolution
# errors — Node services bind 0.0.0.0 (IPv4-only), so localhost->::1
# fails silently with nginx error 111.
cat > "$NGINX_SSL_AVAILABLE" <<'NGINX_SSL_CONF'
# Bridge AI OS — VPS nginx HTTPS config
# Managed by scripts/update-nginx.sh (do not hand-edit — overwritten each run).

server {
    listen 443 ssl http2;
    server_name bridge-ai-os.com www.bridge-ai-os.com go.ai-os.co.za ai-os.co.za;
    ssl_certificate /etc/letsencrypt/live/bridge-ai-os.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/bridge-ai-os.com/privkey.pem;

    root /var/www/bridgeai/frontend/dist;
    index index.html;

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

    location /events/stream {
        proxy_pass http://127.0.0.1:8080;
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
        add_header X-Accel-Buffering no always;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 30;
    }

    location /auth/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 30;
    }

    location /health {
        proxy_pass http://127.0.0.1:8080/health;
        proxy_set_header Host $host;
    }

    location /terminal {
        proxy_pass http://127.0.0.1:5002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }

    location /ws {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }

    location /svg-engine/ {
        proxy_pass http://127.0.0.1:7070/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }

    # Exact match: /admin and /admin/ show the admin-api HTML dashboard
    # (served at port 4011 root '/'). Prefix /admin/* below still proxies
    # JSON endpoints like /admin/overview (with path preserved).
    location = /admin  { return 301 /admin/; }
    location = /admin/ {
        proxy_pass http://127.0.0.1:4011/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /admin/ {
        # No trailing slash on proxy_pass — admin-api expects the full
        # /admin/* path (routes are registered as /admin/overview etc.)
        proxy_pass http://127.0.0.1:4011;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /public/ {
        alias /var/www/bridgeai/public/;
        try_files $uri =404;
    }

    # Chain: dist/ → public/ → SPA index.html
    # Legacy HTML/JS (bridge-nav.js, admin-sitemap.html, etc.) live in
    # public/; SPA assets live in dist/. Try both before SPA fallback.
    # $uri.html handles clean URLs like /home → /home.html in public/.
    location / {
        root /var/www/bridgeai/frontend/dist;
        try_files $uri $uri.html $uri/ @public;
    }

    location @public {
        root /var/www/bridgeai/public;
        try_files $uri $uri.html $uri/ @spa;
    }

    location @spa {
        root /var/www/bridgeai/frontend/dist;
        try_files /index.html =404;
    }
}

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
NGINX_SSL_CONF

echo "HTTPS config written to $NGINX_SSL_AVAILABLE"

if ! nginx -t 2>&1; then
  echo "nginx -t failed — restoring backups"
  [ -f "$BACKUP" ] && cp "$BACKUP" "$NGINX_AVAILABLE"
  [ -f "$BACKUP_SSL" ] && cp "$BACKUP_SSL" "$NGINX_SSL_AVAILABLE"
  nginx -t 2>&1 || true
  exit 1
fi

# Reload nginx
if systemctl is-active --quiet nginx 2>/dev/null; then
  systemctl reload nginx
  echo "nginx reloaded successfully"
else
  if nginx -s reload; then
    echo "nginx reloaded successfully without active systemd unit"
  elif systemctl restart nginx; then
    echo "nginx restarted successfully without active systemd unit"
  else
    echo "Failed to reload or restart nginx" >&2
    exit 1
  fi
fi

# Print active symlinks listing
echo "=== Active symlinks in $NGINX_ENABLED_DIR ==="
ls -la "$NGINX_ENABLED_DIR"

# Verify frontend build exists
DIST_INDEX=/var/www/bridgeai/frontend/dist/index.html
if [ -f "$DIST_INDEX" ]; then
  echo "=== frontend/dist/index.html present ($(wc -c < "$DIST_INDEX") bytes) ==="
else
  echo "WARN: $DIST_INDEX missing — frontend build may not have run"
fi
