# 5-Tier Docker Migration Guide

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│ Tier 1: Nginx Reverse Proxy (Ports 80/443)                    │
│ - TLS termination, load balancing, rate limiting              │
└────────────────┬────────────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────────────┐
│ Tier 2: API Gateway (Port 8080)                                │
│ - Authentication (JWT/SIWE), routing, SSE support              │
└────────────────┬────────────────────────────────────────────────┘
                 │
    ┌────────────┼────────────┐
    │            │            │
┌───▼──┐    ┌────▼───┐   ┌────▼───┐
│Tier3A│    │Tier3B  │   │Tier3C  │
│Main  │    │Brain   │   │SVG     │
│:3000 │    │:8000   │   │:7070   │
└───┬──┘    └────┬───┘   └────┬───┘
    │            │            │
    └────────────┼────────────┘
                 │
    ┌────────────┴────────────┐
    │                         │
┌───▼──────┐    ┌────────────▼──┐
│Tier4A    │    │Tier4B/4C       │
│PostgreSQL│    │Redis, Neo4j    │
└──────────┘    └────────────────┘
```

## Prerequisites

- Docker & Docker Compose installed
- 4GB+ RAM available
- 10GB+ disk space
- Port 80, 443, 8080, 3000, 8000, 7070 available

## Quick Start

### 1. Clone/Update Project
```bash
cd /root
# Your project structure already exists
```

### 2. Copy Migration Files
The following files have been created:
- `docker-compose.prod.yml` - 5-tier orchestration
- `Dockerfile.gateway` - Tier 2 Gateway
- `Dockerfile.main` - Tier 3A Main Service
- `Dockerfile.svg` - Tier 3C SVG Engine
- `nginx-tier1.conf` - Tier 1 Nginx config
- `gateway-5tier.js` - Updated gateway with routing
- `migrations/01-init.sql` - Database schema
- `.env.example` - Environment template
- `.dockerignore` - Build optimization

### 3. Configure Environment
```bash
# Copy example to production
cp .env.example .env

# Edit with your secrets
nano .env
```

**Critical env vars to set:**
- `DB_PASS` - PostgreSQL password
- `REDIS_PASS` - Redis password
- `JWT_SECRET` - JWT signing key
- `SUPABASE_URL` / `SUPABASE_KEY` (optional, leave blank for offline)

### 4. Generate SSL Certificates
```bash
mkdir -p certs
openssl req -x509 -newkey rsa:4096 \
  -keyout certs/server.key \
  -out certs/server.crt \
  -days 365 -nodes \
  -subj "/CN=localhost"
```

### 5. Build & Start
```bash
# Build all images
docker compose -f docker-compose.prod.yml build

# Start all services
docker compose -f docker-compose.prod.yml up -d

# Monitor logs
docker compose -f docker-compose.prod.yml logs -f
```

### 6. Verify Services
```bash
# Check status
docker compose -f docker-compose.prod.yml ps

# Test connectivity
curl -k https://localhost/health
curl http://localhost:8080/health
curl http://localhost:3000/health
curl http://localhost:8000/health
```

## Service Endpoints

| Tier | Service | Port | URL | Purpose |
|------|---------|------|-----|---------|
| 1 | Nginx | 443 | https://localhost | Reverse proxy, TLS |
| 2 | Gateway | 8080 | http://localhost:8080 | Auth, routing, SSE |
| 3A | Main | 3000 | http://localhost:3000 | Core logic, economy |
| 3B | Brain | 8000 | http://localhost:8000 | AI processing |
| 3C | SVG | 7070 | http://localhost:7070 | Visualization |
| 4A | PostgreSQL | 5432 | localhost:5432 | Persistence |
| 4B | Redis | 6379 | localhost:6379 | Cache, sessions |
| 4C | Neo4j | 7474 | http://localhost:7474 | Knowledge graph |

## Configuration Examples

### Update Gateway Routing (gateway-5tier.js)
Replace your `gateway.js` with:
```bash
cp gateway-5tier.js gateway.js
```

Then update `Dockerfile.gateway` to use `gateway.js`.

### Test Individual Services
```bash
# Main service
docker exec bridge-main-tier3a curl http://localhost:3000/health

# Brain service
docker exec bridge-brain-tier3b curl http://localhost:8000/health

# Gateway
docker exec bridge-gateway-tier2 curl http://localhost:8080/health
```

### Access Database
```bash
docker exec -it bridge-postgres psql -U bridge -d bridge_ai
```

### Monitor Logs
```bash
# All services
docker compose -f docker-compose.prod.yml logs -f

# Specific service
docker compose -f docker-compose.prod.yml logs -f gateway

# Follow errors only
docker compose -f docker-compose.prod.yml logs -f | grep -i error
```

## Production Deployment

### On Your VPS

#### 1. Backup Current State
```bash
# Backup current server.js setup
pm2 save
pm2 stop server.js
tar -czf bridgeai-backup-$(date +%s).tar.gz /root
```

#### 2. Deploy Docker Stack
```bash
cd /root

# Pull latest code (if using git)
git pull origin main || true

# Build & start
docker compose -f docker-compose.prod.yml build --no-cache
docker compose -f docker-compose.prod.yml up -d

# Set to start on boot
docker compose -f docker-compose.prod.yml config > /etc/docker-compose.prod.yml
echo 'docker compose -f /etc/docker-compose.prod.yml up -d' >> /etc/rc.local
```

#### 3. Update Nginx (Tier 1) Routes
Your Cloudflare DNS should point to Nginx on :443.

From `docker-compose.prod.yml`, Nginx will:
- Listen on 80/443
- Proxy to Gateway :8080
- Route `/api/*` to Main Service :3000
- Route `/brain/*` to Brain Service :8000
- Route `/svg/*` to SVG Engine :7070

#### 4. Health Monitoring
```bash
# Create a monitoring script
cat > /root/health-check-5tier.sh << 'EOF'
#!/bin/bash
docker compose -f docker-compose.prod.yml exec -T nginx curl -f http://localhost/health || echo "Nginx DOWN"
docker compose -f docker-compose.prod.yml exec -T gateway curl -f http://localhost:8080/health || echo "Gateway DOWN"
docker compose -f docker-compose.prod.yml exec -T main-service curl -f http://localhost:3000/health || echo "Main DOWN"
docker compose -f docker-compose.prod.yml exec -T brain curl -f http://localhost:8000/health || echo "Brain DOWN"
EOF
chmod +x /root/health-check-5tier.sh

# Run via cron (every 5 minutes)
echo "*/5 * * * * /root/health-check-5tier.sh" | crontab -
```

## Troubleshooting

### Service won't start
```bash
# Check logs
docker compose -f docker-compose.prod.yml logs gateway

# Rebuild
docker compose -f docker-compose.prod.yml build --no-cache gateway
docker compose -f docker-compose.prod.yml up -d gateway
```

### Port conflicts
```bash
# Check open ports
netstat -tulnp | grep LISTEN

# Stop conflicting service
docker stop <container-name>
```

### Database connection issues
```bash
# Test PostgreSQL
docker exec -it bridge-postgres psql -U bridge -c "SELECT 1"

# Reinitialize
docker volume rm bridge_prod_db
docker compose -f docker-compose.prod.yml up -d postgres
```

### Memory issues
```bash
# Monitor resource usage
docker stats

# Increase Docker memory limit (if needed)
# Edit Docker Desktop settings or daemon.json
```

## Rollback to Monolithic (if needed)

```bash
# Stop Docker stack
docker compose -f docker-compose.prod.yml down

# Restore PM2 setup
pm2 resurrect
pm2 start server.js

# Or manual restart
nohup node server.js > server.log 2>&1 &
```

## Next Steps

1. **SSL Certificates**: Install proper certificates (Let's Encrypt via Certbot)
2. **Monitoring**: Set up Prometheus + Grafana for metrics
3. **Logging**: Configure centralized logging (ELK stack)
4. **Backup Strategy**: Automate PostgreSQL backups to cloud storage
5. **CI/CD**: Add GitHub Actions or GitLab CI for automated deployments
6. **Performance**: Profile and optimize each service tier individually
