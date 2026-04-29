# STABILIZED SYSTEM - DEPLOYMENT PACKAGE

## What Was Fixed

**Root Cause**: Event loop starvation from Service Worker fetch loops + misrouted treasury service (301 redirects) + WebSocket heartbeat starvation.

**Solution**: Full execution channel isolation.

### 1. Service Worker (stabilized/frontend/sw.js)
- Throttled to 1 fetch per 5 seconds
- Never intercepts navigation requests (prevents twin-wall.html loop)
- Cache-only for static assets (scripts, styles, images)
- All other requests pass through untouched

### 2. WebSocket (stabilized/backend/main.py + public/js/admin-dashboard-stabilized.js)
- Server sends "ping" every 3 seconds (deterministic)
- Client responds "pong" immediately
- Client closes connection if no pong within 5 seconds
- Heartbeat monitor runs in isolated interval, independent of message queue
- Client reconnection with exponential backoff (1s → 30s)

### 3. Treasury Routing (stabilized/services/treasury/nginx.conf)
- Dedicated service with unique IP/subnet in docker network
- NO redirects to business service
- Returns 200 directly on /api/health
- Isolated from other edge nodes

### 4. Execution Channels (public/js/admin-dashboard-stabilized.js)
```
WebSocket   → Isolated, real-time only
SSE         → Throttled to 10Hz max
HTTP Poll   → Separate intervals (2s, 10s)
Service Worker → Cache-only, throttled
UI Render   → requestAnimationFrame only
```

### 5. Permissions Alignment (frontend/nginx.conf + admin-dashboard.html)
- CSP: `Permissions-Policy: geolocation=(self)`
- Frontend checks `PermissionsGuard.geolocation.isEnabled()` before calling API
- No implicit assumptions about browser capabilities

### 6. Edge Health Validation (backend/main.py → /api/edge-health)
- Checks each domain returns 200 (not 301/302)
- Reports latency and errors
- Used by monitoring to detect topology issues

## Files Created/Modified

### Core Application Files
- `backend/main.py` – FastAPI service with WS heartbeat, SSE throttling, edge health
- `backend/requirements.txt` – Dependencies (fastapi, uvicorn, httpx, websockets, pydantic)
- `backend/Dockerfile` – Python container build
- `frontend/Dockerfile` – Nginx container build
- `frontend/nginx.conf` – Reverse proxy with WS upgrade, headers
- `frontend/sw.js` – Throttled Service Worker
- `public/js/admin-dashboard-stabilized.js` – Stabilized frontend (preserves original UI/UX)
- `admin-dashboard.html` – Updated script reference

### Infrastructure
- `docker-compose.yml` – Full stack (frontend, backend, control, business, treasury)
- `services/control/nginx.conf` – Control edge service
- `services/business/nginx.conf` – Business edge service
- `services/treasury/nginx.conf` – Treasury edge service (NO REDIRECTS)

### Documentation
- `ARCHITECTURE.md` – Text diagram, channel matrix, stability guarantees
- `STABILIZED.md` – Quick reference, access points, component map
- `VPS_DEPLOYMENT.md` – Full deployment instructions

### Scripts
- `deploy-stabilized.sh` / `deploy-stabilized.ps1` – Automated deployment
- `verify-stabilized.py` – Comprehensive test suite
- `quick-check.sh` / `quick-check.bat` – Quick health checks

## Deployment Instructions

### Option A: Local Docker (Recommended for Testing)

1. Ensure Docker Desktop running
2. Navigate to project root
3. Run: `docker-compose up -d`
4. Wait 10 seconds for health
5. Open: http://localhost:8082/admin-dashboard.html

### Option B: VPS Production

1. SSH to VPS, clone repo
2. Install Docker + Docker Compose
3. Configure DNS:
   - control.supaco.ai → VPS_IP
   - business.supaco.ai → VPS_IP
   - treasury.supaco.ai → VPS_IP
4. Run: `docker-compose up -d`
5. Configure external Nginx to proxy subdomains to port 8082
6. Verify: `python3 verify-stabilized.py`

### Option C: Manual Component Testing

If Docker is unavailable, test components individually:

**Backend only:**
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8080
```

**Frontend only** (requires backend running):
- Serve `admin-dashboard.html` via any static server on port 8082
- Ensure it proxies `/api/` and `/ws` to backend:8080

## Verification

### Automated
```bash
python verify-stabilized.py
```

Expected: All tests pass (edge services return 200, WS heartbeat, SW config, permissions).

### Manual
1. Open browser console on admin dashboard
2. Look for: `[SW] Registered` and `[WS] Connected`
3. No errors about heartbeat timeout
4. Network tab: Service Worker fetch count should NOT increase rapidly
5. Treasury health check should show 200, not 301

## Architecture Diagram

```
[Browser Main Thread]
    │
    ├─ UI Logic (RAF only)
    ├─ WebSocket (isolated, deterministic heartbeat)
    ├─ SSE (throttled 10Hz)
    ├─ HTTP Poll (2s/10s intervals)
    └─ Service Worker (cache-only, throttled 1/5s)
         │
    [Nginx Frontend:8082]
         │
    ├─ proxy /api → Backend:8080
    ├─ proxy /ws → Backend:8080 (upgrade)
    └─ static files + sw.js
         │
    [FastAPI Backend:8080]
         │
    ├─ /ws (WebSocket endpoint)
    ├─ /events/stream (SSE throttled)
    ├─ /admin/overview, /admin/topology
    └─ /api/edge-health (validates routing)
         │
    ┌────┴────┬─────┐
    ▼         ▼     ▼
Control   Business Treasury
(8081)    (8082)  (8083)
200 OK    200 OK  200 OK (NO REDIRECTS)
```

## Key Metrics

- **Event Loop Delay**: Should be <16ms (one frame)
- **WS Heartbeat**: 3s ping → pong within 5s
- **SW Fetches**: Max 1 per 5s per resource type
- **Edge Latency**: <100ms typical
- **Redirects**: 0 (all services return 200 directly)

## Rollback

```bash
# Stop stabilized stack
docker-compose down

# Restore previous commit
git checkout HEAD~1

# Start old version
docker-compose up -d
```

## Support

See ARCHITECTURE.md for detailed technical design and STABILIZED.md for quick reference.