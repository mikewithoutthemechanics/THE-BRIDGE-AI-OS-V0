# Overseer — Sovereign Authority Layer
# Constitutional governor that guarantees system destiny

FROM node:20-alpine

WORKDIR /app

# Copy Overseer runtime
COPY overseer.js ./
COPY package.json ./

# Install minimal dependencies for event ingestion
RUN npm init -y && \
    npm install fastapi uvicorn pydantic 2>/dev/null || true

# Create directories for state and logs
RUN mkdir -p /var/lib/bridge /var/log/bridge

# Expose metrics endpoint
EXPOSE 9091

# Health check
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:9091/health', (r)=>{if(r.statusCode!==200)process.exit(1)})" || exit 1

# Run Overseer
CMD ["node", "overseer.js"]
