#!/bin/bash
# ============================================================
# P0/P1 Batch Apply — Bridge AI OS VPS (bridge-ai-os.com)
# ============================================================
# Review before running. Creates timestamped backups of every
# file it modifies; run the ROLLBACK block at the end if anything
# breaks.
#
# Scope:
#   P0.1  nginx security headers (3 server blocks)
#   P0.2  activate api_limit rate zone on /api/
#   P1.1  tighten TLS (drop 1.0/1.1, add ciphers, OCSP)
#   P1.2  watchdog PM2_HOME fix
#   P1.3  pm2-logrotate install + config
#   P1.4  pm2 startup systemd
#   P1.5  journald bounds
#
# Deferred (separate investigation):
#   P1.6  bridge-auth-node DOWN — run after batch
#   P2.1  cert cruft cleanup — needs destructive confirmation
#   P2.2  unknown port owners — audit only
# ============================================================
set -e
STAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR=/root/bridge-backups/$STAMP
mkdir -p "$BACKUP_DIR"
echo "[apply] backups → $BACKUP_DIR"

NGINX_SSL=/etc/nginx/sites-enabled/bridgeai-ssl
NGINX_CONF=/etc/nginx/nginx.conf
WATCHDOG=/usr/local/bin/bridge-watchdog.sh
JOURNALD=/etc/systemd/journald.conf

cp "$NGINX_SSL" "$BACKUP_DIR/bridgeai-ssl"
cp "$NGINX_CONF" "$BACKUP_DIR/nginx.conf"
cp "$WATCHDOG"   "$BACKUP_DIR/bridge-watchdog.sh"
cp "$JOURNALD"   "$BACKUP_DIR/journald.conf"
echo "[apply] backups saved"

# ---------- P0.1: security headers (3 server blocks) ----------
# We inject headers right after the ssl_certificate_key line in each 443 server.
# If headers already present (re-run), grep -q skips.
python3 - <<'PY'
import re, pathlib
p = pathlib.Path('/etc/nginx/sites-enabled/bridgeai-ssl')
s = p.read_text()
block = (
    "\n    # --- Security headers (P0 hardening) ---\n"
    "    add_header Strict-Transport-Security \"max-age=63072000; includeSubDomains; preload\" always;\n"
    "    add_header X-Frame-Options             \"SAMEORIGIN\" always;\n"
    "    add_header X-Content-Type-Options      \"nosniff\" always;\n"
    "    add_header Referrer-Policy             \"strict-origin-when-cross-origin\" always;\n"
    "    add_header Permissions-Policy          \"geolocation=(), microphone=(), camera=(), payment=()\" always;\n"
)
if "Strict-Transport-Security" in s:
    print("[P0.1] headers already present — skipping")
else:
    # insert once per `ssl_certificate_key ...;` occurrence
    s2 = re.sub(
        r'(ssl_certificate_key\s+[^\n]+;\n)',
        r'\1' + block,
        s,
    )
    p.write_text(s2)
    print(f"[P0.1] headers injected into {s2.count('Strict-Transport-Security')} server blocks")
PY

# ---------- P0.2: activate api_limit on /api/ (main + admin) ----------
python3 - <<'PY'
import re, pathlib
p = pathlib.Path('/etc/nginx/sites-enabled/bridgeai-ssl')
s = p.read_text()
if "zone=api_limit" in s:
    print("[P0.2] limit_req already present — skipping")
else:
    # inject limit_req as first line inside each `location /api/ {` block
    s2 = re.sub(
        r'(location /api/ \{\n)',
        r'\1        limit_req zone=api_limit burst=20 nodelay;\n',
        s,
    )
    p.write_text(s2)
    print(f"[P0.2] limit_req activated in {s2.count('zone=api_limit')} /api/ locations")
PY

# ---------- P1.1: TLS tightening ----------
python3 - <<'PY'
import re, pathlib
p = pathlib.Path('/etc/nginx/nginx.conf')
s = p.read_text()

if "TLSv1.2 TLSv1.3" in s and "ssl_stapling on" in s:
    print("[P1.1] TLS already hardened — skipping")
else:
    # replace weak protocols
    s = re.sub(
        r'ssl_protocols\s+TLSv1\s+TLSv1\.1\s+TLSv1\.2\s+TLSv1\.3;[^\n]*',
        'ssl_protocols TLSv1.2 TLSv1.3; # P1.1 — dropped TLS 1.0/1.1',
        s,
    )
    # add ciphers + stapling after ssl_prefer_server_ciphers line (if not already)
    if "ssl_stapling on" not in s:
        extra = (
            "\n     ssl_ciphers 'ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:"
            "ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:"
            "ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256';"
            "\n     ssl_stapling on;"
            "\n     ssl_stapling_verify on;"
            "\n     resolver 1.1.1.1 8.8.8.8 valid=300s;"
            "\n     resolver_timeout 5s;"
        )
        s = re.sub(
            r'(ssl_prefer_server_ciphers\s+on;)',
            r'\1' + extra,
            s,
        )
    p.write_text(s)
    print("[P1.1] TLS tightened")
PY

# ---------- P1.2: watchdog PM2_HOME fix ----------
if grep -q '^export PM2_HOME=' /usr/local/bin/bridge-watchdog.sh; then
  echo "[P1.2] watchdog already patched — skipping"
else
  sed -i '2a export PM2_HOME=/etc/.pm2\nexport PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin' /usr/local/bin/bridge-watchdog.sh
  echo "[P1.2] watchdog PM2_HOME exported"
fi

# ---------- P1.5: journald bounds ----------
if grep -q '^SystemMaxUse=' /etc/systemd/journald.conf; then
  echo "[P1.5] journald already bounded — skipping"
else
  cat >> /etc/systemd/journald.conf <<'JCONF'

# --- P1.5 bounds (added 2026-04-19) ---
SystemMaxUse=500M
SystemKeepFree=1G
SystemMaxFileSize=50M
MaxRetentionSec=30day
JCONF
  echo "[P1.5] journald bounds appended"
fi

# ---------- Validate nginx BEFORE reload ----------
echo "[apply] nginx -t ..."
if ! nginx -t 2>&1; then
  echo "[apply] NGINX VALIDATION FAILED — rolling back nginx files"
  cp "$BACKUP_DIR/bridgeai-ssl" "$NGINX_SSL"
  cp "$BACKUP_DIR/nginx.conf"   "$NGINX_CONF"
  echo "[apply] nginx files restored. HALTING."
  exit 1
fi
echo "[apply] nginx -t OK"

# ---------- Reload ----------
systemctl reload nginx
systemctl restart systemd-journald
# Restart watchdog loop — find and kill, systemd will respawn, or bash loop will exit
pkill -HUP -f bridge-watchdog.sh 2>/dev/null || true
if systemctl list-unit-files | grep -q bridge-watchdog; then
  systemctl restart bridge-watchdog 2>/dev/null || true
fi

# ---------- P1.3: pm2-logrotate ----------
export PM2_HOME=/etc/.pm2
if PM2_HOME=/etc/.pm2 pm2 list 2>/dev/null | grep -q pm2-logrotate; then
  echo "[P1.3] pm2-logrotate already installed"
else
  PM2_HOME=/etc/.pm2 pm2 install pm2-logrotate
  PM2_HOME=/etc/.pm2 pm2 set pm2-logrotate:max_size 10M
  PM2_HOME=/etc/.pm2 pm2 set pm2-logrotate:retain 7
  PM2_HOME=/etc/.pm2 pm2 set pm2-logrotate:compress true
  PM2_HOME=/etc/.pm2 pm2 set pm2-logrotate:rotateInterval "0 0 * * *"
  echo "[P1.3] pm2-logrotate configured"
fi

# ---------- P1.4: pm2 startup (prints command to run) ----------
echo "[P1.4] Run the 'sudo env ...' command that pm2 prints below if not already registered:"
PM2_HOME=/etc/.pm2 pm2 startup systemd -u root --hp /root || true
PM2_HOME=/etc/.pm2 pm2 save

# ---------- Verify ----------
echo
echo "========== VERIFY =========="
echo "HSTS header:"
curl -sI https://bridge-ai-os.com/ | grep -i "strict-transport\|x-frame\|content-type-options\|referrer-policy" || echo "NONE FOUND"
echo
echo "TLS version (should be TLSv1.3):"
curl -sI https://bridge-ai-os.com/ -w "%{ssl_version}\n" -o /dev/null
echo
echo "Rate limit test (expect eventual 429):"
for i in 1 2 3 4 5; do curl -s -o /dev/null -w "%{http_code} " https://bridge-ai-os.com/api/health; done; echo
echo
echo "Watchdog env:"
head -5 /usr/local/bin/bridge-watchdog.sh
echo
echo "[apply] DONE — backups in $BACKUP_DIR"

# ============================================================
# ROLLBACK (if needed):
#   cp $BACKUP_DIR/bridgeai-ssl     /etc/nginx/sites-enabled/bridgeai-ssl
#   cp $BACKUP_DIR/nginx.conf       /etc/nginx/nginx.conf
#   cp $BACKUP_DIR/bridge-watchdog.sh /usr/local/bin/bridge-watchdog.sh
#   cp $BACKUP_DIR/journald.conf    /etc/systemd/journald.conf
#   nginx -t && systemctl reload nginx
#   systemctl restart systemd-journald
#   pkill -HUP -f bridge-watchdog.sh
# ============================================================
