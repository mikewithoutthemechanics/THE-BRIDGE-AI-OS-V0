"""BAN — Pydantic models for tasks, nodes, and execution."""
from __future__ import annotations
from pydantic import BaseModel, Field
from typing import Optional
from enum import Enum
from datetime import datetime
import uuid


class TaskStatus(str, Enum):
    PENDING = "pending"
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    RETRYING = "retrying"


class TaskCreate(BaseModel):
    name: str
    description: str = ""
    impact: float = Field(0.5, ge=0, le=1, description="Impact score 0-1")
    revenue: float = Field(0.5, ge=0, le=1, description="Revenue potential 0-1")
    risk: float = Field(0.3, ge=0, le=1, description="Risk factor 0-1")
    latency: float = Field(0.5, ge=0, le=1, description="Latency sensitivity 0-1")
    trust: float = Field(0.5, ge=0, le=1, description="Trust requirement 0-1")
    cost: float = Field(0.1, ge=0, description="Execution cost")
    reward: float = Field(1.0, ge=0, description="Execution reward")
    max_retries: int = Field(3, ge=0, le=10)


class Task(BaseModel):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex[:12])
    name: str
    description: str = ""
    impact: float = 0.5
    revenue: float = 0.5
    risk: float = 0.3
    latency: float = 0.5
    trust: float = 0.5
    cost: float = 0.1
    reward: float = 1.0
    priority_score: float = 0.0
    economic_value: float = 0.0
    status: TaskStatus = TaskStatus.PENDING
    assigned_node: Optional[str] = None
    result: Optional[str] = None
    retries: int = 0
    max_retries: int = 3
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    started_at: Optional[str] = None
    completed_at: Optional[str] = None


class NodeInfo(BaseModel):
    id: str
    name: str
    capacity: int = Field(10, description="Max concurrent tasks")
    latency_ms: float = Field(50.0, description="Average response latency")
    trust_score: float = Field(0.8, ge=0, le=1)
    active_tasks: int = 0
    completed_tasks: int = 0
    failed_tasks: int = 0
    online: bool = True


class ExecutionLog(BaseModel):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex[:8])
    task_id: str
    task_name: str
    node_id: str
    node_name: str
    action: str
    status: str
    detail: str = ""
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


class ConsensusState(BaseModel):
    round: int = 0
    leader: str = ""
    leader_trust: float = 0.0
    votes: dict[str, str] = {}
    resolved: bool = False
    last_updated: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
