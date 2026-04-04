"""BAN — Bridge AI Network: FastAPI operational API."""
from __future__ import annotations

import asyncio
import random
import sys
import os
from datetime import datetime
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse

# Fix imports for running from BAN root
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.models import Task, TaskCreate, TaskStatus, ExecutionLog
from engine.priority import rank_tasks, compute_priority
from engine.economic import filter_viable, economic_value, Ledger
from nodes.registry import NodeRegistry
from nodes.router import route_task
from consensus.state import ConsensusEngine

# ── State ────────────────────────────────────────────────────────────────────
task_store: dict[str, Task] = {}
execution_log: list[ExecutionLog] = []
registry = NodeRegistry()
consensus = ConsensusEngine()
ledger = Ledger()
ws_clients: list[WebSocket] = []
runner_task: asyncio.Task | None = None


# ── WebSocket broadcast ──────────────────────────────────────────────────────
async def broadcast(event: dict):
    import json
    msg = json.dumps(event)
    dead = []
    for ws in ws_clients:
        try:
            await ws.send_text(msg)
        except Exception:
            dead.append(ws)
    for ws in dead:
        ws_clients.remove(ws)


# ── Execution runner (background loop) ───────────────────────────────────────
async def execution_loop():
    """Pull highest-priority viable task, assign, execute, log."""
    while True:
        await asyncio.sleep(2)

        pending = [t for t in task_store.values() if t.status == TaskStatus.PENDING]
        if not pending:
            continue

        # Score and filter
        ranked = rank_tasks(pending)
        viable = filter_viable(ranked)
        if not viable:
            continue

        task = viable[0]
        task.status = TaskStatus.QUEUED

        # Route to best node
        node = route_task(registry.online(), trust_required=task.trust * 0.5)
        if not node:
            log_entry = ExecutionLog(
                task_id=task.id, task_name=task.name,
                node_id="none", node_name="none",
                action="route", status="failed",
                detail="No available nodes"
            )
            execution_log.append(log_entry)
            await broadcast({"type": "log", "data": log_entry.model_dump()})
            continue

        # Assign
        task.assigned_node = node.name
        task.status = TaskStatus.RUNNING
        task.started_at = datetime.utcnow().isoformat()
        node.active_tasks += 1

        assign_log = ExecutionLog(
            task_id=task.id, task_name=task.name,
            node_id=node.id, node_name=node.name,
            action="assign", status="ok",
            detail=f"priority={task.priority_score} ev={task.economic_value}"
        )
        execution_log.append(assign_log)
        await broadcast({"type": "log", "data": assign_log.model_dump()})
        await broadcast({"type": "task_update", "data": task.model_dump()})

        # Simulate execution (1-4 seconds)
        exec_time = random.uniform(1.0, 4.0)
        await asyncio.sleep(exec_time)

        # Random success/fail (90% success, 10% fail)
        success = random.random() < 0.90

        node.active_tasks = max(0, node.active_tasks - 1)

        if success:
            task.status = TaskStatus.COMPLETED
            task.result = f"Executed on {node.name} in {exec_time:.1f}s"
            task.completed_at = datetime.utcnow().isoformat()
            registry.record_completion(node.id, True)
            ledger.debit(task.cost, ref=f"task:{task.id}")
            ledger.credit(task.reward, ref=f"task:{task.id}")
        else:
            task.retries += 1
            registry.record_completion(node.id, False)
            if task.retries < task.max_retries:
                task.status = TaskStatus.PENDING  # retry
                task.assigned_node = None
                detail = f"Failed on {node.name}, retry {task.retries}/{task.max_retries}"
            else:
                task.status = TaskStatus.FAILED
                task.result = f"Failed after {task.max_retries} retries"
                task.completed_at = datetime.utcnow().isoformat()
                detail = f"Exhausted retries on {node.name}"

        exec_log = ExecutionLog(
            task_id=task.id, task_name=task.name,
            node_id=node.id, node_name=node.name,
            action="execute", status="ok" if success else "fail",
            detail=task.result or detail
        )
        execution_log.append(exec_log)
        await broadcast({"type": "log", "data": exec_log.model_dump()})
        await broadcast({"type": "task_update", "data": task.model_dump()})

        # Run consensus after each execution
        consensus.run_round(registry.all())
        await broadcast({"type": "consensus", "data": consensus.get_state().model_dump()})


# ── Lifespan ─────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator:
    global runner_task
    runner_task = asyncio.create_task(execution_loop())
    consensus.run_round(registry.all())
    yield
    runner_task.cancel()


# ── App ──────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="BAN — Bridge AI Network",
    description="Multi-objective task engine with node routing, consensus, and economic filtering",
    version="1.0.0",
    lifespan=lifespan,
)

# Serve frontend
FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend")


# ── Routes ───────────────────────────────────────────────────────────────────
@app.get("/")
async def root():
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "BAN",
        "tasks": len(task_store),
        "nodes": len(registry.all()),
        "nodes_online": len(registry.online()),
        "consensus_leader": consensus.get_state().leader,
        "ledger_balance": ledger.balance,
    }


@app.post("/tasks/add")
async def add_task(req: TaskCreate):
    task = Task(**req.model_dump())
    task.priority_score = compute_priority(
        task.impact, task.revenue, task.risk, task.latency, task.trust
    )
    task.economic_value = economic_value(task.reward, task.cost)
    task_store[task.id] = task
    await broadcast({"type": "task_new", "data": task.model_dump()})
    return {"id": task.id, "priority": task.priority_score, "ev": task.economic_value}


@app.get("/tasks/list")
async def list_tasks():
    tasks = sorted(task_store.values(), key=lambda t: t.priority_score, reverse=True)
    return [t.model_dump() for t in tasks]


@app.post("/tasks/execute")
async def force_execute(task_id: str):
    """Force a specific task to pending for immediate pickup."""
    task = task_store.get(task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    if task.status not in (TaskStatus.PENDING, TaskStatus.FAILED):
        raise HTTPException(400, f"Task is {task.status}, cannot re-execute")
    task.status = TaskStatus.PENDING
    task.retries = 0
    await broadcast({"type": "task_update", "data": task.model_dump()})
    return {"status": "queued", "task_id": task.id}


@app.get("/nodes")
async def list_nodes():
    return [n.model_dump() for n in registry.all()]


@app.get("/consensus/state")
async def consensus_state():
    return consensus.get_state().model_dump()


@app.get("/ledger")
async def ledger_state():
    return ledger.summary()


@app.get("/logs")
async def get_logs(limit: int = 50):
    return [e.model_dump() for e in execution_log[-limit:]]


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    ws_clients.append(ws)
    try:
        # Send initial state
        import json
        await ws.send_text(json.dumps({
            "type": "init",
            "tasks": [t.model_dump() for t in task_store.values()],
            "nodes": [n.model_dump() for n in registry.all()],
            "consensus": consensus.get_state().model_dump(),
            "ledger": ledger.summary(),
            "logs": [e.model_dump() for e in execution_log[-30:]],
        }))
        while True:
            await ws.receive_text()  # keep alive
    except WebSocketDisconnect:
        if ws in ws_clients:
            ws_clients.remove(ws)


# Static assets
if os.path.isdir(FRONTEND_DIR):
    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")
