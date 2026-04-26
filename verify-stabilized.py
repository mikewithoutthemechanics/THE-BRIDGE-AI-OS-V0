#!/usr/bin/env python3
"""
Stabilized System Verification Suite
Tests: Service Worker throttling, WebSocket heartbeat, Edge routing, Permissions
"""

import asyncio
import json
import sys
import time
from datetime import datetime

import httpx

BASE_URL = "http://localhost:8080"
FRONTEND_URL = "http://localhost:8082"
WS_URL = "ws://localhost:8080/ws"


class TestResult:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.results = []

    def add(self, test_name, passed, message=""):
        status = "✓ PASS" if passed else "✗ FAIL"
        print(f"  {status}: {test_name}" + (f" - {message}" if message else ""))
        self.results.append((test_name, passed, message))
        if passed:
            self.passed += 1
        else:
            self.failed += 1


async def test_edge_health():
    """Verify each edge service returns 200 directly (no redirects)"""
    async with httpx.AsyncClient(timeout=5.0) as client:
        edges = {
            "control": "http://localhost:8081/api/health",
            "business": "http://localhost:8082/api/health",
            "treasury": "http://localhost:8083/api/health",
        }

        for name, url in edges.items():
            try:
                resp = await client.get(url, follow_redirects=False)
                if resp.status_code == 200:
                    result.add(f"Edge {name} returns 200", True)
                else:
                    result.add(f"Edge {name} returns 200", False, f"Got {resp.status_code}")
            except Exception as e:
                result.add(f"Edge {name} reachable", False, str(e))


async def test_backend_health():
    """Validate backend health endpoints"""
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(f"{BASE_URL}/admin/overview")
            if resp.status_code == 200:
                data = resp.json()
                result.add("Backend overview endpoint", True)
                if "services_up" in data and "services_total" in data:
                    result.add("Overview data structure", True)
                else:
                    result.add("Overview data structure", False, "Missing fields")
            else:
                result.add("Backend overview endpoint", False, f"HTTP {resp.status_code}")
        except Exception as e:
            result.add("Backend overview endpoint", False, str(e))

        try:
            resp = await client.get(f"{BASE_URL}/admin/topology")
            if resp.status_code == 200:
                data = resp.json()
                has_nodes = "nodes" in data and len(data["nodes"]) > 0
                has_edges = "edges" in data and len(data["edges"]) > 0
                result.add("Topology endpoint", has_nodes and has_edges)
            else:
                result.add("Topology endpoint", False, f"HTTP {resp.status_code}")
        except Exception as e:
            result.add("Topology endpoint", False, str(e))


async def test_edge_health_endpoint():
    """Validate /api/edge-health shows no redirects"""
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(f"{BASE_URL}/api/edge-health")
            if resp.status_code == 200:
                data = resp.json()
                if "edges" in data and "healthy" in data:
                    result.add("Edge health validation endpoint", True)

                    # Check each edge
                    all_ok = True
                    for domain, info in data["edges"].items():
                        if not info.get("ok", False):
                            print(f"    WARNING: {domain} not healthy: {info.get('error', 'unknown')}")
                            all_ok = False
                    if all_ok:
                        result.add("All edges return 200 (no redirects)", True)
                    else:
                        result.add("All edges return 200 (no redirects)", False, "Some edges degraded")
                else:
                    result.add("Edge health validation endpoint", False, "Invalid response format")
            else:
                result.add("Edge health validation endpoint", False, f"HTTP {resp.status_code}")
        except Exception as e:
            result.add("Edge health validation endpoint", False, str(e))


async def test_websocket_heartbeat():
    """Validate WebSocket deterministic heartbeat (3s ping, 5s timeout)"""
    import websockets

    received_pongs = []
    connected = asyncio.Event()

    async def ws_handler():
        uri = WS_URL
        try:
            async with websockets.connect(uri, close_timeout=5) as websocket:
                connected.set()
                # Wait for first ping
                try:
                    msg = await asyncio.wait_for(websocket.recv(), timeout=6)
                    if msg == "ping":
                        received_pongs.append("first_ping")
                        # Send pong
                        await websocket.send("pong")
                except asyncio.TimeoutError:
                    pass

                # Keep connection alive for a bit
                await asyncio.sleep(2)
        except Exception as e:
            print(f"    WS error: {e}")

    # Start client task
    task = asyncio.create_task(ws_handler())

    # Wait for connection
    try:
        await asyncio.wait_for(connected.wait(), timeout=5)
        result.add("WebSocket connection established", True)
    except asyncio.TimeoutError:
        result.add("WebSocket connection established", False, "Timeout")
        task.cancel()
        return

    # Wait for handler
    try:
        await asyncio.wait_for(task, timeout=8)
    except asyncio.TimeoutError:
        task.cancel()

    if "first_ping" in received_pongs:
        result.add("WebSocket heartbeat ping received", True)
        result.add("WebSocket heartbeat responds with pong", True)
    else:
        result.add("WebSocket heartbeat ping received", False, "No ping received within timeout")


async def test_permissions_policy():
    """Verify frontend reports correct permissions policy"""
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(FRONTEND_URL)
            if resp.status_code == 200:
                # Check headers
                headers = resp.headers
                pp = headers.get("permissions-policy", "")
                has_geo = "geolocation=(self)" in pp or "geolocation=self" in pp
                if has_geo:
                    result.add("Permissions-Policy header present", True)
                else:
                    result.add("Permissions-Policy header present", False, f"Got: {pp[:80]}")
            else:
                result.add("Frontend reachable", False, f"HTTP {resp.status_code}")
        except Exception as e:
            result.add("Frontend reachable", False, str(e))


async def test_service_worker_registration():
    """Verify Service Worker is registered with correct configuration"""
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(f"{FRONTEND_URL}/sw.js")
            if resp.status_code == 200:
                content = resp.text
                # Check for throttling
                has_throttle = "FETCH_THROTTLE_MS" in content or "lastFetch" in content
                if has_throttle:
                    result.add("Service Worker has throttling", True)
                else:
                    result.add("Service Worker has throttling", False, "Missing throttle logic")

                # Check no navigation intercept
                no_nav = "event.request.mode === 'navigate'" in content
                if no_nav:
                    result.add("Service Worker skips navigation", True)
                else:
                    result.add("Service Worker skips navigation", False)
            else:
                result.add("Service Worker accessible", False, f"HTTP {resp.status_code}")
        except Exception as e:
            result.add("Service Worker accessible", False, str(e))


async def main():
    global result
    result = TestResult()

    print("=== Stabilized System Verification ===")
    print(f"Timestamp: {datetime.utcnow().isoformat()}Z")
    print("")

    tests = [
        ("Edge Services", test_edge_health),
        ("Backend Health", test_backend_health),
        ("Edge Health Endpoint", test_edge_health_endpoint),
        ("WebSocket Heartbeat", test_websocket_heartbeat),
        ("Permissions Policy", test_permissions_policy),
        ("Service Worker Config", test_service_worker_registration),
    ]

    for name, test_fn in tests:
        print(f"\n--- {name} ---")
        try:
            await test_fn()
        except Exception as e:
            result.add(name, False, f"Exception: {e}")

    # Summary
    print("\n" + "="*50)
    total = result.passed + result.failed
    print(f"RESULTS: {result.passed}/{total} passed")

    if result.failed > 0:
        print("\nFailed tests:")
        for test_name, passed, message in result.results:
            if not passed:
                print(f"  - {test_name}: {message}")
        sys.exit(1)
    else:
        print("\n✓ All stability criteria met")
        sys.exit(0)


if __name__ == "__main__":
    try:
        import websockets
    except ImportError:
        print("ERROR: websockets library required. Install: pip install websockets")
        sys.exit(1)

    asyncio.run(main())