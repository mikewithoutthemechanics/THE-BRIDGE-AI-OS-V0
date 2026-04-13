# AOE Unified Dashboard System - Running Guide

This document provides comprehensive instructions for running and using the unified dashboard system.

---

## System Overview

The AOE (Agent Orchestration Engine) Unified Dashboard is a multi-service architecture providing real-time system monitoring, agent orchestration, billing/treasury management, and AI inference capabilities.

### Architecture Components

| Service | Port | Description |
|---------|------|-------------|
| Main Server (system.js) | 3000 | Primary dashboard with topology visualization |
| Gateway (gateway.js) | 8080 | API gateway with SSE events, billing, orchestrator |
| Server (server.js) | 5000 | Legacy unified backend |

### Key Features

- **Real-time Event Streaming**: SSE-based live updates every 5 seconds
- **Agent Orchestration**: 8 simulated agents (alpha, beta, gamma, delta, epsilon, zeta, eta, theta)
- **Billing/Treasury**: Live treasury balance tracking with revenue/cost metrics
- **AI Inference**: LLM inference endpoint with fallback stub
- **Topology Visualization**: Interactive p5.js-based system topology dashboard

### API Endpoints (Gateway - Port 8080)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check with core service status |
| `/events/stream` | GET | Server-Sent Events stream |
| `/orchestrator/status` | GET | Agent orchestration status |
| `/billing` | GET | Treasury and billing information |
| `/ask` | POST | AI inference endpoint |

---

## Prerequisites

- Node.js >= 18.0.0
- npm (Node Package Manager)
- PM2 (optional, for production process management)

### Install Dependencies

```bash
cd aoe-unified-final
npm install
```

---

## Startup Commands

### Development Mode

#### Option 1: Direct Node Execution

```bash
# Start main server (port 3000)
node system.js

# Start gateway (port 8080) - in separate terminal
node gateway.js

# Start legacy server (port 5000) - in separate terminal
node server.js
```

#### Option 2: Using npm Scripts

```bash
# Start main server
npm start

# Start gateway
npm run gateway
```

#### Option 3: PM2 Process Manager (Recommended)

```bash
# Start both services with PM2
npm run pm2:start

# View logs
npm run pm2:logs

# Stop services
npm run pm2:stop

# Restart services
npm run pm2:restart
```

### Production Mode

```bash
# Using PM2 production mode
npm run pm2:prod

# Or with specific port
PORT=80 npm run start:80
PORT=443 npm run start:443
```

### Docker Deployment

```bash
# Build and run with Docker Compose
docker-compose up --build -d

# View logs
docker-compose logs -f
```

---

## Accessing the Dashboard

| Service | URL |
|---------|-----|
| Main Dashboard | http://localhost:3000 |
| Gateway API | http://localhost:8080 |
| Legacy Server | http://localhost:5000 |
| Onboarding | http://localhost:5000/onboarding.html |
| System Status | http://localhost:5000/system-status-dashboard.html |
| Topology | http://localhost:5000/topology.html |

---

## Usage Instructions

### 1. Health Check

```bash
# Check gateway health
curl http://localhost:8080/health

# Check legacy server health
curl http://localhost:5000/health

# Check API status
curl http://localhost:5000/api/status
```

### 2. Real-time Event Stream

Open in browser: `http://localhost:8080/events/stream`

Or via curl:
```bash
curl -N http://localhost:8080/events/stream
```

### 3. Orchestrator Status

```bash
curl http://localhost:8080/orchestrator/status
```

Response example:
```json
{
  "status": "running",
  "agents": 8,
  "active_agents": 8,
  "swarms": 2,
  "queue_depth": 12,
  "agents": [
    { "id": "agent_alpha", "name": "alpha", "status": "active", "tasks_completed": 423, "uptime_s": 86400 }
  ],
  "ts": 1700000000000
}
```

### 4. Billing/Treasury

```bash
curl http://localhost:8080/billing
```

### 5. AI Inference

```bash
curl -X POST http://localhost:8080/ask \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Your question here"}'
```

### 6. User Registration

```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username": "testuser", "email": "test@example.com"}'
```

---

## Available npm Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start main server (system.js) |
| `npm run dev` | Start with nodemon (auto-reload) |
| `npm run gateway` | Start gateway server |
| `npm run gateway:dev` | Start gateway with nodemon |
| `npm run pm2:start` | Start with PM2 (development) |
| `npm run pm2:prod` | Start with PM2 (production) |
| `npm run pm2:stop` | Stop PM2 processes |
| `npm run pm2:restart` | Restart PM2 processes |
| `npm run pm2:logs` | View PM2 logs |
| `npm run health` | Run health check script |
| `npm run preflight` | Run preflight checks |
| `npm run deploy` | Deploy to configured provider |
| `npm run deploy:railway` | Deploy to Railway |
| `npm run deploy:render` | Deploy to Render |
| `npm run deploy:fly` | Deploy to Fly.io |

---

## Troubleshooting

### Port Already in Use

```bash
# Find process using port
netstat -ano | findstr :8080
# or
lsof -i :8080

# Kill process
taskkill /PID <PID> /F
```

### Module Not Found

```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

### PM2 Issues

```bash
# Clear PM2 cache
pm2 delete all
pm2 kill

# Restart
npm run pm2:start
```

### Gateway Cannot Reach Core Service

The gateway attempts to connect to `localhost:3000` for health checks. Ensure the main server is running. If core is unreachable, the health endpoint returns `"core": "unreachable"` but still returns `"status": "OK"`.

### Event Stream Not Working

Ensure the client supports SSE (Server-Sent Events). The stream sends events every 5 seconds with the following types:
- `lead_delivered`
- `ai_inference`
- `swarm_dispatch`
- `task_completed`
- `treasury_update`

### Production Deployment Issues

1. **Port 80/443**: May require sudo/admin privileges
2. **Firewall**: Ensure ports are open
3. **Environment Variables**: Set `NODE_ENV=production`
4. **PM2 Startup**: Run `pm2 save && pm2 startup` for auto-restart on reboot

---

## File Structure

```
aoe-unified-final/
├── system.js           # Main server (port 3000)
├── gateway.js          # API gateway (port 8080)
├── server.js           # Legacy server (port 5000)
├── package.json        # Dependencies and scripts
├── ecosystem.config.js # PM2 configuration
├── public/             # Static frontend files
│   ├── index.html
│   ├── onboarding.html
│   ├── system-status-dashboard.html
│   └── topology.html
├── scripts/            # Utility scripts
│   ├── health-check.js
│   ├── preflight.js
│   └── deploy.js
├── logs/               # Application logs
└── RUNNING.md          # This file
```

---

## Security Notes

- The gateway includes CORS headers for all origins
- ContainerX (Xcontainerx/) has known security issues - review SYSTEM_VALIDATION_REPORT.md
- For production, add authentication middleware
- Consider rate limiting on public endpoints

---

## Additional Resources

- [SYSTEM_VALIDATION_REPORT.md](./SYSTEM_VALIDATION_REPORT.md) - System validation details
- [VIRTUAL_DEPLOYMENT_STATE.md](./VIRTUAL_DEPLOYMENT_STATE.md) - Virtual deployment info
- [CONSOLIDATED_AUDIT_FINAL.md](./CONSOLIDATED_AUDIT_FINAL.md) - Audit documentation
