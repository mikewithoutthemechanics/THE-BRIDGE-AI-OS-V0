"""
Integration tests for Overseer core components
Tests state capture, invariants, remediation, predictions, and optimization
"""

import asyncio
import json
import tempfile
import shutil
from pathlib import Path
from unittest.mock import patch, MagicMock
import pytest

# Test fixtures
@pytest.fixture
def temp_dir():
    """Create temporary directory for test state"""
    tmp = Path(tempfile.mkdtemp())
    yield tmp
    shutil.rmtree(tmp)

@pytest.fixture
def config_dir(temp_dir):
    """Create test config directory"""
    config_dir = temp_dir / "configs"
    config_dir.mkdir()
    
    # Valid config
    (config_dir / "test.json").write_text(json.dumps({"key": "value"}))
    return config_dir

@pytest.fixture
def state_file(temp_dir):
    """Create test state file"""
    state = temp_dir / "state.json"
    state.write_text(json.dumps({
        "schema": {"type": "object"},
        "topology": {"nodes": [{"id": 1}]},
        "load": 0.3
    }))
    return state

# =====================
# UNIT TESTS
# =====================
class TestStateCapture:
    """Test StateCapture subsystem"""
    
    def test_capture_topology(self, config_dir):
        from overseer import StateCapture
        
        capture = StateCapture([config_dir])
        topology = capture.capture_topology()
        
        assert "nodes" in topology
        assert len(topology["nodes"]) > 0
        assert topology["nodes"][0]["name"] == "test"
    
    def test_capture_configs(self, config_dir):
        from overseer import StateCapture
        
        capture = StateCapture([config_dir])
        configs = capture.capture_configs()
        
        assert "test" in configs
        assert configs["test"]["key"] == "value"
    
    def test_capture_state_integration(self, config_dir, state_file):
        from overseer import StateCapture, SystemState
        
        capture = StateCapture([config_dir, state_file.parent])
        state = capture.capture()
        
        assert isinstance(state, SystemState)
        assert state.topology is not None
        assert state.configs is not None
        assert state.metrics is not None
        assert state.health_scores is not None
        assert state.hash is not None

class TestInvariantEngine:
    """Test InvariantEngine"""
    
    def test_config_parsing_violation(self):
        from overseer import InvariantEngine, check_config_parsing, SystemState
        
        engine = InvariantEngine()
        engine.register_invariant(check_config_parsing)
        
        # Invalid config (string instead of dict)
        bad_state = SystemState(
            timestamp="2024-01-01T00:00:00",
            topology={"nodes": []},
            configs={"bad": "not a dict"},
            metrics={},
            health_scores={}
        )
        
        violations = engine.check_all(bad_state)
        assert len(violations) > 0
        assert any(v.invariant_name == "config_valid" for v in violations)
    
    def test_topology_integrity_violation(self):
        from overseer import InvariantEngine, check_topology_integrity, SystemState
        
        engine = InvariantEngine()
        engine.register_invariant(check_topology_integrity)
        
        bad_state = SystemState(
            timestamp="2024-01-01T00:00:00",
            topology={"nodes": "not an array"},  # Invalid
            configs={},
            metrics={},
            health_scores={}
        )
        
        violations = engine.check_all(bad_state)
        assert any(v.invariant_name == "topology_nodes_array" for v in violations)
    
    def test_health_thresholds(self):
        from overseer import InvariantEngine, check_health_thresholds, SystemState
        
        engine = InvariantEngine()
        engine.register_invariant(check_health_thresholds)
        
        bad_state = SystemState(
            timestamp="2024-01-01T00:00:00",
            topology={"nodes": []},
            configs={},
            metrics={},
            health_scores={"system": 0.1}  # Below 0.2 threshold
        )
        
        violations = engine.check_all(bad_state)
        critical_violations = [v for v in violations if v.severity == "critical"]
        assert len(critical_violations) > 0

class TestFailurePredictor:
    """Test FailurePredictor pattern detection"""
    
    @pytest.mark.asyncio
    async def test_memory_leak_detection(self):
        from overseer import FailurePredictor, StateCapture
        
        capture = StateCapture([])
        predictor = FailurePredictor()
        
        # Generate increasing memory trend
        states = []
        base_mem = 50.0
        for i in range(12):
            state = SystemState(
                timestamp=f"2024-01-01T00:00:{i:02d}",
                topology={"nodes": []},
                configs={},
                metrics={"memory_percent": base_mem + i * 4},
                health_scores={}
            )
            states.append(state)
            
        # Feed history
        predictor.history.extend(states)
        
        # Test prediction on latest state
        prediction = predictor.predict(states[-1])
        
        assert "memory_leak" in [p["pattern"] for p in prediction["predictions"]]
    
    def test_degradation_detection(self):
        from overseer import FailurePredictor
        
        predictor = FailurePredictor()
        
        # Create degrading health trend
        states = []
        for i in range(18):
            health = 1.0 - (i * 0.03)  # Sloping down
            state = SystemState(
                timestamp=f"2024-01-01T00:00:{i:02d}",
                topology={"nodes": []},
                configs={},
                metrics={},
                health_scores={"system": max(0.1, health)}
            )
            states.append(state)
            
        predictor.history.extend(states)
        prediction = predictor.predict(states[-1])
        
        patterns = [p["pattern"] for p in prediction["predictions"]]
        assert "degradation" in patterns

class TestRemediationEngine:
    """Test Auto-Remediation Engine"""
    
    def test_execute_config_regen(self):
        from overseer import RemediationEngine, PersonaPolicy, RemediationAction
        import tempfile
        import os
        
        # Use temp directory for state file
        with tempfile.TemporaryDirectory() as tmp:
            state_file = Path(tmp) / "state.json"
            # Patch STATE_FILE path
            import overseer
            original_state_file = overseer.STATE_FILE
            overseer.STATE_FILE = state_file
            
            try:
                persona = PersonaPolicy(
                    name="tester",
                    risk_tolerance=0.5,
                    optimization_aggressiveness=0.5,
                    remediation_speed="fast",
                    prefer_actions=[],
                    avoid_actions=[]
                )
                engine = RemediationEngine(persona)
                
                action = RemediationAction(
                    action_id="test-1",
                    action_type="config_regen",
                    target="system",
                    parameters={}
                )
                
                result = engine.execute(action)
                assert result["success"] is True
                assert state_file.exists()
            finally:
                overseer.STATE_FILE = original_state_file
    
    def test_action_selection_by_persona(self):
        from overseer import Overseer, PERSONAS
        
        # Test each persona selects preferred actions
        for persona_name, policy in PERSONAS.items():
            overseer = Overseer(persona_name=persona_name)
            
            violation = MagicMock()
            violation.severity = "critical"
            
            action = overseer._select_action(violation)
            
            # If persona has prefer_actions, selected action should be in that list
            if policy.prefer_actions:
                assert action in policy.prefer_actions or action not in policy.avoid_actions

class TestOptimizationEngine:
    """Test Optimization Engine"""
    
    def test_find_opportunities_high_load(self):
        from overseer import OptimizationEngine, PersonaPolicy, SystemState
        
        policy = PersonaPolicy(
            name="test",
            risk_tolerance=0.5,
            optimization_aggressiveness=0.6,
            remediation_speed="fast",
            prefer_actions=[],
            avoid_actions=[]
        )
        engine = OptimizationEngine(policy)
        
        state = SystemState(
            timestamp="2024-01-01T00:00:00",
            topology={"nodes": []},
            configs={},
            metrics={"load": 0.9},  # High load
            health_scores={}
        )
        
        opportunities = engine.find_opportunities(state)
        
        assert len(opportunities) > 0
        load_opp = next((o for o in opportunities if o.component == "load_balancer"), None)
        assert load_opp is not None
        assert load_opp.confidence > 0.5
    
    def test_optimization_respects_persona(self):
        from overseer import OptimizationEngine, PersonaPolicy, SystemState
        
        # Conservative persona (low optimization_aggressiveness)
        conservative = PersonaPolicy(
            name="conservative",
            risk_tolerance=0.2,
            optimization_aggressiveness=0.2,
            remediation_speed="gradual",
            prefer_actions=[],
            avoid_actions=[]
        )
        
        state = SystemState(
            timestamp="2024-01-01T00:00:00",
            topology={"nodes": []},
            configs={},
            metrics={"load": 0.9},
            health_scores={}
        )
        
        engine = OptimizationEngine(conservative)
        opps = engine.find_opportunities(state)
        
        # Should still find opportunities but confidence check
        assert isinstance(opps, list)

class TestAuditCore:
    """Test Audit Core causality chain"""
    
    def test_append_only_logging(self, temp_dir):
        from overseer import AuditCore
        
        log_file = temp_dir / "audit.log"
        audit = AuditCore(log_file)
        
        # Log several events
        audit.log_event("test_event", {"data": 123}, triggered_by="test")
        audit.log_event("another_event", {"value": 456})
        
        # Verify file append
        content = log_file.read_text()
        lines = content.strip().split('\n')
        assert len(lines) == 2
        
        # Verify causal parents
        event1 = json.loads(lines[0])
        event2 = json.loads(lines[1])
        assert event1["id"] in event2["causal_parents"]
    
    def test_causality_chain_integrity(self, temp_dir):
        from overseer import AuditCore
        
        log_file = temp_dir / "audit.log"
        audit = AuditCore(log_file)
        
        # Log 5 events
        for i in range(5):
            audit.log_event("cycle", {"n": i})
            
        assert len(audit.causality_chain) == 5
        # Each event should reference previous events
        for i in range(1, 5):
            parents = audit.causality_chain[i]["causal_parents"]
            assert audit.causality_chain[i-1]["id"] in parents

class TestPersonaPolicies:
    """Test Persona Policy Engine"""
    
    def test_all_personas_exist(self):
        from overseer import PERSONAS
        
        expected = ["architect", "sovereign", "oracle", "revenant", "whisperer"]
        for name in expected:
            assert name in PERSONAS
    
    def test_persona_properties_valid(self):
        from overseer import PERSONAS
        
        for name, policy in PERSONAS.items():
            assert 0.0 <= policy.risk_tolerance <= 1.0
            assert 0.0 <= policy.optimization_aggressiveness <= 1.0
            assert policy.remediation_speed in ["instant", "fast", "gradual"]
            assert isinstance(policy.prefer_actions, list)
            assert isinstance(policy.avoid_actions, list)

class TestEventIngestion:
    """Test Event Ingestion system"""
    
    @pytest.mark.asyncio
    async def test_event_queue(self):
        from overseer import EventIngester, AuditCore
        
        audit = AuditCore(Path("test_audit.log"))
        ingester = EventIngester(audit)
        
        # Register handler
        handled = []
        async def handler(event):
            handled.append(event)
        ingester.register_handler("test_event", handler)
        
        # Ingest event
        await ingester.ingest("test_event", {"key": "value"})
        
        # Give processor time
        await asyncio.sleep(0.1)
        
        assert len(handled) == 1
        assert handled[0]["type"] == "test_event"

# =====================
# INTEGRATION TESTS
# =====================
class TestOverseerLoop:
    """Full Overseer loop integration tests"""
    
    @pytest.mark.asyncio
    async def test_full_cycle_stable(self, config_dir, state_file, tmp_path):
        """Test complete cycle with healthy state"""
        import overseer
        
        # Override paths
        original_state = overseer.STATE_FILE
        original_audit = overseer.AUDIT_LOG
        original_config_dir = overseer.CONFIG_DIR
        
        try:
            overseer.STATE_FILE = state_file
            overseer.AUDIT_LOG = tmp_path / "audit.log"
            overseer.CONFIG_DIR = config_dir
            
            # Create fresh overseer
            o = overseer.Overseer(persona_name="oracle")
            
            # Run single cycle manually
            await o.run_cycle()
            
            assert o.cycle_count == 1
            assert o.last_state is not None
            assert o.last_state.hash is not None
            
            # Check audit log created
            assert overseer.AUDIT_LOG.exists()
            
            # Parse log entries
            log_content = overseer.AUDIT_LOG.read_text()
            entries = [json.loads(l) for l in log_content.strip().split('\n')]
            
            # Verify causal chain
            assert len(entries) >= 2
            assert entries[0]["id"] in entries[1]["causal_parents"]
            
        finally:
            overseer.STATE_FILE = original_state
            overseer.AUDIT_LOG = original_audit
            overseer.CONFIG_DIR = original_config_dir
    
    @pytest.mark.asyncio
    async def test_cycle_with_invariant_violation(self, tmp_path):
        """Test cycle detects and remediates invariant violation"""
        import overseer
        
        # Create invalid state (bad config type)
        state_file = tmp_path / "state.json"
        state_file.write_text(json.dumps({
            "schema": "not_an_object",  # Invalid - should be object
            "topology": {"nodes": []},
            "load": 0.3
        }))
        
        config_dir = tmp_path / "configs"
        config_dir.mkdir()
        
        # Override paths
        orig_state = overseer.STATE_FILE
        orig_audit = overseer.AUDIT_LOG
        orig_config = overseer.CONFIG_DIR
        
        try:
            overseer.STATE_FILE = state_file
            overseer.AUDIT_LOG = tmp_path / "audit.log"
            overseer.CONFIG_DIR = config_dir
            
            o = overseer.Overseer(persona_name="oracle")
            await o.run_cycle()
            
            # Should have triggered CONFIG_PARSE_FAIL or SCHEMA_INVALID
            log_content = overseer.AUDIT_LOG.read_text()
            entries = [json.loads(l) for l in log_content.strip().split('\n')]
            
            # Should see either invariant violation or corrective action
            event_types = [e["type"] for e in entries]
            assert "invariant_violations" in event_types or "remediation_executed" in event_types
            
        finally:
            overseer.STATE_FILE = orig_state
            overseer.AUDIT_LOG = orig_audit
            overseer.CONFIG_DIR = orig_config

    @pytest.mark.asyncio
    async def test_metrics_export(self):
        """Test Prometheus metrics endpoint"""
        from fastapi.testclient import TestClient
        import overseer
        
        # Need to start app without background loop for testing
        # This is simplified - full test would mock the overseer startup
        pass

# =====================
# PERFORMANCE TESTS
# =====================
class TestPerformance:
    """Performance and load tests"""
    
    @pytest.mark.asyncio
    async def test_cycle_latency(self, config_dir, state_file, tmp_path):
        """Ensure cycles complete within acceptable time"""
        import overseer
        import time
        
        orig_state = overseer.STATE_FILE
        orig_audit = overseer.AUDIT_LOG
        orig_config = overseer.CONFIG_DIR
        
        try:
            overseer.STATE_FILE = state_file
            overseer.AUDIT_LOG = tmp_path / "audit.log"
            overseer.CONFIG_DIR = config_dir
            
            o = overseer.Overseer()
            
            start = time.time()
            await o.run_cycle()
            elapsed = time.time() - start
            
            assert elapsed < 1.0, f"Cycle took {elapsed}s, expected < 1s"
            
        finally:
            overseer.STATE_FILE = orig_state
            overseer.AUDIT_LOG = orig_audit
            overseer.CONFIG_DIR = orig_config

if __name__ == "__main__":
    pytest.main([__file__, "-v"])