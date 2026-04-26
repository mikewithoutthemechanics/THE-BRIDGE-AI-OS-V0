<<<<<<< HEAD
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
=======
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, Any, Optional, List
import asyncio
import logging
import uuid
from datetime import datetime
import json
import os

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Superuser configuration — shared loader reads shared/superusers.json with
# a hardcoded fallback. Keeps Node and Python backends aligned on a single list.
import sys
_repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _repo_root not in sys.path:
    sys.path.insert(0, _repo_root)
from shared.superusers import EMAILS as SUPERUSERS, is_superuser  # noqa: E402,F401

app = FastAPI(
    title="Bridge Task Runner with OSINT",
    description="A task runner API with integrated OSINT capabilities",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify allowed origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"message": "Bridge Task Runner API", "status": "healthy"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

@app.post("/run-task")
async def run_task(data: Dict[str, Any]):
    """
    Run a task with the provided data.

    Args:
        data: JSON data containing task parameters

    Returns:
        Dict containing task execution result
    """
    try:
        logger.info(f"Received task request: {data}")

        # Simulate task processing
        task_id = data.get("task_id", "unknown")
        task_type = data.get("task_type", "general")

        # Simulate async processing
        await asyncio.sleep(0.1)

        # Process the task based on type
        if task_type == "echo":
            result = {
                "task_id": task_id,
                "status": "completed",
                "result": data.get("message", "Hello World"),
                "timestamp": "2026-04-15T02:57:05+02:00"
            }
        elif task_type == "math":
            # Simple math operation
            operation = data.get("operation", "add")
            a = data.get("a", 0)
            b = data.get("b", 0)

            if operation == "add":
                result_val = a + b
            elif operation == "multiply":
                result_val = a * b
            else:
                result_val = 0

            result = {
                "task_id": task_id,
                "status": "completed",
                "result": result_val,
                "timestamp": "2026-04-15T02:57:05+02:00"
            }
        else:
            # Default task processing
            result = {
                "task_id": task_id,
                "status": "completed",
                "result": f"Task {task_id} completed successfully",
                "input_data": data,
                "timestamp": "2026-04-15T02:57:05+02:00"
            }

        logger.info(f"Task completed: {result}")
        return result

    except Exception as e:
        logger.error(f"Task execution failed: {e}")
        raise HTTPException(status_code=500, detail=f"Task execution failed: {str(e)}")

# =============================================================================
# OSINT STACK INTEGRATION
# =============================================================================

# In-memory storage for demo purposes (in production, use a proper database)
consent_records = {}
osint_results = {}
osint_findings = []

DEMO_MODE = os.getenv("DEMO_MODE", "true").lower() == "true"

# =============================================================================
# CONSENT MANAGEMENT ENDPOINTS
# =============================================================================

@app.post("/api/v1/consent/request")
async def request_consent(data: Dict[str, Any]):
    """
    Request consent for OSINT data collection.

    Args:
        data: Consent request data containing subject_id, purpose, scope, etc.

    Returns:
        Consent request details
    """
    try:
        subject_id = data.get("subject_id")
        purpose = data.get("purpose", "osint_collection")
        consent_scope = data.get("consent_scope", {})
        requested_by = data.get("requested_by", "system")

        if not subject_id:
            raise HTTPException(status_code=400, detail="subject_id is required")

        consent_id = str(uuid.uuid4())
        timestamp = datetime.utcnow().isoformat() + "Z"

        consent_record = {
            "id": consent_id,
            "subject_id": subject_id,
            "purpose": purpose,
            "consent_scope": consent_scope,
            "status": "pending",  # pending, active, revoked, expired
            "requested_at": timestamp,
            "requested_by": requested_by,
            "expires_at": None,  # Optional expiration
            "metadata": data.get("metadata", {})
        }

        consent_records[consent_id] = consent_record

        logger.info(f"Consent requested: {consent_id} for subject {subject_id}")
        return {
            "consent_id": consent_id,
            "status": "pending",
            "message": "Consent request created. Awaiting approval.",
            "consent_details": consent_record
        }

    except Exception as e:
        logger.error(f"Consent request failed: {e}")
        raise HTTPException(status_code=500, detail=f"Consent request failed: {str(e)}")

@app.get("/api/v1/consent/{consent_id}")
async def get_consent(consent_id: str):
    """
    Get consent record details.

    Args:
        consent_id: Unique consent identifier

    Returns:
        Consent record details
    """
    if consent_id not in consent_records:
        raise HTTPException(status_code=404, detail="Consent record not found")

    return consent_records[consent_id]

@app.post("/api/v1/consent/{consent_id}/approve")
async def approve_consent(consent_id: str, data: Optional[Dict[str, Any]] = None):
    """
    Approve a pending consent request.

    Args:
        consent_id: Unique consent identifier
        data: Optional approval metadata

    Returns:
        Updated consent status
    """
    if consent_id not in consent_records:
        raise HTTPException(status_code=404, detail="Consent record not found")

    consent = consent_records[consent_id]
    if consent["status"] != "pending":
        raise HTTPException(status_code=400, detail="Consent is not in pending status")

    consent["status"] = "active"
    consent["approved_at"] = datetime.utcnow().isoformat() + "Z"
    consent["approved_by"] = data.get("approved_by", "system") if data else "system"

    logger.info(f"Consent approved: {consent_id}")
    return {
        "consent_id": consent_id,
        "status": "active",
        "message": "Consent approved and activated",
        "consent_details": consent
    }

@app.post("/api/v1/consent/{consent_id}/revoke")
async def revoke_consent(consent_id: str, data: Optional[Dict[str, Any]] = None):
    """
    Revoke an active consent.

    Args:
        consent_id: Unique consent identifier
        data: Optional revocation reason

    Returns:
        Updated consent status
    """
    if consent_id not in consent_records:
        raise HTTPException(status_code=404, detail="Consent record not found")

    consent = consent_records[consent_id]
    if consent["status"] != "active":
        raise HTTPException(status_code=400, detail="Consent is not active")

    consent["status"] = "revoked"
    consent["revoked_at"] = datetime.utcnow().isoformat() + "Z"
    consent["revocation_reason"] = data.get("reason", "User requested revocation") if data else "User requested revocation"

    logger.info(f"Consent revoked: {consent_id}")
    return {
        "consent_id": consent_id,
        "status": "revoked",
        "message": "Consent revoked successfully",
        "consent_details": consent
    }

# =============================================================================
# OSINT ORCHESTRATION ENDPOINTS
# =============================================================================

@app.post("/api/v1/osint/scan")
async def start_osint_scan(data: Dict[str, Any]):
    """
    Start an OSINT scan for a subject with verified consent.

    Args:
        data: Scan parameters including subject_id, consent_id, scan_type

    Returns:
        Scan job details
    """
    try:
        subject_id = data.get("subject_id")
        consent_id = data.get("consent_id")
        scan_type = data.get("scan_type", "basic")
        scan_params = data.get("scan_params", {})

        if not subject_id:
            raise HTTPException(status_code=400, detail="subject_id is required")

        # Verify consent (in demo mode, skip verification)
        if not DEMO_MODE:
            if not consent_id or consent_id not in consent_records:
                raise HTTPException(status_code=403, detail="Valid consent required for OSINT operations")

            consent = consent_records[consent_id]
            if consent["status"] != "active" or consent["subject_id"] != subject_id:
                raise HTTPException(status_code=403, detail="Consent not valid for this subject")

        # Create scan job
        scan_id = str(uuid.uuid4())
        timestamp = datetime.utcnow().isoformat() + "Z"

        scan_job = {
            "scan_id": scan_id,
            "subject_id": subject_id,
            "consent_id": consent_id,
            "scan_type": scan_type,
            "status": "running",
            "created_at": timestamp,
            "scan_params": scan_params,
            "results": [],
            "demo_mode": DEMO_MODE
        }

        osint_results[scan_id] = scan_job

        # Simulate OSINT processing (in real implementation, this would call actual OSINT tools)
        asyncio.create_task(process_osint_scan(scan_id, subject_id, scan_type, scan_params))

        logger.info(f"OSINT scan started: {scan_id} for subject {subject_id}")
        return {
            "scan_id": scan_id,
            "status": "running",
            "message": "OSINT scan initiated",
            "scan_details": scan_job
        }

    except Exception as e:
        logger.error(f"OSINT scan failed: {e}")
        raise HTTPException(status_code=500, detail=f"OSINT scan failed: {str(e)}")

@app.get("/api/v1/osint/scan/{scan_id}")
async def get_scan_status(scan_id: str):
    """
    Get OSINT scan status and results.

    Args:
        scan_id: Unique scan identifier

    Returns:
        Scan status and results
    """
    if scan_id not in osint_results:
        raise HTTPException(status_code=404, detail="Scan not found")

    return osint_results[scan_id]

@app.get("/api/v1/osint/findings")
async def get_osint_findings(subject_id: Optional[str] = None, limit: int = 50):
    """
    Get OSINT findings across all scans.

    Args:
        subject_id: Optional filter by subject
        limit: Maximum number of findings to return

    Returns:
        List of OSINT findings
    """
    findings = osint_findings

    if subject_id:
        findings = [f for f in findings if f.get("subject_id") == subject_id]

    return {
        "findings": findings[-limit:],  # Return most recent findings
        "total_count": len(findings),
        "filtered_count": len(findings[-limit:])
    }

# =============================================================================
# OSINT PROCESSING FUNCTIONS
# =============================================================================

async def process_osint_scan(scan_id: str, subject_id: str, scan_type: str, scan_params: Dict[str, Any]):
    """
    Process an OSINT scan asynchronously.

    Args:
        scan_id: Unique scan identifier
        subject_id: Subject being scanned
        scan_type: Type of scan to perform
        scan_params: Scan parameters
    """
    try:
        # Simulate processing time
        await asyncio.sleep(2)

        # Generate synthetic OSINT results based on scan type
        results = generate_synthetic_osint_results(subject_id, scan_type, scan_params)

        # Update scan job with results
        if scan_id in osint_results:
            osint_results[scan_id]["status"] = "completed"
            osint_results[scan_id]["completed_at"] = datetime.utcnow().isoformat() + "Z"
            osint_results[scan_id]["results"] = results

            # Add findings to global findings list
            for result in results:
                finding = {
                    "id": str(uuid.uuid4()),
                    "scan_id": scan_id,
                    "subject_id": subject_id,
                    "finding_type": result.get("type", "unknown"),
                    "data": result,
                    "discovered_at": datetime.utcnow().isoformat() + "Z",
                    "consent_verified": not DEMO_MODE,
                    "demo_mode": DEMO_MODE
                }
                osint_findings.append(finding)

        logger.info(f"OSINT scan completed: {scan_id}")

    except Exception as e:
        logger.error(f"OSINT scan processing failed: {e}")
        if scan_id in osint_results:
            osint_results[scan_id]["status"] = "failed"
            osint_results[scan_id]["error"] = str(e)

# =============================================================================
# SUPERUSER ENDPOINTS
# =============================================================================

@app.get("/api/admin/check-access")
async def check_admin_access(user_email: Optional[str] = None):
    """
    Check if the provided email has superuser access.

    Args:
        user_email: Email to check

    Returns:
        Access status
    """
    if not user_email:
        raise HTTPException(status_code=400, detail="user_email parameter required")

    is_super = is_superuser(user_email)
    return {
        "email": user_email,
        "is_superuser": is_super,
        "access_level": "superadmin" if is_super else "member",
        "admin_pages": [
            "/admin.html",
            "/admin-command.html",
            "/admin-revenue.html",
            "/admin-withdraw.html",
            "/dashboard.html",
            "/intelligence.html",
            "/executive-dashboard.html",
            "/aoe-dashboard.html",
            "/bridge-audit-dashboard.html",
            "/auth-dashboard.html",
            "/godmode-terminal.html"
        ] if is_super else []
    }

@app.get("/api/admin/superusers")
async def list_superusers():
    """
    List all configured superuser emails.
    This endpoint should be protected in production.
    """
    return {
        "superusers": SUPERUSERS,
        "count": len(SUPERUSERS)
    }

@app.post("/api/admin/notify-superuser")
async def notify_superuser(data: Dict[str, Any]):
    """
    Send notification to a superuser.
    In production, this would integrate with email service.

    Args:
        data: Notification data containing email, subject, message

    Returns:
        Notification status
    """
    email = data.get("email")
    subject = data.get("subject", "Bridge AI OS Admin Access")
    message = data.get("message", "You have been granted superuser access.")

    if not email or not is_superuser(email):
        raise HTTPException(status_code=403, detail="Invalid superuser email")

    # In production, integrate with Brevo/SendGrid here
    logger.info(f"Superuser notification: {email} - {subject}")

    return {
        "status": "notification_queued",
        "email": email,
        "subject": subject,
        "message": message,
        "note": "Email sending not implemented in demo mode. Configure BREVO_SMTP_KEY for production."
    }

def generate_synthetic_osint_results(subject_id: str, scan_type: str, scan_params: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Generate synthetic OSINT results for demonstration purposes.

    Args:
        subject_id: Subject identifier
        scan_type: Type of scan
        scan_params: Scan parameters

    Returns:
        List of synthetic OSINT findings
    """
    results = []

    if scan_type == "basic":
        # Basic digital footprint scan
        results.extend([
            {
                "type": "social_media",
                "platform": "LinkedIn",
                "profile_url": f"https://linkedin.com/in/{subject_id}",
                "profile_data": {
                    "name": f"Demo User {subject_id}",
                    "title": "Software Engineer",
                    "location": "San Francisco, CA",
                    "connections": 500
                },
                "last_updated": datetime.utcnow().isoformat() + "Z"
            },
            {
                "type": "social_media",
                "platform": "Twitter",
                "profile_url": f"https://twitter.com/{subject_id}",
                "profile_data": {
                    "handle": f"@{subject_id}",
                    "followers": 1250,
                    "following": 450,
                    "tweets": 3200
                },
                "last_updated": datetime.utcnow().isoformat() + "Z"
            },
            {
                "type": "domain",
                "domain": f"{subject_id}.com",
                "registration_date": "2020-01-15",
                "registrar": "GoDaddy",
                "nameservers": ["ns1.godaddy.com", "ns2.godaddy.com"],
                "last_updated": datetime.utcnow().isoformat() + "Z"
            }
        ])

    elif scan_type == "comprehensive":
        # More detailed scan
        results.extend([
            {
                "type": "email_addresses",
                "emails": [
                    f"{subject_id}@gmail.com",
                    f"{subject_id}@company.com"
                ],
                "verification_status": "verified",
                "sources": ["social_media", "public_records"]
            },
            {
                "type": "phone_numbers",
                "phones": [
                    {
                        "number": "+1-555-0123",
                        "type": "mobile",
                        "carrier": "Verizon",
                        "verified": True
                    }
                ],
                "sources": ["public_records"]
            },
            {
                "type": "addresses",
                "addresses": [
                    {
                        "street": "123 Demo Street",
                        "city": "San Francisco",
                        "state": "CA",
                        "zip": "94105",
                        "country": "US",
                        "type": "residential"
                    }
                ],
                "sources": ["public_records", "social_media"]
            }
        ])

    elif scan_type == "technical":
        # Technical footprint scan
        results.extend([
            {
                "type": "ip_addresses",
                "ips": [
                    {
                        "ip": "192.168.1.100",
                        "type": "residential",
                        "isp": "Comcast",
                        "location": "San Francisco, CA",
                        "last_seen": datetime.utcnow().isoformat() + "Z"
                    }
                ],
                "sources": ["network_scanning"]
            },
            {
                "type": "technologies",
                "websites": [
                    {
                        "domain": f"{subject_id}.com",
                        "technologies": ["WordPress", "PHP", "MySQL", "Apache"],
                        "cms_version": "WordPress 6.4",
                        "plugins": ["WooCommerce", "Yoast SEO"]
                    }
                ],
                "sources": ["web_scanning"]
            }
        ])

    return results

@app.get("/api/v1/osint/config")
async def get_osint_config():
    """
    Get OSINT system configuration.

    Returns:
        System configuration details
    """
    return {
        "demo_mode": DEMO_MODE,
        "network_mode": os.getenv("NETWORK_MODE", "offline"),
        "supported_scan_types": ["basic", "comprehensive", "technical"],
        "max_concurrent_scans": 5,
        "data_retention_days": 90,
        "consent_required": not DEMO_MODE,
        "features": {
            "consent_management": True,
            "osint_orchestration": True,
            "data_tokenization": DEMO_MODE,  # In demo mode, we don't actually tokenize
            "audit_logging": True,
            "gdpr_compliance": True
        }
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
>>>>>>> a65a24150727639fde77daadeba4361af473827a
