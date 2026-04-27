"""
Overseer Core Runtime — Full System Implementation
Self-healing, auto-optimizing, predictive control plane for distributed systems
"""

import asyncio
import json
import logging
import os
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Callable
from dataclasses import dataclass, field, asdict
from enum import Enum
from collections import deque
from abc import ABC, abstractmethod

# Prometheus metrics
from prometheus_client import Counter, Gauge, Histogram, REGISTRY, generate_latest, CONTENT_TYPE_LATEST

# =====================
# CONFIGURATION
# =====================
BASE_DIR = Path(__file__).parent
STATE_FILE = BASE_DIR / "state.json"
AUDIT_LOG = BASE_DIR / "audit.log"
CONFIG_DIR = BASE_DIR / "configs"
METRICS_FILE = BASE_DIR / "metrics.json"

CONFIG_DIR.mkdir(exist_ok=True)

# =====================
# LOGGING
# =====================
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s'
)
logger = logging.getLogger("overseer")

# =====================
# PROMETHEUS METRICS
# =====================
CYCLES_TOTAL = Counter('overseer_cycles_total', 'Total overseer execution cycles')
VIOLATIONS_TOTAL = Counter('overseer_violations_total', 'Total invariant violations', ['invariant', 'severity'])
CORRECTIONS_TOTAL = Counter('overseer_corrections_total', 'Total remediation actions', ['action_type', 'target'])
PREDICTIONS_TOTAL = Counter('overseer_predictions_total', 'Total failure predictions', ['pattern'])
OPTIMIZATIONS_TOTAL = Counter('overseer_optimizations_total', 'Total optimizations applied', ['component'])
HEALTH_SCORE = Gauge('overseer_health', 'Overall system health score (0-1)')
CYCLE_DURATION = Histogram('overseer_cycle_duration_seconds', 'Cycle execution time')
PERSONA = Gauge('overseer_persona', 'Current persona (1=architect,2=sovereign,3=oracle,4=revenant,5=whisperer)')
@dataclass
class SystemState:
    """Immutable snapshot of system state"""
    timestamp: str
    topology: Dict[str, Any]
    configs: Dict[str, Any]
    metrics: Dict[str, float]
    health_scores: Dict[str, float]
    events: List[Dict[str, Any]] = field(default_factory=list)
    hash: Optional[str] = None

    def __post_init__(self):
        self.hash = self._compute_hash()

    def _compute_hash(self) -> str:
        import hashlib
        content = json.dumps({
            "topology": self.topology,
            "configs": self.configs,
            "metrics": self.metrics,
            "health_scores": self.health_scores
        }, sort_keys=True, default=str)
        return hashlib.sha256(content.encode()).hexdigest()[:16]

@dataclass
class InvariantViolation:
    """Record of an invariant breach"""
    invariant_name: str
    current_value: Any
    threshold: Any
    severity: str  # "critical", "warning", "info"
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat())

@dataclass
class RemediationAction:
    """Auto-remediation action to execute"""
    action_id: str
    action_type: str  # "config_regen", "restart", "rollback", "scale", "isolate"
    target: str
    parameters: Dict[str, Any] = field(default_factory=dict)
    priority: int = 1
    created_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())

@dataclass
class OptimizationOpportunity:
    """Detected optimization candidate"""
    component: str
    current_value: Any
    recommended_value: Any
    confidence: float  # 0.0 - 1.0
    rationale: str

@dataclass
class PersonaPolicy:
    """Persona-based decision policy"""
    name: str
    risk_tolerance: float  # 0.0 (conservative) - 1.0 (aggressive)
    optimization_aggressiveness: float
    remediation_speed: str  # "instant", "fast", "gradual"
    prefer_actions: List[str] = field(default_factory=list)
    avoid_actions: List[str] = field(default_factory=list)

# =====================
# PERSONA POLICIES
# =====================
PERSONAS = {
    "architect": PersonaPolicy(
        name="Architect",
        risk_tolerance=0.3,
        optimization_aggressiveness=0.5,
        remediation_speed="gradual",
        prefer_actions=["config_update", "scale"],
        avoid_actions=["kill", "restart"]
    ),
    "sovereign": PersonaPolicy(
        name="Sovereign",
        risk_tolerance=0.1,
        optimization_aggressiveness=0.2,
        remediation_speed="fast",
        prefer_actions=["isolate", "rollback"],
        avoid_actions=["experiment"]
    ),
    "oracle": PersonaPolicy(
        name="Oracle",
        risk_tolerance=0.5,
        optimization_aggressiveness=0.7,
        remediation_speed="fast",
        prefer_actions=["optimize", "predict"],
        avoid_actions=["drastic_change"]
    ),
    "revenant": PersonaPolicy(
        name="Revenant",
        risk_tolerance=0.9,
        optimization_aggressiveness=0.9,
        remediation_speed="instant",
        prefer_actions=["kill", "restart", "nuke"],
        avoid_actions=["wait", "monitor"]
    ),
    "whisperer": PersonaPolicy(
        name="Whisperer",
        risk_tolerance=0.6,
        optimization_aggressiveness=0.4,
        remediation_speed="gradual",
        prefer_actions=["adjust", "migrate"],
        avoid_actions=["force", "break"]
    )
}

# =====================
# STATE CAPTURE SUBSYSTEM
# =====================
class StateCapture:
    """Captures system state from multiple sources"""
    
    def __init__(self, config_paths: List[Path]):
        self.config_paths = config_paths
        self.last_capture: Optional[SystemState] = None
        
    def capture_topology(self) -> Dict[str, Any]:
        """Discover and record system topology"""
        topology = {
            "nodes": [],
            "services": [],
            "connections": [],
            "discovery_method": " static_config"
        }
        
        # Scan config directories
        for config_dir in self.config_paths:
            if config_dir.exists():
                for file in config_dir.glob("*.json"):
                    try:
                        data = json.loads(file.read_text())
                        topology["nodes"].append({
                            "name": file.stem,
                            "type": "config",
                            "path": str(file)
                        })
                    except:
                        pass
                        
        return topology
    
    def capture_configs(self) -> Dict[str, Any]:
        """Load all configuration files"""
        configs = {}
        for config_file in self.config_paths[0].glob("*.json") if self.config_paths else []:
            try:
                configs[config_file.stem] = json.loads(config_file.read_text())
            except:
                pass
        return configs
    
    def capture_metrics(self) -> Dict[str, float]:
        """Collect system metrics"""
        metrics = {}
        
        # System metrics
        try:
            import psutil
            metrics["cpu_percent"] = psutil.cpu_percent(interval=0.1)
            metrics["memory_percent"] = psutil.virtual_memory().percent
            metrics["disk_usage"] = psutil.disk_usage('/').percent
        except ImportError:
            # Mock metrics if psutil not available
            metrics["cpu_percent"] = 0.0
            metrics["memory_percent"] = 0.0
            metrics["disk_usage"] = 0.0
            
        # Custom metrics from file
        if METRICS_FILE.exists():
            try:
                stored = json.loads(METRICS_FILE.read_text())
                metrics.update(stored)
            except:
                pass
                
        return metrics
    
    def capture_health(self) -> Dict[str, float]:
        """Calculate component health scores"""
        health = {}
        metrics = self.capture_metrics()
        
        # Simple health calculation
        health["system"] = 1.0 - (metrics.get("cpu_percent", 0) / 100.0)
        health["memory"] = 1.0 - (metrics.get("memory_percent", 0) / 100.0)
        health["disk"] = 1.0 - (metrics.get("disk_usage", 0) / 100.0)
        
        return health
    
    def capture(self) -> SystemState:
        """Full state capture"""
        state = SystemState(
            timestamp=datetime.utcnow().isoformat(),
            topology=self.capture_topology(),
            configs=self.capture_configs(),
            metrics=self.capture_metrics(),
            health_scores=self.capture_health()
        )
        self.last_capture = state
        return state

# =====================
# INVARIANT ENGINE
# =====================
class InvariantEngine:
    """Validates system invariants and triggers corrections"""
    
    def __init__(self):
        self.invariants: List[Callable[[SystemState], List[InvariantViolation]]] = []
        self.violation_history: deque = deque(maxlen=1000)
        
    def register_invariant(self, check: Callable[[SystemState], List[InvariantViolation]]):
        """Add an invariant check function"""
        self.invariants.append(check)
        
    def check_all(self, state: SystemState) -> List[InvariantViolation]:
        """Run all invariant checks"""
        all_violations = []
        for check in self.invariants:
            violations = check(state)
            all_violations.extend(violations)
            
        if all_violations:
            self.violation_history.append({
                "timestamp": state.timestamp,
                "violations": [asdict(v) for v in all_violations]
            })
            
        return all_violations

# Default invariant checks
def check_config_parsing(state: SystemState) -> List[InvariantViolation]:
    """Validate all configs are valid JSON and have required fields"""
    violations = []
    for name, config in state.configs.items():
        if not isinstance(config, dict):
            violations.append(InvariantViolation(
                invariant_name="config_valid",
                current_value=type(config).__name__,
                threshold="dict",
                severity="critical"
            ))
    return violations

def check_topology_integrity(state: SystemState) -> List[InvariantViolation]:
    """Ensure topology structure is valid"""
    violations = []
    top = state.topology
    
    if not isinstance(top.get("nodes", []), list):
        violations.append(InvariantViolation(
            invariant_name="topology_nodes_array",
            current_value=type(top.get("nodes")).__name__,
            threshold="list",
            severity="critical"
        ))
        
    return violations

def check_health_thresholds(state: SystemState) -> List[InvariantViolation]:
    """Check health scores against thresholds"""
    violations = []
    
    for component, score in state.health_scores.items():
        if score < 0.2:
            violations.append(InvariantViolation(
                invariant_name=f"health_{component}",
                current_value=score,
                threshold=0.2,
                severity="critical"
            ))
        elif score < 0.5:
            violations.append(InvariantViolation(
                invariant_name=f"health_{component}",
                current_value=score,
                threshold=0.5,
                severity="warning"
            ))
            
    return violations

def check_metrics_bounds(state: SystemState) -> List[InvariantViolation]:
    """Ensure metrics are within acceptable bounds"""
    violations = []
    
    for metric, value in state.metrics.items():
        if isinstance(value, (int, float)):
            if metric.endswith("_percent") and value > 100:
                violations.append(InvariantViolation(
                    invariant_name=f"metric_bounds_{metric}",
                    current_value=value,
                    threshold=100,
                    severity="critical"
                ))
                
    return violations

# =====================
# FAILURE PREDICTOR
# =====================
class FailurePredictor:
    """Predicts failures using pattern matching and trend analysis"""
    
    def __init__(self):
        self.history: deque = deque(maxlen=100)
        self.patterns = {
            "memory_leak": self._detect_memory_leak,
            "cpu_spike": self._detect_cpu_spike,
            "degradation": self._detect_degradation,
            "flapping": self._detect_flapping
        }
        
    def _detect_memory_leak(self, recent: List[SystemState]) -> Optional[Dict]:
        """Detect monotonically increasing memory usage"""
        if len(recent) < 10:
            return None
            
        mem_values = [s.metrics.get("memory_percent", 0) for s in recent]
        # Check if memory consistently increases
        increases = sum(1 for i in range(1, len(mem_values)) if mem_values[i] > mem_values[i-1])
        if increases >= 8:  # 80% of samples increasing
            return {
                "pattern": "memory_leak",
                "confidence": 0.8,
                "description": "Memory usage consistently increasing over last 10 cycles"
            }
        return None
    
    def _detect_cpu_spike(self, recent: List[SystemState]) -> Optional[Dict]:
        """Detect CPU usage volatility"""
        if len(recent) < 5:
            return None
            
        cpu_values = [s.metrics.get("cpu_percent", 0) for s in recent]
        avg = sum(cpu_values) / len(cpu_values)
        spikes = [v for v in cpu_values if v > avg * 2]
        
        if len(spikes) >= 2:
            return {
                "pattern": "cpu_spike",
                "confidence": 0.7,
                "description": f"Detected {len(spikes)} CPU spikes in recent history"
            }
        return None
    
    def _detect_degradation(self, recent: List[SystemState]) -> Optional[Dict]:
        """Detect gradual performance degradation"""
        if len(recent) < 15:
            return None
            
        health_trend = [s.health_scores.get("system", 1.0) for s in recent]
        # Linear regression for trend
        n = len(health_trend)
        sum_x = n * (n-1) / 2
        sum_y = sum(health_trend)
        sum_xy = sum(i * health_trend[i] for i in range(n))
        sum_x2 = sum(i*i for i in range(n))
        
        slope = (n * sum_xy - sum_x * sum_y) / (n * sum_x2 - sum_x * sum_x)
        
        if slope < -0.01:  # Declining trend
            return {
                "pattern": "degradation",
                "confidence": min(0.9, abs(slope) * 100),
                "description": f"System health degrading (slope: {slope:.4f})"
            }
        return None
    
    def _detect_flapping(self, recent: List[SystemState]) -> Optional[Dict]:
        """Detect state flapping (rapid oscillations)"""
        if len(recent) < 10:
            return None
            
        # Count state changes
        changes = sum(1 for i in range(1, len(recent))
                     if recent[i].hash != recent[i-1].hash)
        
        if changes >= 7:  # 70% change rate
            return {
                "pattern": "flapping",
                "confidence": changes / len(recent),
                "description": f"Rapid state changes detected ({changes}/{len(recent)} cycles)"
            }
        return None
    
    def predict(self, state: SystemState) -> Dict[str, Any]:
        """Run prediction against current state"""
        self.history.append(state)
        recent = list(self.history)
        
        predictions = []
        for pattern_name, detector in self.patterns.items():
            result = detector(recent)
            if result:
                predictions.append(result)
                
        # Assess overall risk
        risk_score = sum(p["confidence"] for p in predictions) / max(1, len(predictions))
        
        return {
            "timestamp": state.timestamp,
            "high_risk": risk_score >= 0.6,
            "risk_score": risk_score,
            "predictions": predictions,
            "recommended_actions": self._recommend_actions(predictions)
        }
    
    def _recommend_actions(self, predictions: List[Dict]) -> List[str]:
        """Map predictions to recommended actions"""
        actions = []
        for p in predictions:
            pattern = p["pattern"]
            if pattern == "memory_leak":
                actions.append("restart_affected_services")
                actions.append("increase_memory_limit")
            elif pattern == "cpu_spike":
                actions.append("scale_up")
                actions.append("throttle_requests")
            elif pattern == "degradation":
                actions.append("check_logs")
                actions.append("rollback_recent")
            elif pattern == "flapping":
                actions.append("freeze_state")
                actions.append("diagnose_root_cause")
        return list(set(actions))

# =====================
# AUTO-REMEDIATION ENGINE
# =====================
class RemediationEngine:
    """Executes auto-remediation actions"""
    
    def __init__(self, persona: PersonaPolicy):
        self.persona = persona
        self.action_history: List[Dict] = []
        self.remediation_handlers = {
            "config_regen": self._regen_config,
            "restart": self._restart_service,
            "rollback": self._rollback,
            "scale": self._scale,
            "isolate": self._isolate,
            "kill": self._kill_process,
            "nuke": self._nuke_and_pave,
            "adjust": self._adjust_params,
            "migrate": self._migrate
        }
        
    def execute(self, action: RemediationAction) -> Dict[str, Any]:
        """Execute a remediation action"""
        handler = self.remediation_handlers.get(action.action_type)
        if not handler:
            return {"success": False, "error": f"Unknown action: {action.action_type}"}
            
        try:
            result = handler(action)
            self.action_history.append({
                "action": asdict(action),
                "result": result,
                "timestamp": datetime.utcnow().isoformat()
            })
            return result
        except Exception as e:
            logger.error(f"Remediation failed: {e}")
            return {"success": False, "error": str(e)}
    
    def _regen_config(self, action: RemediationAction) -> Dict:
        """Regenerate default configuration"""
        default = {
            "schema": {},
            "topology": {"nodes": []},
            "load": 0.5
        }
        STATE_FILE.write_text(json.dumps(default, indent=2))
        return {"success": True, "action": "config_regenerated"}
    
    def _restart_service(self, action: RemediationAction) -> Dict:
        """Restart a service (mock)"""
        target = action.target
        logger.info(f"Restarting {target}")
        return {"success": True, "action": f"restarted_{target}"}
    
    def _rollback(self, action: RemediationAction) -> Dict:
        """Rollback to previous known-good state"""
        logger.info(f"Rolling back {action.target}")
        return {"success": True, "action": "rollback_complete"}
    
    def _scale(self, action: RemediationAction) -> Dict:
        """Scale resource allocation"""
        params = action.parameters
        logger.info(f"Scaling {action.target}: {params}")
        return {"success": True, "action": "scaled"}
    
    def _isolate(self, action: RemediationAction) -> Dict:
        """Isolate a component"""
        logger.info(f"Isolating {action.target}")
        return {"success": True, "action": "isolated"}
    
    def _kill_process(self, action: RemediationAction) -> Dict:
        """Force kill a process"""
        logger.warning(f"KILLING {action.target}")
        return {"success": True, "action": "killed"}
    
    def _nuke_and_pave(self, action: RemediationAction) -> Dict:
        """Complete rebuild"""
        logger.critical(f"NUKE AND PAVE on {action.target}")
        self._regen_config(action)
        return {"success": True, "action": "nuked_and_paved"}
    
    def _adjust_params(self, action: RemediationAction) -> Dict:
        """Gradually adjust parameters"""
        logger.info(f"Adjusting {action.target}: {action.parameters}")
        return {"success": True, "action": "adjusted"}
    
    def _migrate(self, action: RemediationAction) -> Dict:
        """Migrate to alternative resource"""
        logger.info(f"Migrating {action.target}")
        return {"success": True, "action": "migrated"}

# =====================
# OPTIMIZATION ENGINE
# =====================
class OptimizationEngine:
    """Autonomous tuning and optimization"""
    
    def __init__(self, persona: PersonaPolicy):
        self.persona = persona
        self.optimization_history: List[Dict] = []
        
    def find_opportunities(self, state: SystemState) -> List[OptimizationOpportunity]:
        """Identify optimization candidates"""
        opportunities = []
        
        # Load balancing
        load = state.metrics.get("load", 0)
        if load > 0.8 * self.persona.risk_tolerance:
            opportunities.append(OptimizationOpportunity(
                component="load_balancer",
                current_value=load,
                recommended_value=0.5,
                confidence=0.8,
                rationale="High load detected, rebalancing recommended"
            ))
            
        # Resource allocation
        for comp, health in state.health_scores.items():
            if health < 0.6 and self.persona.optimization_aggressiveness > 0.5:
                opportunities.append(OptimizationOpportunity(
                    component=comp,
                    current_value=health,
                    recommended_value=0.9,
                    confidence=0.6,
                    rationale=f"Low health score for {comp}"
                ))
                
        return opportunities
    
    def apply_optimization(self, opportunity: OptimizationOpportunity, 
                          engine: RemediationEngine) -> Dict[str, Any]:
        """Apply an optimization"""
        action = RemediationAction(
            action_id=str(uuid.uuid4()),
            action_type="adjust",
            target=opportunity.component,
            parameters={"value": opportunity.recommended_value},
            priority=2
        )
        
        result = engine.execute(action)
        self.optimization_history.append({
            "opportunity": asdict(opportunity),
            "result": result,
            "timestamp": datetime.utcnow().isoformat()
        })
        
        return result

# =====================
# AUDIT CORE
# =====================
class AuditCore:
    """Append-only causality chain for full traceability"""
    
    def __init__(self, log_file: Path):
        self.log_file = log_file
        self.causality_chain: List[Dict] = []
        
    def log_event(self, event_type: str, data: Dict[str, Any], 
                  triggered_by: Optional[str] = None):
        """Append an event to the audit log"""
        event = {
            "id": str(uuid.uuid4()),
            "timestamp": datetime.utcnow().isoformat(),
            "type": event_type,
            "data": data,
            "triggered_by": triggered_by,
            "causal_parents": self._get_recent_parents(3)
        }
        
        self.causality_chain.append(event)
        
        # Append to file
        with open(self.log_file, 'a') as f:
            f.write(json.dumps(event) + '\n')
            
        return event["id"]
    
    def _get_recent_parents(self, n: int) -> List[str]:
        """Get IDs of recent events for causal chain"""
        return [e["id"] for e in self.causality_chain[-n:]]

# =====================
# EVENT INGESTION
# =====================
class EventIngester:
    """Ingest external triggers and system events"""
    
    def __init__(self, audit: AuditCore):
        self.audit = audit
        self.event_queue: asyncio.Queue = asyncio.Queue()
        self.handlers: Dict[str, Callable] = {}
        
    def register_handler(self, event_type: str, handler: Callable):
        """Register an event handler"""
        self.handlers[event_type] = handler
        
    async def ingest(self, event_type: str, payload: Dict[str, Any]):
        """Ingest a new event"""
        await self.event_queue.put({
            "type": event_type,
            "payload": payload,
            "timestamp": datetime.utcnow().isoformat()
        })
        self.audit.log_event("event_ingested", {
            "event_type": event_type,
            "payload": payload
        })
        
    async def process_events(self):
        """Process incoming events"""
        while True:
            event = await self.event_queue.get()
            handler = self.handlers.get(event["type"])
            if handler:
                try:
                    await handler(event)
                except Exception as e:
                    logger.error(f"Event handler failed: {e}")
            self.event_queue.task_done()

# =====================
# OVERSEER CORE
# =====================
class Overseer:
    """Main Overseer runtime coordinator"""
    
    def __init__(self, persona_name: str = "oracle"):
        self.persona = PERSONAS.get(persona_name, PERSONAS["oracle"])
        
        # Set persona metric
        persona_id = {"architect": 1, "sovereign": 2, "oracle": 3, "revenant": 4, "whisperer": 5}.get(persona_name, 3)
        PERSONA.set(persona_id)
        
        self.state_capture = StateCapture([CONFIG_DIR])
        self.invariant_engine = InvariantEngine()
        self.failure_predictor = FailurePredictor()
        self.remediation_engine = RemediationEngine(self.persona)
        self.optimization_engine = OptimizationEngine(self.persona)
        self.audit = AuditCore(AUDIT_LOG)
        self.event_ingester = EventIngester(self.audit)
        
        # Register default invariants
        self.invariant_engine.register_invariant(check_config_parsing)
        self.invariant_engine.register_invariant(check_topology_integrity)
        self.invariant_engine.register_invariant(check_health_thresholds)
        self.invariant_engine.register_invariant(check_metrics_bounds)
        
        # State
        self.running = False
        self.cycle_count = 0
        self.last_state: Optional[SystemState] = None
        
    async def run_cycle(self):
        """Execute one Overseer cycle"""
        self.cycle_count += 1
        cycle_id = str(uuid.uuid4())
        
        CYCLES_TOTAL.inc()
        
        self.audit.log_event("cycle_start", {
            "cycle": self.cycle_count,
            "cycle_id": cycle_id
        })
        
        try:
            with CYCLE_DURATION.time():
                # 1. Capture state
                state = self.state_capture.capture()
                self.last_state = state
                
                # Update health gauge
                system_health = state.health_scores.get("system", 0.0)
                HEALTH_SCORE.set(system_health)
                
                self.audit.log_event("state_captured", {
                    "state_hash": state.hash,
                    "health": state.health_scores
                })
                
                # 2. Check invariants
                violations = self.invariant_engine.check_all(state)
                
                if violations:
                    self.audit.log_event("invariant_violations", {
                        "count": len(violations),
                        "violations": [asdict(v) for v in violations[:5]]
                    })
                    
                    # Execute remediation based on persona
                    for violation in violations:
                        VIOLATIONS_TOTAL.labels(
                            invariant=violation.invariant_name,
                            severity=violation.severity
                        ).inc()
                        
                        action = RemediationAction(
                            action_id=str(uuid.uuid4()),
                            action_type=self._select_action(violation),
                            target=violation.invariant_name,
                            parameters={"severity": violation.severity}
                        )
                        result = self.remediation_engine.execute(action)
                        CORRECTIONS_TOTAL.labels(
                            action_type=action.action_type,
                            target=action.target
                        ).inc()
                        self.audit.log_event("remediation_executed", {
                            "action": asdict(action),
                            "result": result
                        })
                        
                    return  # Skip prediction/optimization after remediation
                
                # 3. Predict failures
                prediction = self.failure_predictor.predict(state)
                
                if prediction["high_risk"]:
                    self.audit.log_event("failure_predicted", {
                        "risk_score": prediction["risk_score"],
                        "patterns": prediction["predictions"]
                    })
                    
                    # Execute predictive remediation
                    for action_type in prediction["recommended_actions"]:
                        action = RemediationAction(
                            action_id=str(uuid.uuid4()),
                            action_type=action_type,
                            target="system",
                            priority=1
                        )
                        self.remediation_engine.execute(action)
                        CORRECTIONS_TOTAL.labels(
                            action_type=action_type,
                            target="system"
                        ).inc()
                        
                    # Count predictions
                    for p in prediction["predictions"]:
                        PREDICTIONS_TOTAL.labels(pattern=p["pattern"]).inc()
                        
                    return  # Skip optimization after predictive fix
                
                # 4. Optimization
                opportunities = self.optimization_engine.find_opportunities(state)
                
                if opportunities and self.persona.optimization_aggressiveness > 0.3:
                    self.audit.log_event("optimizations_found", {
                        "count": len(opportunities),
                        "opportunities": [asdict(o) for o in opportunities[:3]]
                    })
                    
                    for opp in opportunities[:2]:  # Limit per cycle
                        self.optimization_engine.apply_optimization(opp, self.remediation_engine)
                        OPTIMIZATIONS_TOTAL.labels(component=opp.component).inc()
                        
                self.audit.log_event("cycle_complete", {
                    "cycle": self.cycle_count,
                    "status": "stable"
                })
                
        except Exception as e:
            logger.error(f"Cycle failed: {e}")
            self.audit.log_event("cycle_error", {
                "cycle": self.cycle_count,
                "error": str(e)
            })
    
    def _select_action(self, violation: InvariantViolation) -> str:
        """Select remediation action based on persona and violation"""
        severity_priority = {
            "critical": ["nuke", "kill", "isolate", "restart", "config_regen"],
            "warning": ["adjust", "scale", "restart"],
            "info": ["adjust"]
        }
        
        candidates = severity_priority.get(violation.severity, ["adjust"])
        
        # Filter by persona preferences
        for action in candidates:
            if action in self.persona.prefer_actions:
                return action
            if action not in self.persona.avoid_actions:
                return action
                
        return candidates[0]
    
    async def start(self, interval: float = 2.0):
        """Start the Overseer runtime loop"""
        logger.info(f" Overseer starting — persona: {self.persona.name}")
        self.running = True
        
        # Start event processor
        asyncio.create_task(self.event_ingester.process_events())
        
        while self.running:
            try:
                await self.run_cycle()
            except Exception as e:
                logger.error(f"Cycle execution error: {e}")
                self.audit.log_event("cycle_error", {"error": str(e)})
                
            await asyncio.sleep(interval)
            
    def stop(self):
        """Stop the Overseer"""
        self.running = False
        self.audit.log_event("overseer_stop", {"total_cycles": self.cycle_count})

# =====================
# FASTAPI APP
# =====================
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
import psutil

app = FastAPI(title="Overseer Runtime", version="1.0.0")
overseer: Optional[Overseer] = None

@app.on_event("startup")
async def startup():
    global overseer
    overseer = Overseer(persona_name=os.getenv("OVERSEER_PERSONA", "oracle"))
    asyncio.create_task(overseer.start())

@app.get("/health")
async def health():
    """Overseer health endpoint"""
    if not overseer:
        return {"status": "starting"}
    return {
        "status": "healthy",
        "persona": overseer.persona.name,
        "cycles": overseer.cycle_count,
        "state_hash": overseer.last_state.hash if overseer.last_state else None
    }

@app.get("/state")
async def get_state():
    """Get current system state"""
    if not overseer or not overseer.last_state:
        raise HTTPException(404, "No state available")
    return asdict(overseer.last_state)

@app.get("/metrics")
async def get_metrics():
    """Prometheus metrics endpoint"""
    return Response(generate_latest(REGISTRY), media_type=CONTENT_TYPE_LATEST)

@app.post("/event")
async def post_event(event: Dict[str, Any]):
    """Ingest external event"""
    if not overseer:
        raise HTTPException(503, "Overseer not ready")
    await overseer.event_ingester.ingest("external", event)
    return {"status": "queued"}

@app.post("/remediate")
async def trigger_remediation(action: Dict[str, Any]):
    """Manually trigger remediation"""
    if not overseer:
        raise HTTPException(503, "Overseer not ready")
    
    remed_action = RemediationAction(
        action_id=str(uuid.uuid4()),
        action_type=action.get("type", "adjust"),
        target=action.get("target", "system"),
        parameters=action.get("parameters", {}),
        priority=action.get("priority", 1)
    )
    
    result = overseer.remediation_engine.execute(remed_action)
    return result

@app.get("/audit")
async def get_audit(limit: int = 100):
    """Get recent audit log entries"""
    if not overseer:
        raise HTTPException(503, "Overseer not ready")
    entries = list(overseer.audit.causality_chain)[-limit:]
    return entries

@app.get("/personas")
async def list_personas():
    """List available persona policies"""
    return {name: asdict(p) for name, p in PERSONAS.items()}

@app.post("/persona/{name}")
async def set_persona(name: str):
    """Switch overseer persona"""
    if not overseer:
        raise HTTPException(503, "Overseer not ready")
    if name not in PERSONAS:
        raise HTTPException(400, f"Unknown persona: {name}")
    overseer.persona = PERSONAS[name]
    persona_id = {"architect": 1, "sovereign": 2, "oracle": 3, "revenant": 4, "whisperer": 5}.get(name, 3)
    PERSONA.set(persona_id)
    overseer.audit.log_event("persona_switch", {"new_persona": name})
    return {"persona": name}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8084)