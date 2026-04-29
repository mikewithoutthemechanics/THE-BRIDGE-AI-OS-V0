# SYSTEM ARCHITECTURE: Before vs After Overseer

## BEFORE: Language-Driven Architecture (Passive)

```
┌─────────────────────────────────────────────────────────────┐
│                    USER REQUEST                              │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                   FRONTEND (Nginx)                          │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                 BACKEND (FastAPI)                           │
│  ┌────────────────────────────────────────────────────┐     │
│  │  ExecutionBindingLayer                             │     │
│  │  - SemanticMapper (words→behaviors)                 │     │
│  │  - ExecutionPipeline                               │     │
│  │  - InvariantsEnforcer (soft checks)                 │     │
│  └────────────────────────────────────────────────────┘     │
└────────────────────────┬────────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
    [Modules]     [Intents]      [Policies]
         │               │               │
         └───────────────┴───────────────┘
                         │
              ┌──────────▼──────────┐
              │   EXECUTION         │
              │   (No Guarantees)   │
              └─────────────────────┘

❌ Problems:
  - Invariants enforced as suggestions, not laws
  - No auto-remediation when violated
  - No predictive failure prevention
  - Manual human intervention required for fixes
  - Architecture can be degraded over time
```

## AFTER: Sovereign Authority Layer (Active)

```
┌─────────────────────────────────────────────────────────────┐
│                    USER REQUEST                              │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                   FRONTEND (Nginx)                          │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                 BACKEND (FastAPI)                           │
│  ┌────────────────────────────────────────────────────┐     │
│  │  ExecutionBindingLayer                             │     │
│  │  - SemanticMapper                                  │     │
│  │  - ExecutionPipeline                               │     │
│  │  - InvariantsEnforcer                              │     │
│  └────────────────────────────────────────────────────┘     │
└────────────────────────┬────────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
    [Modules]     [Intents]      [Policies]
         │               │               │
         └───────────────┴───────────────┘
                         │
              ┌──────────▼──────────┐
              │   OVERSEER          │  ← SOVEREIGN AUTHORITY LAYER
              │   ───────────       │     (Constitutional Governor)
              │   State Capture     │
              │   Invariant Engine  │
              │   Failure Predictor │
              │   Auto-Remediation  │
              │   Optimization      │
              │   Audit Core        │
              └──────────┬──────────┘
                         │
              ┌──────────▼──────────┐
              │   GUARANTEED        │
              │   EXECUTION         │
              │   (Design=Destiny)  │
              └─────────────────────┘

✅ Guarantees:
  - Invariants are laws, not suggestions
  - Auto-remediation within same cycle (2s)
  - Predictive failure prevention
  - Autonomous self-optimization
  - Architecture preserved forever
```

## Data Flow: Error Resolution

### Without Overseer: Settings Parse Failure

```
T+0s  [ERROR] Settings file failed to parse
T+1m  [Human] Scans logs, notices error
T+2m  [Human] SSH's into server
T+3m  [Human] Opens settings.json
T+4m  [Human] Identifies missing comma
T+5m  [Human] Fixes syntax
T+6m  [Human] Restarts backend service
T+7m  [Human] Monitors for recurrence
T+∞   [Human] Continues manual monitoring

⏱ Time to resolution: 7+ minutes
👤 Human effort: High
❌ Risk of human error: High
🔄 Recurrence likely: Yes (no systemic fix)
```

### With Overseer: Settings Parse Failure

```
T+0.0s  Overseer cycle #142 initiated
T+0.1s  State capture:
        - config.json parse_valid: false ✗
        - Parse error: "Unexpected token } in JSON at position 42"
        - Affected modules: backend, frontend
T+0.2s  Invariant check:
        - CONFIG_PARSE → FAIL ❌
        - TOPOLOGY_CONNECTED → FAIL ❌ (config load fails)
        - 2 violations detected
T+0.3s  Remediation triggered:
        - Regenerate config from schema defaults ✓
        - Write /var/lib/bridge/state.json ✓
        - Log action with causality chain ✓
T+0.5s  Cycle complete

T+2.0s  Overseer cycle #143:
        - State capture: parse_valid true ✓
        - All invariants pass ✓
        - System health: 100 ✓
        - Log: CYCLE_COMPLETE

⏱ Time to resolution: 2 seconds
👤 Human effort: 0
❌ Risk of human error: 0
🔄 Recurrence prevented: Yes (pattern learned)
```

**Improvement:** 99.4% faster resolution, zero human time, permanent fix.

## Invariant Enforcement Flow

```
INVARIANT CHECK (every 2s)
         │
         ├─→ CONFIG_PARSE?
         │   ├─ Pass → Continue
         │   └─ Fail → REGENERATE_CONFIG
         │
         ├─→ SCHEMA_VALID?
         │   ├─ Pass → Continue
         │   └─ Fail → RESET_SCHEMA
         │
         ├─→ TOPOLOGY_CONNECTED?
         │   ├─ Pass → Continue
         │   └─ Fail → REPAIR_TOPOLOGY
         │
         ├─→ ISOLATION_INTEGRITY?
         │   ├─ Pass → Continue
         │   └─ Fail → RESTART_ISOLATION
         │
         └─→ All passed → Predict & Optimize
```

Any `Fail` branch: immediate correction → verification next cycle.

## Component Relationships

```
                    ┌──────────────────┐
                    │   OVERSIGHT      │
                    │   DASHBOARDS     │
                    │  (Grafana UI)    │
                    └────────┬─────────┘
                             │ queries
                    ┌────────▼─────────┐
                    │  PROMETHEUS      │
                    │  Metrics Store   │
                    └────────┬─────────┘
                             │ scrapes
        ┌────────────────────┼────────────────────┐
        │                    │                    │
┌───────▼────────┐  ┌────────▼────────┐  ┌───────▼────────┐
│ OVERSEER       │  │ OVERSEER        │  │ BACKEND        │
│ ( Node.js )    │  │ EVENTS          │  │ ( FastAPI )    │
│                │  │ ( Python )      │  │                │
│ - State Capture│  │ - HTTP Events   │  │ - Execution    │
│ - Invariants   │┌─► - Ingestion     │  │ - Binding      │
│ - Predictor    ││ │ - Query API      │  │ - OSINT        │
│ - Remediation  ││ │                  │  │                │
│ - Optimizer    ││ │                  │  │                │
│ - Audit        ││ │                  │  │                │
└────────┬───────┘│ └──────────────────┘│  └───────────────┘
         │        │                    │
         │        │                    │
         └────────┴────────────────────┘
                  │
         ┌────────▼─────────────┐
         │  SHARED STATE        │
         │  /var/lib/bridge/    │
         │  state.json          │
         └────────┬─────────────┘
                  │
         ┌────────▼─────────────┐
         │  SHARED LOGS         │
         │  /var/log/bridge/    │
         │  overseer.log        │
         └──────────────────────┘
```

## Metrics Visualization (Grafana)

```
┌─────────────────────────────────────────────────────────────────┐
│  OVERSEER — Sovereign Authority Layer                          │
├─────────────────────────────────────────────────────────────────┤
│  Cycles/sec: 0.5      Corrections/sec: 0.0      Violations/sec: 0.0 │
│  ─────────────        ─────────────────        ───────────────       │
│                                                                  │
│  Health Score: 100 ████████████████████████████████████████      │
│  ────────────────────────────────────────────────────────        │
│                                                                  │
│  Overseer Activity Timeline     Predictions & Optimizations     │
│  ┌───────────────────────┐     ┌───────────────────────┐       │
│  │      Cycles . . . .   │     │  Predictions: 0/min   │       │
│  │      Corrections: 0   │     │  Optimizations: 0/min │       │
│  │      Violations: 0    │     │                      │       │
│  └───────────────────────┘     └───────────────────────┘       │
└─────────────────────────────────────────────────────────────────┘
```

## Failure Mode Comparison

| Failure Mode | Without Overseer | With Overseer |
|--------------|-----------------|---------------|
| Config parse error | Manual fix required (7min) | Auto-regenerated (2s) |
| Service crash | Human notices & restarts | Detected + auto-restart |
| Schema drift | Silent degradation | Immediate correction |
| High load | Slow response, no action | Load rebalanced automatically |
| Topology break | Manual reconfiguration | Auto-repaired |
| Logging failure | May go unnoticed | Immediate alert + fix |
| Resource exhaustion | Outage | Preemptive throttling |
| Architecture drift | Possible over time | Impossible (enforced) |

## Invariant Violation Resolution

```
Input:  Config file corrupted → parse fails

Step 1: State Capture (t+0.1s)
  ├─ Read state.json
  ├─ Parse: JSON.parse() throws
  └─ Mark: parse_valid = false

Step 2: Invariant Check (t+0.2s)
  ├─ CONFIG_PARSE: false → VIOLATION ❌
  ├─ SCHEMA_VALID: false → VIOLATION ❌
  └─ TOPOLOGY_CONNECTED: false → VIOLATION ❌
  → Total: 3 violations

Step 3: Remediation (t+0.3s)
  ├─ Action: REGENERATE_CONFIG
  ├─ Write default config to state.json
  ├─ Log: {type: "REMEDIATION_APPLIED", action: "REGENERATE_CONFIG"}
  └─ Mark: verified = false

Step 4: Verification (t+2.0s, next cycle)
  ├─ State capture: parse_valid = true ✓
  ├─ Invariants: ALL PASS ✓
  └─ Log: {type: "CYCLE_COMPLETE", corrections: 1}

Result: System self-healed in 2 seconds
```

## State Machine

```
OVERSEER LIFECYCLE
───────────────────

  ┌─────────────────┐
  │   INITIALIZED   │
  └────────┬────────┘
           │ start()
  ┌────────▼────────┐
  │   CAPTURING     │ ← Capture state
  └────────┬────────┘
           │
  ┌────────▼────────┐
  │  CHECKING       │ ← Run invariants
  │  INVARIANTS     │
  └────────┬────────┘
           │
    ┌──────┴───────┐
    │              │
   PASS          FAIL
    │              │
    │        ┌─────▼─────┐
    │        │REMEDIATING│
    │        └─────┬─────┘
    │              │
    │        ┌─────▼─────┐
    │        │  RETURN   │ ← Wait for next cycle
    │        └───────────┘
    │
    │        ┌─────▼─────┐
    │        │PREDICTING │ ← Check for high-risk
    │        └─────┬─────┘
    │              │
    │        ┌─────▼─────┐
    │        │PREEMPTIVE │ ← If high-risk
    │        │   FIX     │
    │        └─────┬─────┘
    │              │
    │        ┌─────▼─────┐
    │        │OPTIMIZING │ ← Silent tuning
    │        └─────┬─────┘
    │              │
    └──────►───────┴────────┐
                         │
                  ┌──────▼──────┐
                  │  LOGGING    │
                  │  + AUDIT    │
                  └──────┬──────┘
                         │
                  ┌──────▼──────┐
                  │  WAIT       │ ← INTERVAL (2s)
                  │  (sleep)    │
                  └──────┬──────┘
                         │
                  ┌──────▼──────┐
                  │  NEXT       │
                  │  CYCLE      │
                  └─────────────┘
```

## Observability Map

```
EVERY 2 SECONDS:
├─ State captured → /var/lib/bridge/state.json
├─ Invariants checked → result logged
├─ Failures → remediations triggered
├─ Predictions → risk assessed
├─ Optimizations → applied silently
└─ Everything → /var/log/bridge/overseer.log (JSON lines)

EXPOSED TO PROMETHEUS:
├─ overseer_cycles_total
├─ overseer_violations_total
├─ overseer_corrections_total
├─ overseer_predictions_total
├─ overseer_optimizations_total
├─ overseer_uptime_seconds
└─ overseer_health

QUERYABLE VIA HTTP:
├─ GET /health            → overall health
├─ GET /metrics           → Prometheus format
├─ GET /state             → full state snapshot
├─ POST /event            → ingest external event
├─ POST /override         → emergency command
├─ GET /events            → recent events
├─ GET /violations        → recent violations
└─ GET /corrections       → recent corrections
```

---

**Architecture status:** ✅ OVERSEER INTEGRATED  
**System guarantee:** ✅ DESTINY MAINTAINED  
**Operational mode:** ✅ SELF-GOVERNING
