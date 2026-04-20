# Proposed settings diffs — review before apply

Captured: 2026-04-19. Source: live harvest from bridge-ai-os.com.

All changes go through `scripts/update-nginx.sh` on the VPS (NOT hand-edits to the deployed nginx config). Watchdog + journald + pm2-logrotate are one-shots.

---

## P0.1 — nginx security headers (add inside each `server { listen 443 ssl; ... }` block)

```nginx
# --- Security headers (apply to all 443 server blocks) ---
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
add_header X-Frame-Options             "SAMEORIGIN" always;
add_header X-Content-Type-Options      "nosniff" always;
add_header Referrer-Policy             "strict-origin-when-cross-origin" always;
add_header Permissions-Policy          "geolocation=(), microphone=(), camera=(), payment=()" always;
```

Applies to 3 server blocks: main (bridge-ai-os.com etc.), admin.bridge-ai-os.com, aid.ai-os.co.za. Must be added to `scripts/update-nginx.sh` so redeploys preserve them.

---

## P0.2 — activate api_limit zone (inside `location /api/` on main + admin blocks)

```nginx
location /api/ {
    limit_req zone=api_limit burst=20 nodelay;   # NEW — 120r/m + 20 burst
    proxy_pass http://127.0.0.1:8080;
    ...
}
```

---

## P1.1 — tighten TLS (edit `/etc/nginx/nginx.conf` lines 34-35)

```diff
-     ssl_protocols TLSv1 TLSv1.1 TLSv1.2 TLSv1.3; # Dropping SSLv3, ref: POODLE
+     ssl_protocols TLSv1.2 TLSv1.3;               # Drop deprecated TLS 1.0/1.1
      ssl_prefer_server_ciphers on;
+     ssl_ciphers 'ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256';
+     ssl_stapling on;
+     ssl_stapling_verify on;
+     resolver 1.1.1.1 8.8.8.8 valid=300s;
+     resolver_timeout 5s;
```

---

## P1.2 — watchdog PM2_HOME fix (`/usr/local/bin/bridge-watchdog.sh`)

```diff
 #!/bin/bash
 # Bridge AI OS — Service Watchdog
 # Pings all critical services every 30s; restarts via systemd if unhealthy

+export PM2_HOME=/etc/.pm2
+export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
+
 SERVICES=(
   "3030:bridge-auth:bridge-auth-node"
   ...
```

Without this, `pm2 restart` in the watchdog targets `/root/.pm2` (empty) — restarts silently do nothing.

---

## P1.3 — pm2-logrotate (one-time)

```bash
PM2_HOME=/etc/.pm2 pm2 install pm2-logrotate
PM2_HOME=/etc/.pm2 pm2 set pm2-logrotate:max_size 10M
PM2_HOME=/etc/.pm2 pm2 set pm2-logrotate:retain 7
PM2_HOME=/etc/.pm2 pm2 set pm2-logrotate:compress true
PM2_HOME=/etc/.pm2 pm2 set pm2-logrotate:rotateInterval "0 0 * * *"
```

---

## P1.4 — pm2 startup (one-time, boot persistence)

```bash
PM2_HOME=/etc/.pm2 pm2 startup systemd -u root --hp /root
# pm2 prints a `sudo env ...` command — run whatever it prints
PM2_HOME=/etc/.pm2 pm2 save
```

---

## P1.5 — journald bounds (`/etc/systemd/journald.conf`)

```diff
 [Journal]
+SystemMaxUse=500M
+SystemKeepFree=1G
+SystemMaxFileSize=50M
+MaxRetentionSec=30day
```

Then: `systemctl restart systemd-journald`

---

## P1.6 — investigate bridge-auth down (port 3030)

```bash
systemctl status bridge-auth-node
journalctl -u bridge-auth-node --since '1 hour ago' -n 50
```

Watchdog SHOULD be restarting it — if it's in a crash loop, logs will show why. Don't mask the failure; fix the root cause.

---

## P2.1 — clean cert cruft (only after confirming unused)

```bash
# DO NOT run until you confirm nothing references these:
grep -rn "go.ai-os.co.za-0001\|go.ai-os.co.za-0002" /etc/nginx/ /etc/letsencrypt/
# if empty, then:
certbot delete --cert-name go.ai-os.co.za-0001
certbot delete --cert-name go.ai-os.co.za-0002
```

---

## P2.2 — audit unknown listeners

- port 3002: unknown node process
- port 4012: unknown node process
- port 5001: PM2 node (not in harvested PM2 list — stale daemon?)
- port 8001: python3

Run `lsof -i :3002 -P -n` etc. to identify.

---

## Apply order (transactional)

1. Backup: `cp /etc/nginx/sites-enabled/bridgeai-ssl /root/bridgeai-ssl.bak.$(date +%s)`
2. Backup: `cp /etc/nginx/nginx.conf /root/nginx.conf.bak.$(date +%s)`
3. Backup: `cp /usr/local/bin/bridge-watchdog.sh /root/bridge-watchdog.sh.bak.$(date +%s)`
4. Patch `scripts/update-nginx.sh` to include P0.1 + P0.2 changes
5. Edit `/etc/nginx/nginx.conf` for P1.1
6. Edit `/usr/local/bin/bridge-watchdog.sh` for P1.2
7. Edit `/etc/systemd/journald.conf` for P1.5
8. `nginx -t` — HALT if fails
9. `systemctl reload nginx`
10. `systemctl restart systemd-journald`
11. `pkill -HUP -f bridge-watchdog` or `systemctl restart bridge-watchdog.service`
12. One-shots: P1.3 (logrotate), P1.4 (startup)
13. Investigate P1.6 (bridge-auth)
14. Verify: curl -I https://bridge-ai-os.com/ | grep -i strict-transport

Rollback (if any step fails):
- Restore nginx from backup, `systemctl reload nginx`
- Restore watchdog from backup, restart watchdog loop
- Restore journald.conf, `systemctl restart systemd-journald`
