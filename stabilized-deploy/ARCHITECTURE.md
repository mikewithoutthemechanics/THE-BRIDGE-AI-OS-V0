# STABILIZED SYSTEM ARCHITECTURE

## Topology: Isolated Execution Channels

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         BROWSER (Main Thread)                           │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  UI Logic (requestAnimationFrame only - non-blocking)          │    │
│  │  ─ Canvas rendering ─ Metrics display ─ User interactions      │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                              │                                            │
│        ┌─────────────────────┼─────────────────────┐                    │
│        │                     │                     │                    │
│        ▼                     ▼                     ▼                    │
│  ┌──────────┐       ┌──────────────┐      ┌──────────┐               │
│  │  SSE     │       │  HTTP Poll   │      │  WS      │               │
│  │(throttled│       │(throttled,   │      │(isolated │               │
│  │100ms min)│       │separate ch.) │      │channel)  │               │
│  └──────────┘       └──────────────┘      └──────────┘               │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  Service Worker (PASSIVE CACHE ONLY - NO LOOPS)                  │    │
│  │  ─ Cache match → network fallback                                │
│  │  ─ Throttled: 1 fetch / 5s per worker                           │
│  │  ─ Never intercepts navigation requests                          │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────┴──────────┐
                    │  Edge Proxy (Nginx) │
                    │  Port 8082          │
                    └─────────┬──────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐   ┌──────────────────┐   ┌──────────────────┐
│ CONTROL       │   │ BUSINESS         │   │ TREASURY         │
│ supaco.ai     │   │ supaco.ai        │   │ supaco.ai        │
│               │   │                  │   │                  │
│ Port: 8081    │   │ Port: 8082       │   │ Port: 8083       │
│               │   │                  │   │                  │
│ /api/health   │   │ /api/health      │   │ /api/health      │
│ → 200 OK      │   │ → 200 OK         │   │ → 200 OK         │
│ NO REDIRECTS  │   │ NO REDIRECTS     │   │ NO REDIRECTS     │
└───────────────┘   └──────────────────┘   └──────────────────┘
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐   ┌──────────────────┐   ┐  ┌──────────────────┐
│ Control       │   │ Business Logic   │   │  │ Treasury Engine  │
│ Plane         │   │ Service          │   │  │ Service          │
│ (isolated)    │   │ (isolated)       │   │  │ (isolated)       │
└───────────────┘   └──────────────────┘   ┘  └──────────────────┘


## Channel Isolation Matrix

| Channel      | Purpose           | Rate Limit     | Timing Source   | Shared with? |
|--------------|-------------------|----------------|-----------------|--------------|
| WebSocket    | Real-time events  | Unrestricted   | Dedicated timer | None         |
| SSE          | Heartbeats        | Max 10Hz       | Independent loop| None         |
| HTTP Poll    | Status queries    | 2s / 10s       | setTimeout      | None         |
| Service Worker| Cache ops        | 1 / 5s         | Throttle guard  | None         |
| UI Render    | Visual updates    | RAF only       | requestAnimationFrame | None |

## Stability Guarantees

1. **No Event Loop Starvation**
   - Service Worker fetch throttled to 1/5s
   - SSE runs at fixed 100ms intervals (max)
   - WS heartbeat operates in dedicated interval (independent)

2. **Deterministic Heartbeat**
   - Server sends "ping" every 3s (fixed schedule)
   - Client responds "pong" immediately
   - Client closes if no pong within 5s (hard timeout)
   - Reconnection with exponential backoff (1s → 30s)

3. **Routing Integrity**
   - Each edge service has unique IP/subnet
   - No DNS aliasing between services
   - Health checks validate direct 200 responses
   - 301/302 redirects flagged as failures

4. **Permissions Alignment**
   - CSP declares: `Permissions-Policy: geolocation=(self)`
   - Frontend checks `navigator.geolocation` via `PermissionsGuard`
   - No implicit assumptions about feature availability

5. **Zero-Trust Enforcement**
   - All cross-origin requests require explicit allowlist
   - Credentials: include (cookies only)
   - CSRF double-submit pattern for state changes