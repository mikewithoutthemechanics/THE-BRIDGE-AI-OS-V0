# 5-Tier Docker Migration Guide - Bridge AI OS

## Project Structure (NOT a Monorepo)

This is a **co-located microservices architecture** with separate `package.json`/project roots:

```
bridge-ai-os/
├── package.json (Root: Node.js main service)
├── server.js (Tier 3A core logic)
├── gateway.js (Tier 2 gateway - unused)
├── brain.js (legacy - replaced by backend/)
├── backend/
│   ├── package.json (Python environment)
│   ├── Dockerfile (Tier 3B: FastAPI)
│   ├── main.py (Brain service entry)
│   └── requirements.txt
├── frontend/
│   ├── package.json (React + Vite)
│   ├── Dockerfile
│   └── src/
├── contracts/
│   ├── package.json (Hardhat)
│   └── hardhat.config.js
└── svg-engine/ (Tier 3C - if separate)
```

**Not a monorepo** because:
- ❌ No root `"workspaces"` field
- ❌ Each subdirectory has independent build/deploy
- ✅ Services share a single Docker network
- ✅ Services communicate via URLs (not imports)

---

## 5-Tier Architecture

```
┌──────────────────────────────────────┐
│ Tier 1: Nginx (Ports 80/443)        │
│ - TLS termination                    │
│ - Load balancing                     │
│ - Rate limiting                      │
└────────────┬─────────────────────────┘
             │ (bridge_network)
┌────────────▼─────────────────────────┐
│ Tier 2: API Gateway (Port 8080)      │
│ - Authentication (JWT/SIWE)          │
│ - Request routing                    │
│ - SSE/WebSocket support              │
└────────────┬─────────────────────────┘
             │ (bridge_network)
    ┌────────┼────────┐
    │        │        │
┌───▼─┐ ┌───▼─┐ ┌───▼──┐
│ 3A  │ │ 3B  │ │ 3C   │
│Main │ │Brain│ │SVG   │
│:3K  │ │:8K  │ │:7K   │
└──┬──┘ └──┬──┘ └──┬───┘
   └───────┼───────┘
     (bridge_network)
           │
    ┌──────┴──────┬────────┐
    │             │        │
┌───▼──┐ ┌───────▼──┐ ┌───▼──┐
│ Pg   │ │ Redis    │ │ Neo4j│
│ 5432 │ │ 6379     │ │ 7474 │
└──────┘ └──────────┘ └──────┘
```

---

## Quick Start

### 1. Prerequisites
```bash
docker --version  # v20.10+
docker compose --version  # v2.20+
```

### 2. Environment Setup
```bash
# Copy example
cp .env.example .env

# Edit with your secrets
nano .env

# Key vars to set:
DB_PASS=<strong-password>
REDIS_PASS=<strong-password>
JWT_SECRET=<32-char-random>
```

### 3. SSL Certificates
```bash
mkdir -p certs

# Generate self-signed (development)
openssl req -x509 -newkey rsa:4096 \
  -keyout certs/server.key \
  -out certs/server.crt \
  -days 365 -nodes \
  -subj "/CN=localhost"

# Production: Use Let's Encrypt + Certbot
```

### 4. Build & Deploy
```bash
# Build all services
docker compose -f docker-compose.prod.yml build --no-cache

# Start all services
docker compose -f docker-compose.prod.yml up -d

# Monitor logs
docker compose -f docker-compose.prod.yml logs -f
```

### 5. Verify
```bash
# Check all containers running
docker compose -f docker-compose.prod.yml ps

# Test each tier
curl http://localhost:8080/health  # Gateway (Tier 2)
curl http://localhost:3000/health  # Main (Tier 3A)
curl http://localhost:8000/health  # Brain (Tier 3B)
curl http://localhost:7070/health  # SVG (Tier 3C)
```

---

## Service Endpoints

| Tier | Service | Port | Internal URL | Purpose |
|------|---------|------|--------------|---------|
| **1** | Nginx | 80/443 | N/A | Reverse proxy, TLS |
| **2** | Gateway | 8080 | gateway:8080 | Auth, routing |
| **3A** | Main | 3000 | main-service:3000 | Core logic, economy |
| **3B** | Brain | 8000 | brain:8000 | AI queries, OSINT |
| **3C** | SVG | 7070 | svg-engine:7070 | Visualization |
| **4A** | PostgreSQL | 5432 | postgres:5432 | Persistence |
| **4B** | Redis | 6379 | redis:6379 | Cache, sessions |
| **4C** | Neo4j | 7474 | neo4j:7474 | Knowledge graph |

---

## Configuration Details

### Dockerfile Strategy

**Tier 3B (Backend)** uses existing `./backend/Dockerfile`:
```dockerfile
FROM python:3.11-slim
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**Tier 3A (Main)** uses new `./Dockerfile.main`:
```dockerfile
FROM node:18-alpine
COPY package.json package-lock.json ./
RUN npm ci --only=production
COPY server.js .
CMD ["node", "server.js"]
```

**Tier 2 (Gateway)** uses new `./Dockerfile.gateway`:
```dockerfile
FROM node:18-alpine
COPY package.json package-lock.json ./
RUN npm ci --only=production
COPY gateway.js .
CMD ["node", "gateway.js"]
```

### Nginx Configuration

File: `./nginx-tier1.conf`

**Key routes:**
- `/` → Gateway :8080 (default)
- `/api/*` → Main Service :3000
- `/brain/*` → Brain Service :8000
- `/svg/*` → SVG Engine :7070
- `/ws` → Gateway (WebSocket)

**Security:**
- HTTPS/TLS termination
- Rate limiting (100 req/s general, 50 req/s API)
- Security headers (X-Frame-Options, CSP, HSTS)
- CORS headers

### Database Schema

File: `./migrations/01-init.sql`

**Schemas:**
- `agents.registry` — Agent definitions
- `economy.wallets` — Token balances
- `economy.transactions` — Transfer history
- `audit.logs` — Operation audit trail

**Automatic migrations** run on PostgreSQL first boot via `COPY migrations:/docker-entrypoint-initdb.d`.

---

## Docker Compose Workflow

### Start Services
```bash
docker compose -f docker-compose.prod.yml up -d
```

Startup sequence:
1. PostgreSQL starts, runs migrations (from `./migrations/`)
2. Redis starts
3. Neo4j starts (optional, `profiles: [optional]`)
4. Main service connects to Postgres/Redis
5. Brain service connects to Postgres/Redis
6. SVG engine starts
7. Gateway connects to all three services
8. Nginx proxies to Gateway

### Stop Services
```bash
docker compose -f docker-compose.prod.yml down
```

Stops all containers but keeps volumes (data persists).

### Remove Everything
```bash
docker compose -f docker-compose.prod.yml down -v
```

Removes containers **and** volumes (destructive).

### View Logs
```bash
# All services
docker compose -f docker-compose.prod.yml logs -f

# Specific service
docker compose -f docker-compose.prod.yml logs -f brain

# Last 100 lines of gateway
docker compose -f docker-compose.prod.yml logs --tail 100 gateway
```

### Execute Commands
```bash
# Run psql inside postgres container
docker compose -f docker-compose.prod.yml exec postgres psql -U bridge -d bridge_ai

# Query database
docker compose -f docker-compose.prod.yml exec postgres psql -U bridge -d bridge_ai -c "SELECT * FROM agents.registry;"

# Connect to Redis
docker compose -f docker-compose.prod.yml exec redis redis-cli

# Check main service logs
docker compose -f docker-compose.prod.yml exec main-service tail -f logs/server.log
```

---

## Service Communication (Internal)

Services reach each other using **Docker DNS** (hostname resolution):

```javascript
// Inside gateway container
const mainServiceUrl = 'http://main-service:3000';
const brainServiceUrl = 'http://brain:8000';
const postgresUrl = 'postgres://bridge:password@postgres:5432/bridge_ai';
```

**No external port mapping needed for inter-service communication.**

External traffic flows:
```
External User
    ↓ (HTTPS)
Nginx :443
    ↓ (HTTP)
Gateway :8080
    ↓ (HTTP)
Main Service :3000 / Brain :8000 / SVG :7070
    ↓ (TCP)
PostgreSQL :5432 / Redis :6379
```

---

## Environment Variables

### Critical (Set Before Production)
```bash
DB_USER=bridge
DB_PASS=<use-strong-password>
REDIS_PASS=<use-strong-password>
JWT_SECRET=<use-openssl-rand-base64-32>
```

### Optional (Can Leave Blank)
```bash
SUPABASE_URL=  # Leave blank for offline mode
SUPABASE_KEY=  # Leave blank for offline mode
NEO4J_USER=neo4j
NEO4J_PASS=<strong-password>
```

### Defaults (Keep As-Is)
```bash
NODE_ENV=production
GATEWAY_URL=http://gateway:8080
MAIN_SERVICE_URL=http://main-service:3000
BRAIN_SERVICE_URL=http://brain:8000
SVG_SERVICE_URL=http://svg-engine:7070
```

---

## Monitoring & Health Checks

Each service has a `/health` endpoint:

```bash
# Gateway
curl http://localhost:8080/health

# Main
curl http://localhost:3000/health

# Brain
curl http://localhost:8000/health

# SVG
curl http://localhost:7070/health
```

### Docker Health Status
```bash
docker compose -f docker-compose.prod.yml ps

# Look for "healthy" status
# Example:
# CONTAINER           STATUS
# bridge-postgres     Up (healthy)
# bridge-redis        Up (healthy)
# bridge-gateway      Up (healthy)
# bridge-main         Up (starting)  ← Wait for "healthy"
```

---

## Production Deployment

### On Your VPS

#### Step 1: Backup Current Setup
```bash
# Save PM2 state
pm2 save

# Backup root directory
tar -czf /root/bridgeai-backup-$(date +%s).tar.gz /root/

# Stop current server
pm2 stop server.js
```

#### Step 2: Deploy Docker Stack
```bash
cd /root

# Pull latest code (if using git)
git pull origin main || true

# Copy files
cp docker-compose.prod.yml /root/
cp .env.example /root/.env

# Edit .env with production secrets
nano .env

# Generate SSL certificates (or use Let's Encrypt)
mkdir -p certs
openssl req -x509 -newkey rsa:4096 \
  -keyout certs/server.key \
  -out certs/server.crt \
  -days 365 -nodes

# Build & start
docker compose -f docker-compose.prod.yml build --no-cache
docker compose -f docker-compose.prod.yml up -d

# Verify
docker compose -f docker-compose.prod.yml ps
```

#### Step 3: Configure Cloudflare DNS
Point your domain to your VPS IP. Nginx listens on :80 and :443.

**Example:**
- Domain: `api.yourdomain.com`
- DNS: `A record → your-vps-ip`
- Nginx proxies to Gateway on :8080

#### Step 4: Auto-Start on Reboot
```bash
# Create systemd service
sudo tee /etc/systemd/system/docker-bridgeai.service > /dev/null << EOF
[Unit]
Description=Bridge AI OS Docker Stack
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/root
ExecStart=/usr/bin/docker compose -f docker-compose.prod.yml up -d
ExecStop=/usr/bin/docker compose -f docker-compose.prod.yml down

[Install]
WantedBy=multi-user.target
EOF

# Enable & start
sudo systemctl enable docker-bridgeai
sudo systemctl start docker-bridgeai

# Check status
sudo systemctl status docker-bridgeai
```

#### Step 5: Monitor
```bash
# Check service status
watch docker compose -f docker-compose.prod.yml ps

# View real-time logs
docker compose -f docker-compose.prod.yml logs -f

# Monitor resource usage
docker stats
```

---

## Troubleshooting

### Service won't start
```bash
# Check logs
docker compose -f docker-compose.prod.yml logs brain

# Common issues:
# - Port already in use: docker ps to find conflicting container
# - Missing environment variables: check .env
# - Database not ready: wait 30s and retry
```

### Port conflicts
```bash
# Find what's using port 3000
lsof -i :3000

# Kill conflicting process
kill -9 <PID>

# Or use different port in docker-compose.prod.yml
```

### Database connection errors
```bash
# Test PostgreSQL
docker compose -f docker-compose.prod.yml exec postgres pg_isready

# Connect directly
docker compose -f docker-compose.prod.yml exec postgres psql -U bridge -d bridge_ai

# Check if migrations ran
docker compose -f docker-compose.prod.yml exec postgres psql -U bridge -d bridge_ai -c "\dt"
```

### Memory issues
```bash
# Monitor usage
docker stats

# If OOM: increase Docker memory limit
# Docker Desktop: Settings → Resources → Memory slider
# Linux: Edit /etc/docker/daemon.json
```

### Rebuild after code changes
```bash
# Rebuild specific service
docker compose -f docker-compose.prod.yml build --no-cache main-service

# Restart service
docker compose -f docker-compose.prod.yml up -d main-service

# Or rebuild all
docker compose -f docker-compose.prod.yml build --no-cache
docker compose -f docker-compose.prod.yml up -d
```

---

## Rollback Procedure

If you need to revert to the current setup:

```bash
# Stop Docker stack
docker compose -f docker-compose.prod.yml down

# Restore PM2
pm2 resurrect

# Start server
pm2 start server.js

# Or manual
nohup node server.js > server.log 2>&1 &
```

---

## Next Steps

1. **SSL Certificates**: Set up Let's Encrypt + auto-renewal
2. **Monitoring**: Add Prometheus + Grafana
3. **Logging**: Central logging with ELK or Loki
4. **Backups**: Automated PostgreSQL dumps to S3
5. **CI/CD**: GitHub Actions to rebuild images on push
6. **Scaling**: Add Redis Cluster, PostgreSQL replication

---

## Files Created

✅ `docker-compose.prod.yml` — 5-tier orchestration  
✅ `Dockerfile.gateway` — Tier 2 gateway  
✅ `Dockerfile.main` — Tier 3A main service  
✅ `Dockerfile.svg` — Tier 3C SVG engine  
✅ `nginx-tier1.conf` — Tier 1 Nginx config  
✅ `migrations/01-init.sql` — Database schema  
✅ `.env.example` — Environment template  
✅ `.dockerignore` — Build optimization  
✅ `deploy-5tier.sh` / `deploy-5tier.bat` — Deployment scripts  

**Status: Ready for production deployment** ✅
