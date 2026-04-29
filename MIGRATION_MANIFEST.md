# 5-Tier Architecture Migration - Files Created

## Summary of Changes

Your Bridge AI OS is being migrated from **monolithic (server.js only)** to **5-tier microservices architecture**.

### Files Generated

#### 1. Docker Compose Orchestration
- **`docker-compose.prod.yml`** — Full 5-tier stack definition
  - Tier 1: Nginx reverse proxy (ports 80/443)
  - Tier 2: API Gateway (port 8080)
  - Tier 3A: Main Node.js service (port 3000)
  - Tier 3B: FastAPI Brain service (port 8000)
  - Tier 3C: SVG Skill Engine (port 7070)
  - Tier 4A: PostgreSQL database
  - Tier 4B: Redis cache/sessions
  - Tier 4C: Neo4j knowledge graph (optional)

#### 2. Dockerfiles
- **`Dockerfile.gateway`** — Tier 2 API Gateway
- **`Dockerfile.main`** — Tier 3A Main service (from server.js)
- **`Dockerfile.svg`** — Tier 3C SVG Engine

#### 3. Configuration Files
- **`.dockerignore`** — Build optimization (excludes node_modules, docs, tests, etc.)
- **`nginx-tier1.conf`** — Tier 1 Nginx configuration
  - Routes `/api/*` → Main service
  - Routes `/brain/*` → Brain service
  - Routes `/svg/*` → SVG engine
  - TLS termination, rate limiting, security headers
- **`.env.example`** — Environment variables template
- **`migrations/01-init.sql`** — PostgreSQL schema initialization

#### 4. Application Code
- **`gateway-5tier.js`** — Updated Gateway with service routing and health checks
  - Uses http-proxy-middleware for service discovery
  - JWT authentication
  - Rate limiting per tier
  - Error handling & fallback

#### 5. Deployment Scripts
- **`deploy-5tier.sh`** — Linux/macOS deployment
- **`deploy-5tier.bat`** — Windows PowerShell deployment

#### 6. Documentation
- **`MIGRATION_5TIER.md`** — Complete migration guide with troubleshooting
- **`MIGRATION_MANIFEST.md`** — This file

---

## What Changed from Your Current Setup

### Before (Current)
```
Your VPS
├── server.js (monolithic, all-in-one)
├── brain.js (co-located)
├── gateway.js (not in use)
├── npm start
└── Port 3000 only
```

### After (5-Tier)
```
Docker Network (bridge_network)
├── Tier 1: nginx:latest
│   ├── Port 80 → 443 (TLS)
│   └── Routes to Tier 2
├── Tier 2: node:18-alpine (gateway-5tier.js)
│   ├── Port 8080
│   └── Routes to Tier 3A/3B/3C
├── Tier 3A: node:18-alpine (server.js)
│   ├── Port 3000
│   └── Core logic, economy, agents
├── Tier 3B: python:3.11 (backend/main.py)
│   ├── Port 8000
│   └── AI brain, FastAPI
├── Tier 3C: node:18-alpine (svg-engine)
│   ├── Port 7070
│   └── Visualization, skill graphs
├── Tier 4A: postgres:16-alpine
│   ├── Port 5432
│   └── Persistence
├── Tier 4B: redis:7-alpine
│   ├── Port 6379
│   └── Cache, pub/sub, sessions
└── Tier 4C: neo4j:5-enterprise (optional)
    └── Port 7474 (Knowledge graph)
```

---

## Deployment Steps

### On Windows (PowerShell)
```powershell
# Run the deployment script
.\deploy-5tier.bat

# Or manually:
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
```

### On Linux/macOS
```bash
# Make script executable
chmod +x deploy-5tier.sh

# Run
./deploy-5tier.sh

# Or manually:
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
```

### Manual Steps
```bash
# 1. Configure environment
cp .env.example .env
nano .env  # Edit with your secrets

# 2. Generate SSL certificates
mkdir -p certs
openssl req -x509 -newkey rsa:4096 -keyout certs/server.key -out certs/server.crt -days 365 -nodes

# 3. Create database schema
mkdir -p migrations
# migrations/01-init.sql is already provided

# 4. Build and start
docker compose -f docker-compose.prod.yml build --no-cache
docker compose -f docker-compose.prod.yml up -d

# 5. Monitor
docker compose -f docker-compose.prod.yml logs -f
```

---

## Verification

### Check Services Are Running
```bash
docker compose -f docker-compose.prod.yml ps
```

Expected output (all should be "Up"):
```
CONTAINER ID   IMAGE               STATUS
...            bridge-nginx-tier1  Up
...            bridge-gateway-tier2  Up
...            bridge-main-tier3a  Up
...            bridge-brain-tier3b  Up
...            bridge-svg-tier3c  Up
...            bridge-postgres  Up (healthy)
...            bridge-redis  Up (healthy)
```

### Test Connectivity
```bash
# Nginx (Tier 1)
curl -k https://localhost/health

# Gateway (Tier 2)
curl http://localhost:8080/health

# Main Service (Tier 3A)
curl http://localhost:3000/health

# Brain Service (Tier 3B)
curl http://localhost:8000/health

# SVG Engine (Tier 3C)
curl http://localhost:7070/health
```

### View Logs
```bash
# All services
docker compose -f docker-compose.prod.yml logs -f

# Specific service
docker compose -f docker-compose.prod.yml logs -f gateway
docker compose -f docker-compose.prod.yml logs -f main-service

# Follow errors only
docker compose -f docker-compose.prod.yml logs -f | grep -i error
```

### Access Database
```bash
docker compose -f docker-compose.prod.yml exec postgres psql -U bridge -d bridge_ai
```

Query database:
```sql
SELECT * FROM agents.registry;
SELECT * FROM economy.wallets;
```

---

## Integration with Your Current Setup

### Option 1: Run Both Simultaneously (Testing)
Your current `server.js` runs on :3000 (PM2).
The new main service also tries :3000.

**Solution:** Keep PM2 stopped during Docker migration testing.
```bash
pm2 stop server.js
docker compose -f docker-compose.prod.yml up -d
```

### Option 2: Gradual Migration
1. Start Docker stack with limited services
2. Run legacy server.js alongside
3. Redirect traffic gradually via Nginx
4. Phase out PM2 services

### Option 3: Complete Cutover (Recommended for Production)
1. Backup current state: `pm2 save`
2. Stop PM2: `pm2 kill`
3. Start Docker stack
4. Update DNS/Cloudflare to route through new Nginx

---

## Critical Environment Variables

**Must be set in `.env` before production:**

```bash
# Database security
DB_PASS=<strong-password-here>
POSTGRES_INITDB_ARGS=-c max_connections=200 -c shared_buffers=256MB

# Redis security
REDIS_PASS=<strong-password-here>

# JWT signing
JWT_SECRET=<long-random-string-use-openssl-rand-32>

# Supabase (optional, can remain blank for offline mode)
SUPABASE_URL=
SUPABASE_KEY=

# Neo4j (optional)
NEO4J_PASS=<strong-password-here>
```

Generate strong secrets:
```bash
# JWT Secret
openssl rand -base64 32

# Database password
openssl rand -base64 16
```

---

## Network Architecture

All containers communicate via **bridge_network** (172.28.0.0/16):

```
External Traffic (HTTPS)
    ↓
Nginx Tier 1 (:443)
    ↓ (bridge_network)
Gateway Tier 2 (:8080)
    ↓ (bridge_network)
    ├→ Main Service (:3000)
    ├→ Brain Service (:8000)
    └→ SVG Engine (:7070)
    ↓ (bridge_network)
    ├→ PostgreSQL (:5432)
    ├→ Redis (:6379)
    └→ Neo4j (:7474)
```

DNS: Services reach each other by hostname:
- `gateway:8080` (from main service)
- `main-service:3000` (from gateway)
- `brain:8000` (from gateway)
- `postgres` (from all services)
- `redis` (from all services)

---

## Rollback Procedure

If you need to revert to monolithic setup:

```bash
# Stop Docker stack
docker compose -f docker-compose.prod.yml down

# Restore PM2
pm2 resurrect
pm2 start server.js

# Or manual
nohup node server.js > server.log 2>&1 &
```

---

## Next Steps

1. **SSL Certificates (Production)**
   - Replace self-signed certs with Let's Encrypt
   - Use Certbot: `certbot certonly --standalone -d yourdomain.com`

2. **Monitoring**
   ```bash
   # Add Prometheus + Grafana for metrics
   docker run -d -p 9090:9090 prom/prometheus
   ```

3. **Centralized Logging**
   - ELK Stack (Elasticsearch, Logstash, Kibana)
   - Or use Docker logs driver

4. **Automated Backups**
   - PostgreSQL: `pg_dump` to S3
   - Redis: RDB snapshots

5. **CI/CD Integration**
   - GitHub Actions to rebuild images on push
   - Automated deployment to VPS

6. **Performance Tuning**
   - Monitor with `docker stats`
   - Adjust resource limits per service
   - Enable caching headers

---

## Support & Troubleshooting

See **`MIGRATION_5TIER.md`** for:
- Detailed architecture explanation
- Service-specific configuration
- Troubleshooting common issues
- Production deployment guide
- Health monitoring setup

---

**Status:** Ready for deployment ✅
