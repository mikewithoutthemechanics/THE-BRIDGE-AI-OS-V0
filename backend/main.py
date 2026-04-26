"""
Bridge AI OS - Stabilized Backend Service
Implements: FastAPI + WebSocket with deterministic heartbeat + edge health validation
"""

import asyncio
import json
import time
from datetime import datetime
from typing import Set
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
import httpx

app = FastAPI(title="Bridge AI OS - Control Plane", version="2.0.0")

# === CORS: Same-origin only (strict zero-trust) ===
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://control.supaco.ai", "https://business.supaco.ai", "https://treasury.supaco.ai"],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "X-CSRF-Token"],
)

# === WebSocket Connection Manager (Isolated Real-Time Channel) ===
class ConnectionManager:
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
        self.heartbeat_interval = 3.0  # seconds
        self.heartbeat_timeout = 5.0   # seconds
        self.last_pong: dict = {}      # websocket -> timestamp

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)
        self.last_pong[websocket] = time.time()
        print(f"[WS] Connected: {websocket.client}")

    def disconnect(self, websocket: WebSocket):
        self.active_connections.discard(websocket)
        if websocket in self.last_pong:
            del self.last_pong[websocket]
        print(f"[WS] Disconnected: {websocket.client}")

    async def broadcast(self, message: dict):
        """Send message to all connected clients (isolated from HTTP path)"""
        disconnected = []
        for ws in self.active_connections:
            try:
                await ws.send_json(message)
            except Exception:
                disconnected.append(ws)

        for ws in disconnected:
            self.disconnect(ws)

    async def heartbeat_loop(self):
        """Deterministic heartbeat - runs in dedicated task, independent of message queue"""
        while True:
            await asyncio.sleep(self.heartbeat_interval)
            now = time.time()

            # Send ping to all connections
            dead_connections = []
            for ws in self.active_connections:
                try:
                    await ws.send_text("ping")
                    # Check timeout
                    if now - self.last_pong.get(ws, now) > self.heartbeat_timeout:
                        dead_connections.append(ws)
                except Exception:
                    dead_connections.append(ws)

            # Clean up dead connections
            for ws in dead_connections:
                try:
                    await ws.close()
                except Exception:
                    pass
                self.disconnect(ws)

    def update_pong(self, websocket: WebSocket):
        """Called when pong received - updates last heartbeat time"""
        self.last_pong[websocket] = time.time()


manager = ConnectionManager()
heartbeat_task = None

@app.on_event("startup")
async def startup_event():
    """Launch heartbeat loop as independent daemon task"""
    global heartbeat_task
    heartbeat_task = asyncio.create_task(manager.heartbeat_loop())
    print("[WS] Heartbeat loop started (3s interval)")


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup heartbeat task"""
    if heartbeat_task:
        heartbeat_task.cancel()
        try:
            await heartbeat_task
        except asyncio.CancelledError:
            pass


# === WebSocket Endpoint (Dedicated Real-Time Channel) ===
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # Wait for message (non-blocking)
            data = await websocket.receive_text()

            # Handle pong responses (heartbeat ack)
            if data == "pong":
                manager.update_pong(websocket)
                continue

            # Process application messages
            try:
                msg = json.loads(data)
                # Echo back for demo; in production, route to event bus
                await websocket.send_json({"type": "ack", "received": msg})
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "message": "invalid json"})

    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        print(f"[WS] Error: {e}")
        manager.disconnect(websocket)


# === SSE (Server-Sent Events) - Throttled Event Stream ===
@app.get("/events/stream")
async def event_stream(request: Request):
    """
    SSE endpoint with strict throttling to prevent event loop starvation.
    Sends events at max 10Hz (100ms interval).
    """
    from fastapi.responses import StreamingResponse

    async def event_generator():
        last_send = 0
        min_interval = 0.1  # 100ms max rate

        while True:
            # Check client disconnected
            if await request.is_disconnected():
                break

            now = time.time()
            if now - last_send >= min_interval:
                # Throttled event
                yield f"data: {json.dumps({'type': 'heartbeat', 'ts': now})}\n\n"
                last_send = now

            await asyncio.sleep(0.01)  # Prevent CPU spinning

    return StreamingResponse(event_generator(), media_type="text/event-stream")


# === HTTP API Endpoints ===

class ServiceStatus(BaseModel):
    name: str
    status: str
    cpu: float
    mem_mb: float
    restarts: int


@app.get("/admin/overview")
async def admin_overview():
    """
    Returns aggregate system status.
    Frontend polls this at 2s interval (throttled).
    """
    # Simulated services - in production, query actual service registry
    services = [
        ServiceStatus(name="control-plane", status="online", cpu=12.3, mem_mb=256, restarts=0),
        ServiceStatus(name="business-logic", status="online", cpu=23.1, mem_mb=512, restarts=0),
        ServiceStatus(name="treasury", status="online", cpu=8.7, mem_mb=128, restarts=0),
    ]

    return JSONResponse({
        "services_up": sum(1 for s in services if s.status == "online"),
        "services_total": len(services),
        "git_commit": "stabilized-v2.0.0",
        "cpu_avg": round(sum(s.cpu for s in services) / len(services), 1),
        "mem_avg": round(sum(s.mem_mb for s in services) / len(services), 1),
         "services": [s.model_dump() for s in services]
    })


@app.get("/admin/topology")
async def admin_topology():
    """
    Returns service topology graph.
    Frontend polls this at 10s interval (throttled).
    """
    return JSONResponse({
        "nodes": [
            {"id": "bridge-gateway", "type": "hub"},
            {"id": "control-plane", "type": "service"},
            {"id": "business-logic", "type": "service"},
            {"id": "treasury", "type": "service"},
        ],
        "edges": [
            {"from": "bridge-gateway", "to": "control-plane"},
            {"from": "bridge-gateway", "to": "business-logic"},
            {"from": "bridge-gateway", "to": "treasury"},
        ]
    })


# === EDGE HEALTH VALIDATION ===
# Purpose: Validate each service resolves directly (no redirects)

@app.get("/api/edge-health")
async def edge_health():
    """
    Validates edge service routing integrity.
    Checks that each domain resolves directly to its service (200 OK, not 301).
    """
    from httpx import AsyncClient

    edges = {
        "control.supaco.ai": "https://control.supaco.ai/api/health",
        "business.supaco.ai": "https://business.supaco.ai/api/health",
        "treasury.supaco.ai": "https://treasury.supaco.ai/api/health",
    }

    results = {}
    async with AsyncClient(timeout=5.0) as client:
        for domain, url in edges.items():
            try:
                start = time.time()
                resp = await client.get(url, follow_redirects=False)
                latency = (time.time() - start) * 1000

                results[domain] = {
                    "status": resp.status_code,
                    "latency_ms": round(latency, 2),
                    "ok": resp.status_code == 200,
                    "error": None if resp.status_code == 200 else f"Expected 200, got {resp.status_code}"
                }
            except Exception as e:
                results[domain] = {
                    "status": 0,
                    "latency_ms": 0,
                    "ok": False,
                    "error": str(e)
                }

    # Overall health
    all_ok = all(r["ok"] for r in results.values())
    return JSONResponse({
        "healthy": all_ok,
        "edges": results,
        "timestamp": datetime.utcnow().isoformat() + "Z"
    })


# === Permission Policy Endpoint ===
@app.get("/api/permissions")
async def permissions_policy():
    """
    Declares enforced browser permissions policy.
    Frontend must align with this before calling browser APIs.
    """
    return JSONResponse({
        "geolocation": "self",  # Only same-origin allowed
        "camera": "none",
        "microphone": "none",
        "clipboard": "self"
    })


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8080,
        reload=False,  # Production: deterministic startup
        log_level="info"
    )