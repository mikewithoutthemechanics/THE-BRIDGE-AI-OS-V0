# OVERSEER — Deployment Verification

## Pre-Flight Checklist

Before deploying, verify:

- [ ] Docker is installed (`docker --version`)
- [ ] Docker Compose is installed (`docker-compose --version` or `docker compose version`)
- [ ] Ports 9091, 9092, 8000, 3000 are available
- [ ] Sufficient disk space (~1GB)
- [ ] Write permissions to `/var/lib/bridge` and `/var/log/bridge` (or use volume mounts)

## Deployment

```bash
# Clone or navigate to project root
cd aoe-unified-final-main

# Make deployment script executable
chmod +x deploy_overseer.sh

# Deploy
./deploy_overseer.sh
```

Expected output:
```
╔══════════════════════════════════════════════╗
║   OVERSEER — Sovereign Authority Layer       ║
║   Constitutional Governor Deployment         ║
╚══════════════════════════════════════════════╝

[INFO] Checking prerequisites...
[INFO] Prerequisites check passed
[INFO] Creating required directories...
[INFO] Directories created
[INFO] Building Overseer Docker images...
...
[INFO] Deployment complete
```

## Post-Deployment Verification

### 1. Health Check (10s after deployment)

```bash
curl http://localhost:9091/health
```

Expected:
```json
{
  "status": "healthy",
  "uptime": 10,
  "cycles": 5,
  "corrections": 0
}
```

**Interpretation:**
- `status: "healthy"` — Overseer is running
- `cycles` — number of execution cycles completed
- `corrections: 0` — system is stable (no fixes needed)

### 2. Metrics Endpoint

```bash
curl http://localhost:9091/metrics | head -15
```

Expected:
```
# HELP overseer_cycles_total Total execution cycles
# TYPE overseer_cycles_total counter
overseer_cycles_total 5

# HELP overseer_violations_total Total invariant violations
# TYPE overseer_violations_total counter
overseer_violations_total 0
...
```

### 3. Event Ingestion API

```bash
curl http://localhost:9092/overseer/status
```

Expected:
```json
{
  "overseer": { "status": "running", ... },
  "endpoints": { ... }
}
```

### 4. Docker Containers

```bash
docker-compose -f docker-compose.overseer.yml ps
```

Expected:
```
     Name                     Command               State           Ports
----------------------------------------------------------------------------------
bridge-overseer          node overseer.js              Up      0.0.0.0:9091->9091/tcp
bridge-overseer-events   uvicorn overseer_events: ...  Up      0.0.0.0:9092->9092/tcp
bridge-backend           uvicorn main:app --hos ...    Up      0.0.0.0:8000->8000/tcp
bridge-frontend          /docker-entrypoint. ...       Up      0.0.0.0:3000->80/tcp
```

All 4 containers should be `Up` and ` healthy`.

### 5. Grafana Dashboard

```bash
open http://localhost:3001
# Login: admin / admin (first time)
# Dashboard: "OVERSEER — Sovereign Authority Layer"
```

Should show:
- Cycles/sec: steady ~0.5
- Corrections/sec: 0 (or near-zero)
- Violations/sec: 0
- Health Score: 100

## Testing Auto-Remediation

To verify Overseer actually fixes problems:

### Test 1: Corrupt State File

```bash
# Corrupt the state
echo "invalid json {]" > /var/lib/bridge/state.json

# Wait 5 seconds for next cycle

# Check health
curl http://localhost:9091/health
```

Expected: `corrections` increased by 1, state regenerated automatically.

### Test 2: Send Test Event

```bash
curl -X POST http://localhost:9092/overseer/event \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "service_health",
    "source": "manual_test",
    "severity": "WARN",
    "data": {
      "service": "backend",
      "previous_status": "healthy",
      "current_status": "degraded",
      "health_score": 75
    }
  }'
```

Expected: Event logged, health status recorded.

### Test 3: Stop Backend

```bash
docker-compose -f docker-compose.overseer.yml stop backend

# Wait 10s

# Check Overseer logs
docker-compose -f docker-compose.overseer.yml logs -f overseer
```

Expected: Service health change detected, violation logged, attempted remediation.

## Monitoring in Production

### Log Files

```bash
# Overseer audit log (forensic)
tail -f /var/log/bridge/overseer.log

# Docker logs
docker-compose -f docker-compose.overseer.yml logs -f overseer
```

Log format (JSON per line):
```json
{
  "t": "2026-04-27T12:39:51.123Z",
  "c": 142,
  "e": "CYCLE_COMPLETE",
  "s": "INFO",
  "d": { "health": 100, "violations": 0, ... },
  "h": "b8e2d4f1c6a9..."
}
```

### Metrics for Alerting

Add to Prometheus alert rules:

```yaml
- alert: OverseerViolations
  expr: overseer_violations_total > 0
  for: 30s

- alert: OverseerHealthDegraded
  expr: overseer_health < 95
  for: 1m

- alert: OverseerStopped
  expr: up{job="overseer"} == 0
  for: 30s
```

## Troubleshooting

### Overseer not starting
```bash
# Check state file permissions
ls -la /var/lib/bridge/state.json

# Run foreground to see errors
node overseer.js

# Check Docker logs
docker-compose -f docker-compose.overseer.yml logs overseer
```

### High correction rate
```bash
# See what's being corrected
curl http://localhost:9092/overseer/corrections | jq '.corrections[-10:]'

# Check invariants being violated
curl http://localhost:9092/overseer/violations | jq '.violations[-10:]'

# Adjust thresholds in overseer.js if too aggressive
```

### Metrics not appearing in Prometheus
```bash
# Verify scrape target
curl http://localhost:9091/metrics

# Check Prometheus targets UI: http://localhost:9090/targets
# Look for "overseer" job

# Reload Prometheus config
docker kill -s HUP bridge-prometheus
```

## Scaling

Overseer is designed to run as **single instance** (constitutional authority must be singular). For HA:

- Deploy active-passive with leader election
- Shared state on replicated storage (etcd, Consul)
- Mutual TLS between instances
- Automatic failover on health check failure

See `services/overseer/k8s-deployment.yaml` for production HA config.

## Uninstall

```bash
# Stop and remove services
docker-compose -f docker-compose.overseer.yml down -v

# Remove volumes (WARNING: deletes all state & logs)
docker volume rm bridge_overseer_data bridge_overseer_logs
```

## Next Steps

1. **Configure alerting** — route violations to Slack/email
2. **Add custom invariants** — domain-specific rules
3. **Extend remediations** — custom fix strategies
4. **Integrate CI/CD** — gate deployments on Overseer health
5. **Build admin UI** — dashboard for manual oversight
6. **Enable HA** — active-passive for production

---

**System Status:** `curl http://localhost:9091/health`  
**Docs:** `OVERSEER.md`  
**Logs:** `/var/log/bridge/overseer.log`
