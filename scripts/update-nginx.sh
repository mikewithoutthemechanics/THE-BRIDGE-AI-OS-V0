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
NGINX_ENABLED_DIR="/etc/nginx/sites-enabled"
BACKUP="${NGINX_AVAILABLE}.bak.$(date +%s)"

if [ -f "$NGINX_AVAILABLE" ]; then
  cp "$NGINX_AVAILABLE" "$BACKUP"
  echo "Backed up existing config to $BACKUP"
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

# Force a single active symlink: sites-enabled/bridgeai -> sites-available/bridgeai
rm -f "$NGINX_ENABLED_DIR/bridgeai"
ln -sf "$NGINX_AVAILABLE" "$NGINX_ENABLED_DIR/bridgeai"
echo "Symlink: $NGINX_ENABLED_DIR/bridgeai -> $NGINX_AVAILABLE"

cat > "$NGINX_AVAILABLE" <<'NGINX_CONF'
# Bridge AI OS — VPS nginx config (SPA)
# Managed by scripts/update-nginx.sh (do not hand-edit; this file is overwritten on each run.
# Any certbot-managed HTTPS blocks added here will be replaced; keep HTTPS config in a
# separate non-overwritten nginx file/include if needed.)

server {
    listen 80 default_server;
    server_name _;

    root /var/www/bridgeai/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /public/ {
        alias /var/www/bridgeai/public/;
    }

    location /health {
        proxy_pass http://127.0.0.1:8080/health;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
NGINX_CONF

echo "Config written to $NGINX_AVAILABLE"

if ! nginx -t 2>&1; then
  echo "nginx -t failed — restoring backup"
  if [ -f "$BACKUP" ]; then
    cp "$BACKUP" "$NGINX_AVAILABLE"
    nginx -t 2>&1 || true
  fi
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
