# Fix the deployment issues and complete setup

# First, create the .env file properly
mkdir -p /var/www/bridgeai
cd /var/www/bridgeai

# Create .env file
cat > .env << 'EOF'
# ============================================================================
# THE BRIDGE AI OS - Production Environment Configuration
# ============================================================================
# VPS Deployment - Update API keys below
# ============================================================================

# --- Core Application Settings -----------------------------------------------
NODE_ENV=production
PORT=80
PROMPT_ENGINE_MODE=live

# Domain Configuration (update to your actual domain)
DOMAIN=bridgeaios.com
SSL_ENABLED=true

# --- Core HTTP Gate (Admin & Settings) ---------------------------------------
ORCHESTRA_ADMIN_TOKEN=97YBKPuj5wtzHEkmbiOyQTWJLRh4Nofe6pMFS8rUVGvAsxcD2la0ZXd1qgCIn3
ORCHESTRA_RATE_LIMIT=60
ORCHESTRA_ALLOW_IFRAME=0

# --- Config Advisor Service -------------------------------------------------
ADVISOR_SHARED_SECRET=9bc38cf3f01df7177dc5639ea20878bb56d2c72ba91cb28a057d64f9385314b4
ADVISOR_PORT=4721
ADVISOR_PROVIDER=auto

# --- AI Provider Configuration ----------------------------------------------

# Anthropic (REQUIRED - Add your key here)
ANTHROPIC_API_KEY=YOUR_ANTHROPIC_API_KEY_HERE
ANTHROPIC_MODEL=claude-haiku-4-5-20251001

# OpenAI (optional fallback)
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini

# OpenAI-Compatible Gateway (optional)
OPENAI_COMPAT_API_KEY=
OPENAI_COMPAT_BASE_URL=
OPENAI_COMPAT_MODEL=

# --- MCP Configuration ------------------------------------------------------
MCP_WPCOM_URL=https://public-api.wordpress.com/wpcom/v2/mcp/v1
MCP_TIMEOUT=30000

# --- Logging Configuration --------------------------------------------------
LOG_LEVEL=warn
LOG_MAX_SIZE=10m
LOG_MAX_FILES=5

# --- Security Configuration -------------------------------------------------
CORS_ORIGINS=https://bridgeaios.com,https://www.bridgeaios.com
RATE_LIMIT_WINDOW=15
RATE_LIMIT_MAX_REQUESTS=100

# --- Performance Configuration ---------------------------------------------
CACHE_ENABLED=true
CACHE_TTL=3600
COMPRESSION_ENABLED=true

# --- Monitoring Configuration ----------------------------------------------
HEALTH_CHECK_INTERVAL=30000
METRICS_ENABLED=true

# --- Database Configuration -------------------------------------------------
DATABASE_URL=postgresql://bridge_user:secure_password_123@localhost:5432/bridge_ai_os
REDIS_URL=redis://localhost:6379

# --- Email Configuration ----------------------------------------------------
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# --- Analytics Configuration ------------------------------------------------
GA_TRACKING_ID=GA-XXXXXXXXXX
MIXPANEL_TOKEN=your-mixpanel-token

# ============================================================================
EOF

# Set proper permissions
chmod 600 .env

echo "✅ Environment file created!"