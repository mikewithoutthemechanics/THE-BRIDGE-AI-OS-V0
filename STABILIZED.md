# Stabilized Bridge AI OS System

## Architecture Fixes (v2.0)

1. **Service Worker**: Cache-only, throttled (1 fetch / 5s), no navigation interception
2. **WebSocket**: Deterministic heartbeat (3s ping, 5s timeout), isolated channel
3. **Treasury Service**: Dedicated origin, no redirects to business
4. **Execution Channels**: Fully decoupled (WS, SSE, Poll, SW, UI)
5. **Permissions Policy**: Aligned with frontend capabilities

## Quick Start

```bash
# Deploy all services
./deploy-stabilized.sh

# Verify stability
python verify-stabilized.py

# View logs
docker-compose logs -f backend
docker-compose logs -f frontend

# Stop services
docker-compose down
```

## Component Map

| Component        | Port  | Protocol   | Channel    |
|------------------|-------|------------|------------|
| Frontend         | 8082  | HTTP(S)    | UI         |
| Backend API      | 8080  | HTTP(S)    | Poll       |
| WebSocket        | 8080  | WS/WSS     | Real-time  |
| SSE              | 8080  | Event-Src  | Heartbeat  |
| Service Worker   | -     | Cache API  | Cache      |
| Control Service  | 8081  | HTTP       | Edge       |
| Business Service | 8082  | HTTP       | Edge       |
| Treasury Service | 8083  | HTTP       | Edge       |

## Stability Guarantees

- **Event loop starvation eliminated**: SW fetch throttled, SSE rate-limited
- **WS connection deterministic**: 3s ping interval, 5s timeout hard
- **Routing integrity**: Each service has unique IP, no 301/302 redirects
- **Policy alignment**: Geolocation explicitly disabled, feature detection required