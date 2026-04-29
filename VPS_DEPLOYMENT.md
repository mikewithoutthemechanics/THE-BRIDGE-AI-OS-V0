# Stabilized System - Git Push & VPS Deployment Guide

## Changes Summary

### Core Stabilization Files (NEW)
```
backend/
  main.py                         # FastAPI + WebSocket with deterministic heartbeat
  requirements.txt                # Python dependencies
  Dockerfile                      # Backend container

frontend/
  Dockerfile                      # Nginx container
  nginx.conf                      # Proxy config with WS upgrade, Permissions-Policy
  sw.js                           # Throttled Service Worker (1 fetch/5s)

public/js/
  admin-dashboard-stabilized.js   # Merged original + stabilization layer

services/
  control/nginx.conf              # Control edge service (direct 200)
  business/nginx.conf             # Business edge service (direct 200)
  treasury/nginx.conf             # Treasury edge service (NO redirects)

docker-compose.yml                # Full stack orchestration
ARCHITECTURE.md                   # Architecture diagram + channel matrix
STABILIZED.md                     # Quick reference
```

## Git Push Steps

```bash
# 1. Navigate to repo
cd C:\aoe-unified-final-main

# 2. Stage all stabilization files
git add backend/ frontend/ public/js/admin-dashboard-stabilized.js
git add admin-dashboard.html docker-compose.yml services/
git add ARCHITECTURE.md STABILIZED.md deploy-stabilized.* verify-stabilized.py

# 3. Commit
git commit -m "feat: stabilize system - isolate execution channels
- Service Worker throttled (1 fetch/5s, no navigation intercept)
- WebSocket deterministic heartbeat (3s ping, 5s timeout)
- Treasury isolated, no redirects
- Execution channels fully decoupled
- Permissions policy alignment
- Edge health validation

Fixes event loop starvation causing WS disconnects"

# 4. Push to remote
git push origin main
```

## VPS Deployment

### Prerequisites on VPS
- Docker + Docker Compose installed
- TCP ports 8080 (backend), 8082 (frontend) open
- Domain DNS configured:
  - control.supaco.ai → VPS IP
  - business.supaco.ai → VPS IP
  - treasury.supaco.ai → VPS IP

### Steps

```bash
# 1. Pull latest code
cd /opt/bridge-ai-os
git pull origin main

# 2. Build and start stabilized stack
docker-compose down  # Stop old containers if any
docker-compose build --no-cache
docker-compose up -d

# 3. Wait for health (30s)
sleep 30

# 4. Verify all services
docker-compose ps
curl -s http://localhost:8080/admin/overview | head -20
curl -s http://localhost:8082/ | head -5

# 5. Check edge health
curl -s http://localhost:8080/api/edge-health | python3 -m json.tool

# 6. View logs
docker-compose logs -f backend
docker-compose logs -f frontend
```

### Nginx External Configuration

On your VPS nginx (host, not container), configure subdomains:

```nginx
# /etc/nginx/sites-available/bridge-ai-os
server {
    listen 80;
    server_name control.supaco.ai;
    location / {
        proxy_pass http://localhost:8082;
        proxy_set_header Host $host;
        # Include other proxy headers...
    }
}

server {
    listen 80;
    server_name business.supaco.ai;
    location / {
        proxy_pass http://localhost:8082;
        # same as above
    }
}

server {
    listen 80;
    server_name treasury.supaco.ai;
    location / {
        proxy_pass http://localhost:8082;
        # same as above
    }
}
```

Then: `systemctl reload nginx`

## Verification

Run the automated test suite:

```bash
# On VPS
python3 verify-stabilized.py
```

Expected output:
```
✓ Edge services return 200 (no redirects)
✓ Backend health endpoints responding
✓ WebSocket heartbeat deterministic
✓ Permissions-Policy aligned
✓ Service Worker throttled
```

## Rollback

If needed:

```bash
# Stop stabilized stack
docker-compose down

# Restore previous version
git checkout <previous-commit-hash>
docker-compose up -d
```

## Monitoring

Key metrics to watch:
- WS connection stability (no timeouts)
- Frontend event loop delay (should be <16ms)
- Edge service response codes (must be 200)
- Service Worker fetch throttling (check browser console)

## Support

See ARCHITECTURE.md for detailed design and STABILIZED.md for quick reference.