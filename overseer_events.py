"""
OVERSEER EVENT INGESTION — External Triggers
HTTP endpoint for receiving events from all system modules
Integrates with Overseer core for event-driven corrections
"""

from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field
from typing import Dict, Any, Optional, List
import asyncio
import json
import logging
from datetime import datetime
from pathlib import Path

from overseer import overseer_logger, OVERSEER_STATE_PATH

# =============================================================================
# EVENT API
# =============================================================================

app = FastAPI(
    title="Overseer Event Ingest",
    description="Event ingestion endpoint for external triggers and module notifications",
    version="1.0.0"
)

# =============================================================================
# EVENT SCHEMAS
# =============================================================================

class SystemEvent(BaseModel):
    """Event from any system module"""
    event_type: str = Field(..., description="Type of event")
    source: str = Field(..., description="Source module or service")
    severity: str = Field("INFO", description="Event severity")
    data: Dict[str, Any] = Field(default_factory=dict)
    timestamp: Optional[str] = None

class ConfigChangeEvent(SystemEvent):
    """Configuration file changed"""
    file_path: str
    change_type: str  # "modified", "created", "deleted"
    old_hash: Optional[str] = None
    new_hash: Optional[str] = None

class ServiceHealthEvent(SystemEvent):
    """Service health status change"""
    service_name: str
    previous_status: str
    current_status: str
    health_score: float

class InvariantViolationEvent(SystemEvent):
    """Invariant was violated"""
    invariant_name: str
    context: Dict[str, Any]
    auto_fix_applied: bool = False

class TopologyChangeEvent(SystemEvent):
    """Topology modification"""
    change_type: str  # "service_added", "service_removed", "connection_lost"
    affected_services: List[str]
    new_topology: Optional[Dict[str, Any]] = None

# =============================================================================
# EVENT HANDLERS
# =============================================================================

event_handlers = {
    "config_change": lambda e: handle_config_change(e),
    "service_health": lambda e: handle_service_health(e),
    "invariant_violation": lambda e: handle_invariant_violation(e),
    "topology_change": lambda e: handle_topology_change(e),
    "manual_override": lambda e: handle_manual_override(e),
}

async def handle_config_change(event: ConfigChangeEvent):
    """React to configuration changes"""
    overseer_logger.log("EVENT_CONFIG_CHANGE", {
        "file": event.file_path,
        "change": event.change_type,
        "source": event.source
    })

    # Trigger immediate state capture on next cycle
    # (Overseer will detect and validate automatically)

async def handle_service_health(event: ServiceHealthEvent):
    """React to service health changes"""
    overseer_logger.log("EVENT_SERVICE_HEALTH", {
        "service": event.service_name,
        "from": event.previous_status,
        "to": event.current_status,
        "score": event.health_score
    })

    if event.health_score < 50:
        # Critical health — flag for immediate overseer attention
        overseer_logger.log("CRITICAL_HEALTH", {
            "service": event.service_name,
            "score": event.health_score
        }, severity="ERROR")

async def handle_invariant_violation(event: InvariantViolationEvent):
    """Process reported invariant violation"""
    overseer_logger.log("EVENT_INVARIANT_VIOLATION", {
        "invariant": event.invariant_name,
        "source": event.source,
        "auto_fix": event.auto_fix_applied
    }, severity="ERROR")

    # This event will be processed by Overseer on next cycle

async def handle_topology_change(event: TopologyChangeEvent):
    """React to topology modifications"""
    overseer_logger.log("EVENT_TOPOLOGY_CHANGE", {
        "type": event.change_type,
        "affected": event.affected_services
    })

async def handle_manual_override(event: SystemEvent):
    """Process manual override commands"""
    overseer_logger.log("EVENT_MANUAL_OVERRIDE", {
        "command": event.data.get("command"),
        "issued_by": event.data.get("issued_by"),
        "reason": event.data.get("reason")
    }, severity="WARN")

    # Implement emergency actions if needed

# =============================================================================
# EVENT INGESTION ENDPOINTS
# =============================================================================

@app.post("/overseer/event")
async def ingest_event(event: SystemEvent, background_tasks: BackgroundTasks):
    """
    Ingest any system event

    Triggers Overseer attention on next cycle.
    High-severity events are processed immediately.
    """
    event.timestamp = event.timestamp or datetime.utcnow().isoformat() + "Z"

    # Log to forensic audit
    overseer_logger.log("EVENT_INGEST", {
        "type": event.event_type,
        "source": event.source,
        "severity": event.severity
    })

    # Route to handler if known
    if event.event_type in event_handlers:
        background_tasks.add_task(event_handlers[event.event_type], event)

    return {
        "status": "accepted",
        "event_id": hash(json.dumps(asdict(event)))[:16],
        "timestamp": event.timestamp
    }

@app.post("/overseer/event/config-change")
async def config_changed(event: ConfigChangeEvent, background_tasks: BackgroundTasks):
    """Configuration file changed"""
    return await ingest_event(event, background_tasks)

@app.post("/overseer/event/service-health")
async def service_health_changed(event: ServiceHealthEvent, background_tasks: BackgroundTasks):
    """Service health status changed"""
    return await ingest_event(event, background_tasks)

@app.post("/overseer/event/invariant-violation")
async def invariant_violated(event: InvariantViolationEvent, background_tasks: BackgroundTasks):
    """Invariant violation reported"""
    return await ingest_event(event, background_tasks)

@app.post("/overseer/event/topology-change")
async def topology_changed(event: TopologyChangeEvent, background_tasks: BackgroundTasks):
    """Topology changed"""
    return await ingest_event(event, background_tasks)

@app.post("/overseer/override")
async def manual_override(data: Dict[str, Any]):
    """
    Emergency manual override

    Use with caution — bypasses normal enforcement
    """
    command = data.get("command")
    reason = data.get("reason", "unspecified")
    issued_by = data.get("issued_by", "unknown")

    overseer_logger.log("MANUAL_OVERRIDE", {
        "command": command,
        "reason": reason,
        "issued_by": issued_by,
        "timestamp": datetime.utcnow().isoformat() + "Z"
    }, severity="CRITICAL")

    # Execute override command
    if command == "EMERGENCY_STOP":
        # Signal Overseer to halt all operations
        Path("/tmp/overseer.emergency.stop").touch()
        return {"status": "EMERGENCY_STOP_INITIATED"}

    elif command == "DISABLE_INVARIANTS":
        # Not recommended — only for maintenance
        return {"status": "INVARIANTS_DISABLED", "warning": "Use only during maintenance"}

    elif command == "FORCE_RESTART":
        # Force restart of Overseer
        return {"status": "RESTART_REQUESTED"}

    return {"status": "UNKNOWN_COMMAND", "command": command}

# =============================================================================
# EVENT QUERY
# =============================================================================

@app.get("/overseer/events")
async def get_recent_events(limit: int = 100):
    """Get recent events from forensic log"""
    try:
        events = overseer_logger.tail(limit)
        return {
            "events": events,
            "count": len(events),
            "source": "forensic_audit_log"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/overseer/violations")
async def get_violations(limit: int = 100):
    """Get recent invariant violations"""
    try:
        all_events = overseer_logger.tail(limit * 2)  # Get more to filter
        violations = [e for e in all_events if e.get('e') == 'INVARIANT_VIOLATION']
        return {
            "violations": violations[-limit:],
            "count": len(violations)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/overseer/corrections")
async def get_corrections(limit: int = 100):
    """Get recent auto-corrections applied"""
    try:
        all_events = overseer_logger.tail(limit * 2)
        corrections = [e for e in all_events if e.get('e') == 'REMEDIATION_APPLIED']
        return {
            "corrections": corrections[-limit:],
            "count": len(corrections)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# =============================================================================
# STATE INGESTION (for external state updates)
# =============================================================================

@app.post("/overseer/state/push")
async def push_state_update(data: Dict[str, Any]):
    """
    Push state update to Overseer

    This allows external systems to feed state directly into Overseer
    for immediate analysis in the next cycle.
    """
    try:
        # Read current state
        current_state = {}
        try:
            with open(OVERSEER_STATE_PATH, 'r') as f:
                current_state = json.load(f)
        except:
            pass

        # Merge updates
        current_state.update(data)
        current_state['__last_push'] = datetime.utcnow().isoformat() + "Z"

        # Write back
        with open(OVERSEER_STATE_PATH, 'w') as f:
            json.dump(current_state, f, indent=2)

        overseer_logger.log("STATE_PUSH_RECEIVED", {
            "keys": list(data.keys()),
            "timestamp": datetime.utcnow().isoformat() + "Z"
        })

        return {
            "status": "state_updated",
            "keys_received": list(data.keys())
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"State update failed: {str(e)}")

# =============================================================================
# METRICS & STATUS
# =============================================================================

@app.get("/overseer/status")
async def overseer_status():
    """Get Overseer operational status"""
    try:
        state_file = Path(OVERSEER_STATE_PATH)
        log_file = Path(CONFIG.LOG_FILE)

        return {
            "overseer": {
                "status": "running",
                "event_ingestion": "active",
                "log_file": str(log_file),
                "state_file": str(state_file)
            },
            "endpoints": {
                "ingest": "/overseer/event",
                "config_change": "/overseer/event/config-change",
                "service_health": "/overseer/event/service-health",
                "invariant_violation": "/overseer/event/invariant-violation",
                "topology_change": "/overseer/event/topology-change",
                "manual_override": "/overseer/override",
                "events": "/overseer/events",
                "violations": "/overseer/violations",
                "corrections": "/overseer/corrections"
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# =============================================================================
# STARTUP
# =============================================================================

if __name__ == "__main__":
    import uvicorn
    print("Starting Overseer Event Ingest Service...")
    uvicorn.run(app, host="0.0.0.0", port=9092)
