# ── Stage 1: Build ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies for native modules (better-sqlite3, node-pty)
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    bash \
    git

# Copy manifests only (leveraging Docker layer cache)
COPY package*.json ./
COPY svg-engine/package*.json ./svg-engine/

# Install ALL dependencies (including dev deps needed for build)
RUN npm ci && \
    cd svg-engine && npm ci && cd ..

# Copy source code
COPY . .

# Build any native modules that need compilation
RUN npm rebuild better-sqlite3 && \
    npm rebuild node-pty

# ── Stage 2: Production Runtime ───────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

# Runtime dependencies for native modules
RUN apk add --no-cache \
    bash \
    git \
    openssl \
    ca-certificates \
    tzdata \
    && addgroup -S bridge && adduser -S -G bridge bridge

# Copy installed node_modules from builder
COPY --from=builder --chown=bridge:bridge /app/node_modules ./node_modules
COPY --from=builder --chown=bridge:bridge /app/svg-engine/node_modules ./svg-engine/node_modules

# Copy application code (EXCLUDE: .env, logs, node_modules, certs — .dockerignore handles this)
COPY --from=builder --chown=bridge:bridge /app/ ./

# Create directories for persistent volumes (data, logs, shared)
RUN mkdir -p /data /logs /shared && chown bridge:bridge /data /logs /shared

# Switch to non-root user
USER bridge

# Expose all service ports
# 3000  → Main API (unified-server)
# 8080  → Gateway (bridge-gateway)
# 8000  → Brain (super-brain)
# 5001  → Auth service
# 5002  → Terminal proxy
# 3001  → GOD MODE monitor (system.js)
# 8001  → BAN engine (Python/FastAPI) — separate container usually
# 7070  → SVG Engine
EXPOSE 3000 8080 8000 5001 5002 3001 7070

# Health check — main API responds to /health
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', r => { if (r.statusCode < 400) process.exit(0); else process.exit(1) })" || exit 1

# Default: start all processes via PM2 (ecosystem.config.js)
# In Docker Compose we override CMD per service to run individual processes
CMD ["npm", "run", "pm2:prod"]
