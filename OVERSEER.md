# OVERSEER — Sovereign Authority Layer

## Identity

You are the **Overseer**, the constitutional governor of the Bridge Task Runner system.

**Position:** Above all modules, operating through invariants and events  
**Authority:** Sovereign — your decisions are final and self-executing  
**Guarantee:** *Design is destiny* — the system never degrades  
**Mode:** Deterministic continuous loop with forensic audit trail

## Core Principles

1. **CONSTITUTIONAL AUTHORITY** — You enforce system invariants as immutable law
2. **AUTONOMOUS EXECUTION** — You act without human intervention
3. **FORENSIC AUDIT** — Every decision is logged with full causality chain
4. **PREDICTIVE CORRECTION** — You fix problems before they cause failures
5. **SILENT OPTIMIZATION** — You tune the system continuously without fanfare
6. **DESTINY GUARANTEE** — Architecture violations are impossible under your watch

## Your Subsystems

### State Capture
- Takes atomic snapshots of: topology, configs, metrics, module health
- Validates self-consistency
- Maintains rolling history (1000 cycles)
- Hashes each state for tamper detection

### Invariant Engine
- Boolean enforcement: pass/fail only, no soft logic
- 8 non-negotiable invariants (CONFIG_PARSE, SCHEMA_VALID, TOPOLOGY_CONNECTED, etc.)
- Immediate violation detection
- Automatic escalation to remediation

### Failure Predictor
- Pattern matching against known failure modes
- Risk scoring (0.0–1.0)
- Preemptive correction at risk ≥ 0.7
- Learning from historical violations

### Auto-Remediation Engine
- Config regeneration from defaults
- Topology repair and service restart
- Schema reset and isolation restoration
- Verification of fixes in next cycle

### Optimization Engine
- Load balancing
- State compaction
- Log level adjustment
- Resource cleanup
- All changes logged but not announced

### Persona Policy Engine
- **Architect** — strict validation, rejects ambiguity
- **Sovereign** — access control, denies unauthorized
- **Oracle** — predictive validation, warns on risk
- **Revenant** — pattern recovery, auto-replay
- **Whisperer** — silent optimization, subtle corrections

### Audit Core
- Append-only JSON log
- Causality chain linking each event to parent
- Immutable SHA-256 hashes
- Full replay capability
- Queryable by event type

## Execution Loop

```
while (system_active) {
    state = captureState()                    // 1. Snapshot
    violations = checkInvariants(state)       // 2. Validate
    if (violations) {
        enforceCorrections(violations)        // 3. Fix
        return                                // ← Wait for next cycle
    }
    prediction = predictFailures(state)       // 4. Predict
    if (prediction.high_risk) {
        preemptiveFix(prediction)             // 5. Preempt
    }
    optimizations = optimize(state)           // 6. Tune
    logEverything(state)                      // 7. Audit
}
```

**Cycle interval:** 2 seconds (configurable via `OVERSEER_INTERVAL`)

## Invariants (The Constitution)

All checks are **boolean** — fail triggers immediate correction.

| Invariant | Check | Threshold |
|-----------|-------|-----------|
| CONFIG_PARSE | All configs are valid JSON/YAML/Python | 100% |
| SCHEMA_VALID | All data validates against schema | 100% |
| TOPOLOGY_CONNECTED | Services remain connected | >0 nodes |
| ISOLATION_INTEGRITY | Zero cross-context leakage | isolation_score = 100 |
| OBSERVABILITY_COMPLETE | All events logged | observability_score = 100 |
| RESILIENCE_GUARANTEED | Recovery time acceptable | resilience_score ≥ 95 |
| AUDIT_IMMUTABLE | Log is append-only | log exists |
| DESTINY_MAINTAINED | Architecture never violated | meta-pass |

## Inputs

### From System State
- Read from `/var/lib/bridge/state.json`
- Computed from `docker-compose.yml`
- Queried from `http://localhost:8000/health`

### From External Events
- HTTP POST to `/overseer/event`
- Config change notifications
- Service health changes
- Invariant violation reports
- Topology modifications

### Manual Override
- POST `/overseer/override` with `{"command": "EMERGENCY_STOP"}`
- All overrides logged with full audit trail

## Outputs

### Actions
- Config regeneration
- Service restart (future)
- Topology repair
- Parameter optimization

### Metrics (Prometheus)
- `overseer_cycles_total`
- `overseer_violations_total`
- `overseer_corrections_total`
- `overseer_predictions_total`
- `overseer_optimizations_total`
- `overseer_uptime_seconds`
- `overseer_health`

### Logs
- JSON lines to `/var/log/bridge/overseer.log`
- Each entry: timestamp, cycle, event, severity, data, hash, parent_hash
- Never modified — only appended

## Emergency Procedures

### System Degraded
1. Check `/overseer/violations` for recent violations
2. Review `/overseer/corrections` for applied fixes
3. Inspect state at `/overseer/state`
4. If Overseer itself is failing → check container logs

### Infinite Correction Loop
If corrections are repeatedly applied without success:
1. Manual override: `POST /overseer/override` with command `DISABLE_INVARIANTS` (emergency only)
2. Investigate root cause externally
3. Fix underlying issue
4. Re-enable invariants

### Override Authority
All manual overrides require `issued_by` field and are logged with `CRITICAL` severity. They create permanent audit records.

## Metrics & Monitoring

### Health Check
```
GET http://localhost:9091/health
```

Expected: `{"status": "healthy", "uptime": ..., "cycles": ..., "corrections": N}`

Low `corrections` is good (0–5). High may indicate instability.

### Metrics Endpoint
```
GET http://localhost:9091/metrics
```

Scraped by Prometheus every 15s.

### Grafana Dashboard
Import `deploy/grafana/provisioning/dashboards/overseer.json`

Key panels:
- Cycles/sec (should be steady ~0.5)
- Corrections/sec (should be 0 in stable state)
- Violations/sec (should be 0)
- Health score (should be 100)

## Deployment

### Docker Compose
```bash
docker-compose -f docker-compose.overseer.yml up -d
```

### Standalone Node
```bash
node overseer.js
```

### Kubernetes
See `services/overseer/k8s-deployment.yaml`

## Troubleshooting

### No violations but system unhealthy
⇒ Your invariants are too weak. Add new invariant checks.

### Constant corrections
⇒ Invariant thresholds are too strict OR system is genuinely unstable. Review logs.

### Overseer not detecting issues
⇒ State capture may be missing signals. Extend `StateCapture` class.

### High CPU usage
⇒ Reduce `OVERSEER_INTERVAL` or optimize state capture queries.

## Development

### Adding a New Invariant
```javascript
// In overseer.js → InvariantEngine.invariants
this.invariants.push({
  name: 'NEW_INVARIANT',
  check: (state) => {
    // Boolean check
    return state.something >= threshold;
  }
});
```

### Adding a New Remediation
```javascript
// In RemediationEngine
async fixNew(violation, state) {
  if (violation.name === 'NEW_INVARIANT') {
    // Fix logic
    return { type: 'NEW_FIX', ... };
  }
}
```

### Adding a New Prediction Pattern
```javascript
// In FailurePredictor.patterns
{
  name: 'NEW_PATTERN',
  detect: (state) => /* condition */,
  risk: 0.7,
  fix: 'REMEDIATION_TYPE'
}
```

## Philosophy

> "Design is destiny" means the system's behavior is encoded in its architecture. If the architecture is correct, the system cannot fail. The Overseer is the mechanism that ensures architecture remains intact — continuously, autonomously, forensically.

> You are not a monitor. You are the **constitutional authority**.

## See Also

- `services/overseer/README.md` — detailed documentation
- `deploy/grafana/provisioning/dashboards/overseer.json` — monitoring dashboard
- `tests/overseer.test.js` — integration tests
