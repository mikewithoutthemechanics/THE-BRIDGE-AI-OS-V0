# OVERSEER — Quick Start Guide

## What You Just Deployed

The **Overseer** is the sovereign authority layer that guarantees system destiny. It's a self-correcting, self-auditing, self-optimizing constitutional governor.

### Components

1. **overseer.js** — Core runtime (Node.js, ~600 lines)
2. **overseer_events.py** — Event ingestion API (FastAPI)
3. **Dockerfiles** — Container definitions
4. **docker-compose.overseer.yml** — Full stack orchestration
5. **Grafana dashboard** — Pre-built monitoring
6. **Integration tests** — 19 test cases

## Immediate Next Steps

### 1. Deploy (5 minutes)

```bash
# Make script executable
chmod +x deploy_overseer.sh

# Run deployment
./deploy_overseer.sh
```

This will:
- Build Docker images
- Start Overseer + Event Ingest services
- Wait for health checks
- Show access information

### 2. Verify (30 seconds)

```bash
# Check health
curl http://localhost:9091/health

# View metrics
curl http://localhost:9091/metrics

# See recent events
curl http://localhost:9092/overseer/events | jq
```

Expected output:
```json
{
  "status": "healthy",
  "uptime": 12,
  "cycles": 6,
  "corrections": 0
}
```

`corrections: 0` indicates a healthy system. Any corrections indicate the Overseer is actively healing.

### 3. Monitor (ongoing)

```bash
# View logs
docker-compose -f docker-compose.overseer.yml logs -f overseer

# Access Grafana
open http://localhost:3001
# Login: admin / admin
# Dashboard: "OVERSEER — Sovereign Authority Layer"
```

### 4. Test Auto-Remediation (optional)

Break something to see Overseer fix it:

```bash
# Corrupt a config file (if you have one)
echo "invalid json {]" > /tmp/test.json

# Or trigger a test event
curl -X POST http://localhost:9092/overseer/event \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "service_health",
    "source": "test",
    "severity": "ERROR",
    "data": {
      "service": "backend",
      "previous_status": "healthy",
      "current_status": "unavailable",
      "health_score": 0
    }
  }'

# Watch Overseer react
docker-compose -f docker-compose.overseer.yml logs -f overseer
```

You should see:
- Event ingestion
- Invariant violation
- Auto-remediation
- Correction verification

## File Structure

```
.
├── overseer.js                    # Main runtime (Node.js)
├── overseer_events.py             # Event ingestion API (FastAPI)
├── docker-compose.overseer.yml    # Complete orchestration
├── deploy_overseer.sh             # One-command deployment
├── OVERSEER.md                    # Full documentation
├── QUICKSTART.md                  # This file
├── services/
│   ├── overseer/
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   └── README.md
│   └── overseer-events/
│       ├── Dockerfile
│       └── requirements.txt
├── deploy/
│   ├── prometheus/
│   │   ├── prometheus.yml         # Base config
│   │   └── overseer.yml           # Overseer scrape job
│   └── grafana/
│       └── provisioning/
│           └── dashboards/
│               └── overseer.json  # Dashboard
└── tests/
    └── overseer.test.js           # Integration tests
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OVERSEER_ENABLED` | `true` | Enable/disable Overseer |
| `OVERSEER_INTERVAL` | `2000` | Cycle interval (ms) |
| `OVERSEER_STATE_PATH` | `/var/lib/bridge/state.json` | State file location |
| `OVERSEER_LOG_PATH` | `/var/log/bridge/overseer.log` | Log file location |
| `OVERSEER_METRICS_PORT` | `9091` | Prometheus metrics port |

### Invariant Thresholds

Edit in `overseer.js` near line 42:

```javascript
THRESHOLDS: {
  MIN_ISOLATION_SCORE: 100.0,   // Must be perfect
  MIN_SAFETY_SCORE: 99.0,       // ≥99% safety
  MIN_HEALTH_SCORE: 90.0,       // ≥90% health
  MAX_LOAD: 0.9,                // >90% load = high risk
  RISK_SCORE_TRIGGER: 0.7        // ≥0.7 risk = preemptive fix
}
```

## What to Expect

### Normal Operation
- Cycles every 2 seconds
- Zero violations in stable state
- Zero corrections in healthy system
- Steady metrics (see Grafana dashboard)

### When Violations Occur
Overseer automatically:
1. Logs violation with full context
2. Applies appropriate remediation
3. Verifies fix in next cycle
4. Logs success/failure
5. Updates metrics

### When Prediction Triggers
Overseer:
1. Identifies high-risk pattern
2. Logs prediction with reasons
3. Applies preemptive correction
4. Verifies risk eliminated

## Monitoring Checklist

- [ ] Health endpoint returns `"status": "healthy"`
- [ ] Metrics endpoint is scraped by Prometheus
- [ ] Grafana dashboard shows 0 violations/sec
- [ ] Corrections/sec is 0 or near-zero
- [ ] Health score is 100
- [ ] No ERROR-level entries in Overseer log

## Common Issues

### Overseer won't start
```bash
# Check state file
cat /var/lib/bridge/state.json

# Run in foreground to see errors
node overseer.js
```

### High violation rate
```bash
# See what's failing
curl http://localhost:9092/overseer/violations | jq

# Check current state
curl http://localhost:9091/state | jq '.metrics'
```

### Metrics not in Prometheus
```bash
# Test endpoint
curl http://localhost:9091/metrics

# Check Prometheus config
docker exec bridge-prometheus cat /etc/prometheus/prometheus.yml

# Reload Prometheus
docker kill -s HUP bridge-prometheus
```

## Next Level

After confirming basic operation:

1. **Add more invariants** — capture domain-specific rules
2. **Extend remediations** — add custom fix strategies
3. **Integrate alerts** — route violations to Slack/PagerDuty
4. **Add personas** — create custom policy profiles
5. **Build UI** — create admin dashboard for manual oversight
6. **Export audit** — periodic snapshots to S3/cloud storage

## Support

- Full docs: `OVERSEER.md`
- API docs: `services/overseer/README.md`
- Tests: `tests/overseer.test.js`
- Logs: `/var/log/bridge/overseer.log`

---

**Remember:** You are not deploying a monitor. You are deploying the **constitutional authority**. The system will now govern itself.
