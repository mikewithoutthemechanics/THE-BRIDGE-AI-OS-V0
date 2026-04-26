#!/bin/bash
# BridgeAI OS v3 - VPS Deployment Script
# Deploys the complete system to a remote VPS

set -e

# Configuration
VPS_HOST=${VPS_HOST:-""}
VPS_USER=${VPS_USER:-"root"}
DEPLOY_PATH="/opt/bridge-ai-os"
DOMAIN=${DOMAIN:-""}

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Check prerequisites
check_prerequisites() {
    echo -e "${BLUE}🔍 Checking Prerequisites${NC}"
    echo -e "${BLUE}=========================${NC}"

    if [ -z "$VPS_HOST" ]; then
        echo -e "${RED}❌ Error: VPS_HOST not set. Use export VPS_HOST=your-vps-ip${NC}"
        exit 1
    fi

    if [ -z "$DOMAIN" ]; then
        echo -e "${YELLOW}⚠️  Warning: DOMAIN not set. SSL will not be configured.${NC}"
        echo -e "${YELLOW}   Set with: export DOMAIN=yourdomain.com${NC}"
    fi

    # Check if SSH key exists
    if [ ! -f ~/.ssh/id_rsa ]; then
        echo -e "${YELLOW}⚠️  No SSH key found. Generating one...${NC}"
        ssh-keygen -t rsa -b 4096 -f ~/.ssh/id_rsa -N ""
    fi

    echo -e "${GREEN}✅ Prerequisites check complete${NC}"
}

# Setup SSH access
setup_ssh_access() {
    echo -e "${BLUE}🔐 Setting up SSH Access${NC}"
    echo -e "${BLUE}=======================${NC}"

    echo -e "${YELLOW}Copying SSH key to VPS...${NC}"
    ssh-copy-id -o StrictHostKeyChecking=no ${VPS_USER}@${VPS_HOST}

    echo -e "${GREEN}✅ SSH access configured${NC}"
}

# Install Docker on VPS
install_docker() {
    echo -e "${BLUE}🐳 Installing Docker${NC}"
    echo -e "${BLUE}===================${NC}"

    ssh ${VPS_USER}@${VPS_HOST} << 'EOF'
    # Update system
    apt update && apt upgrade -y

    # Install prerequisites
    apt install -y apt-transport-https ca-certificates curl gnupg lsb-release

    # Add Docker GPG key
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

    # Add Docker repository
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

    # Install Docker
    apt update
    apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

    # Start and enable Docker
    systemctl start docker
    systemctl enable docker

    # Install docker-compose v2
    curl -L "https://github.com/docker/compose/releases/download/v2.24.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose

    echo "Docker installation complete"
EOF

    echo -e "${GREEN}✅ Docker installed on VPS${NC}"
}

# Deploy BridgeAI OS
deploy_bridgeai() {
    echo -e "${BLUE}🚀 Deploying BridgeAI OS v3${NC}"
    echo -e "${BLUE}===========================${NC}"

    # Create deployment directory
    ssh ${VPS_USER}@${VPS_HOST} "mkdir -p ${DEPLOY_PATH}"

    # Copy deployment files
    echo -e "${YELLOW}Copying deployment files...${NC}"
    scp docker-compose.v3.yml ${VPS_USER}@${VPS_HOST}:${DEPLOY_PATH}/
    scp .env ${VPS_USER}@${VPS_HOST}:${DEPLOY_PATH}/
    scp bridge-ai-deploy.sh ${VPS_USER}@${VPS_HOST}:${DEPLOY_PATH}/
    scp quick-test.sh ${VPS_USER}@${VPS_HOST}:${DEPLOY_PATH}/

    # Copy service directories
    echo -e "${YELLOW}Copying service configurations...${NC}"
    scp -r services ${VPS_USER}@${VPS_HOST}:${DEPLOY_PATH}/

    # Deploy on VPS
    ssh ${VPS_USER}@${VPS_HOST} << EOF
    cd ${DEPLOY_PATH}

    # Make scripts executable
    chmod +x bridge-ai-deploy.sh quick-test.sh

    # Update environment for production
    sed -i 's/bridge_password_2026/$(openssl rand -hex 16)/g' .env
    sed -i 's/bridge_jwt_secret_.*$/bridge_jwt_secret_$(openssl rand -hex 32)/g' .env

    # Start the system
    echo "Starting BridgeAI OS v3..."
    ./bridge-ai-deploy.sh
EOF

    echo -e "${GREEN}✅ BridgeAI OS deployed${NC}"
}

# Setup reverse proxy
setup_reverse_proxy() {
    echo -e "${BLUE}🌐 Setting up Reverse Proxy${NC}"
    echo -e "${BLUE}===========================${NC}"

    if [ -z "$DOMAIN" ]; then
        echo -e "${YELLOW}⚠️  Skipping reverse proxy setup (no domain configured)${NC}"
        return
    fi

    ssh ${VPS_USER}@${VPS_HOST} << EOF
    # Install Caddy
    apt install -y debian-keyring debian-archive-keyring apt-transport-https
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
    apt update
    apt install -y caddy

    # Create Caddyfile
    cat > /etc/caddy/Caddyfile << CADDYEOF
${DOMAIN} {
    # Admin Dashboard
    route /admin* {
        reverse_proxy localhost:3100
    }

    # API Gateway
    route /api* {
        reverse_proxy localhost:3300
    }

    # System Map
    route /map* {
        reverse_proxy localhost:3600
    }

    # Telephony WebRTC
    route /webrtc* {
        reverse_proxy localhost:8089
    }

    # Static files and SPA fallback
    try_files {path} {path}/ /index.html
    root * /var/www/html
    file_server
}

# Health check endpoint
health.${DOMAIN} {
    respond "OK" 200
}
CADDYEOF

    # Enable and start Caddy
    systemctl enable caddy
    systemctl restart caddy

    echo "Reverse proxy configured for ${DOMAIN}"
EOF

    echo -e "${GREEN}✅ Reverse proxy configured${NC}"
}

# Setup SSL certificates
setup_ssl() {
    echo -e "${BLUE}🔒 Setting up SSL Certificates${NC}"
    echo -e "${BLUE}==============================${NC}"

    if [ -z "$DOMAIN" ]; then
        echo -e "${YELLOW}⚠️  Skipping SSL setup (no domain configured)${NC}"
        return
    fi

    ssh ${VPS_USER}@${VPS_HOST} << EOF
    # Install certbot
    apt install -y certbot python3-certbot-nginx

    # Get SSL certificate
    certbot --nginx -d ${DOMAIN} -d health.${DOMAIN} --non-interactive --agree-tos --email admin@${DOMAIN}

    # Setup auto-renewal
    systemctl enable certbot.timer
    systemctl start certbot.timer

    echo "SSL certificates configured"
EOF

    echo -e "${GREEN}✅ SSL certificates configured${NC}"
}

# Setup monitoring
setup_monitoring() {
    echo -e "${BLUE}📊 Setting up Monitoring${NC}"
    echo -e "${BLUE}=======================${NC}"

    ssh ${VPS_USER}@${VPS_HOST} << EOF
    cd ${DEPLOY_PATH}

    # Install monitoring tools
    apt install -y htop iotop sysstat

    # Setup log rotation
    cat > /etc/logrotate.d/bridge-ai << LOGROTATE_EOF
/var/log/bridge-ai/*.log {
    daily
    missingok
    rotate 52
    compress
    delaycompress
    notifempty
    create 644 root root
    postrotate
        docker-compose -f ${DEPLOY_PATH}/docker-compose.v3.yml logs --no-color > /var/log/bridge-ai/combined.log 2>&1 || true
    endscript
}
LOGROTATE_EOF

    # Create log directory
    mkdir -p /var/log/bridge-ai

    # Setup automated backups
    cat > /etc/cron.daily/bridge-ai-backup << BACKUP_EOF
#!/bin/bash
BACKUP_DIR="/opt/bridge-ai-backups"
DATE=\$(date +%Y%m%d_%H%M%S)

mkdir -p \$BACKUP_DIR

# Backup database
docker exec bridge-v3-postgres pg_dump -U bridge bridge_ai > \$BACKUP_DIR/postgres_\$DATE.sql

# Backup configs
cp -r ${DEPLOY_PATH} \$BACKUP_DIR/config_\$DATE/

# Cleanup old backups (keep last 7 days)
find \$BACKUP_DIR -name "postgres_*" -mtime +7 -delete
find \$BACKUP_DIR -name "config_*" -mtime +7 -delete
BACKUP_EOF

    chmod +x /etc/cron.daily/bridge-ai-backup

    echo "Monitoring and backup system configured"
EOF

    echo -e "${GREEN}✅ Monitoring configured${NC}"
}

# Setup firewall
setup_firewall() {
    echo -e "${BLUE}🔥 Setting up Firewall${NC}"
    echo -e "${BLUE}=====================${NC}"

    ssh ${VPS_USER}@${VPS_HOST} << EOF
    # Install ufw
    apt install -y ufw

    # Reset firewall
    ufw --force reset

    # Allow SSH
    ufw allow ssh

    # Allow HTTP and HTTPS
    ufw allow 80
    ufw allow 443

    # Allow BridgeAI ports (for direct access if needed)
    ufw allow 8080
    ufw allow 3100
    ufw allow 3200
    ufw allow 3300
    ufw allow 3400
    ufw allow 3500
    ufw allow 3600

    # Enable firewall
    echo "y" | ufw enable

    echo "Firewall configured"
EOF

    echo -e "${GREEN}✅ Firewall configured${NC}"
}

# Final verification
verify_deployment() {
    echo -e "${BLUE}✅ Verifying Deployment${NC}"
    echo -e "${BLUE}=======================${NC}"

    echo -e "${YELLOW}Testing services on VPS...${NC}"

    # Test services
    ssh ${VPS_USER}@${VPS_HOST} << EOF
    cd ${DEPLOY_PATH}
    ./quick-test.sh
EOF

    # Test external access
    if [ -n "$DOMAIN" ]; then
        echo -e "${YELLOW}Testing external access...${NC}"
        if curl -s -I https://${DOMAIN}/health | grep -q "200 OK"; then
            echo -e "${GREEN}✅ External access working${NC}"
        else
            echo -e "${YELLOW}⚠️  External access may not be ready yet${NC}"
        fi
    fi

    echo -e "${GREEN}✅ Deployment verification complete${NC}"
}

# Main deployment
main() {
    echo -e "${BLUE}🚀 BridgeAI OS v3 - VPS Deployment${NC}"
    echo -e "${BLUE}==================================${NC}"
    echo "VPS Host: ${VPS_HOST}"
    echo "Domain: ${DOMAIN:-Not configured}"
    echo ""

    check_prerequisites
    setup_ssh_access
    install_docker
    deploy_bridgeai
    setup_reverse_proxy
    setup_ssl
    setup_monitoring
    setup_firewall
    verify_deployment

    echo ""
    echo -e "${GREEN}🎉 BRIDGEAI OS V3 SUCCESSFULLY DEPLOYED TO VPS!${NC}"
    echo ""
    echo -e "${BLUE}🌐 Access Points:${NC}"
    [ -n "$DOMAIN" ] && echo "• Main Site: https://${DOMAIN}"
    [ -n "$DOMAIN" ] && echo "• Admin Dashboard: https://${DOMAIN}/admin"
    [ -n "$DOMAIN" ] && echo "• System Map: https://${DOMAIN}/map"
    echo "• Direct Gateway: http://${VPS_HOST}:3300"
    echo "• Health Check: http://${VPS_HOST}:8080/health"
    echo ""
    echo -e "${BLUE}🔧 Management:${NC}"
    echo "• SSH Access: ssh ${VPS_USER}@${VPS_HOST}"
    echo "• System Path: ${DEPLOY_PATH}"
    echo "• Logs: ssh ${VPS_USER}@${VPS_HOST} 'cd ${DEPLOY_PATH} && docker-compose -f docker-compose.v3.yml logs -f'"
    echo "• Restart: ssh ${VPS_USER}@${VPS_HOST} 'cd ${DEPLOY_PATH} && docker-compose -f docker-compose.v3.yml restart'"
}

# Run main deployment
main "$@"