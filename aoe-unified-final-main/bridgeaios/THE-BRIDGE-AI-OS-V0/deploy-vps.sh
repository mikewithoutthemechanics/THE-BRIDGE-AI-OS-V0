#!/bin/bash
# THE BRIDGE AI OS - Production Deployment Script
# This script sets up and deploys the homepage server on a VPS

set -e

echo "🌉 THE BRIDGE AI OS - Production Deployment"
echo "═══════════════════════════════════════════════"

# Configuration
APP_NAME="the-bridge-ai-os"
APP_DIR="/opt/$APP_NAME"
SERVICE_NAME="$APP_NAME.service"
DOMAIN="${DOMAIN:-bridgeaios.com}"
EMAIL="${EMAIL:-admin@bridgeaios.com}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   print_error "This script should not be run as root"
   exit 1
fi

# Update system packages
print_status "Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install Node.js 18+ if not present
if ! command -v node &> /dev/null; then
    print_status "Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# Install PM2 for process management
if ! command -v pm2 &> /dev/null; then
    print_status "Installing PM2..."
    sudo npm install -g pm2
fi

# Install Nginx if not present
if ! command -v nginx &> /dev/null; then
    print_status "Installing Nginx..."
    sudo apt install -y nginx
fi

# Create application directory
print_status "Creating application directory..."
sudo mkdir -p $APP_DIR
sudo chown $USER:$USER $APP_DIR

# Copy application files
print_status "Copying application files..."
cp -r . $APP_DIR/
cd $APP_DIR

# Install dependencies
print_status "Installing Node.js dependencies..."
npm ci --production

# Create environment file
print_status "Creating environment configuration..."
cat > .env << EOF
NODE_ENV=production
PORT=3000
DOMAIN=$DOMAIN
MCP_WPCOM_URL=https://public-api.wordpress.com/wpcom/v2/mcp/v1
LOG_LEVEL=info
EOF

# Create PM2 ecosystem file
print_status "Creating PM2 ecosystem configuration..."
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: '$APP_NAME',
    script: 'server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true
  }]
};
EOF

# Create logs directory
mkdir -p logs

# Configure Nginx
print_status "Configuring Nginx..."
sudo tee /etc/nginx/sites-available/$APP_NAME > /dev/null << EOF
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied expired no-cache no-store private must-revalidate auth;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml+rss;

    # Static files
    location /static/ {
        alias $APP_DIR/public/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # API routes
    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    # Main application
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;

        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    # Health check endpoint
    location /health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }
}
EOF

# Enable site
sudo ln -sf /etc/nginx/sites-available/$APP_NAME /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Test Nginx configuration
print_status "Testing Nginx configuration..."
sudo nginx -t

# Reload Nginx
print_status "Reloading Nginx..."
sudo systemctl reload nginx

# Start application with PM2
print_status "Starting application with PM2..."
pm2 start ecosystem.config.js
pm2 save
pm2 startup
pm2 install pm2-logrotate

# Configure log rotation
print_status "Configuring log rotation..."
sudo tee /etc/logrotate.d/$APP_NAME > /dev/null << EOF
$APP_DIR/logs/*.log {
    daily
    missingok
    rotate 52
    compress
    delaycompress
    notifempty
    create 644 $USER $USER
    postrotate
        pm2 reloadLogs
    endscript
}
EOF

# Setup SSL with Let's Encrypt (optional)
if command -v certbot &> /dev/null; then
    print_status "Setting up SSL certificate..."
    sudo apt install -y certbot python3-certbot-nginx
    sudo certbot --nginx -d $DOMAIN -d www.$DOMAIN --email $EMAIL --agree-tos --non-interactive
fi

# Create backup script
print_status "Creating backup script..."
cat > backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/opt/bridge-backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="bridge_backup_$TIMESTAMP"

mkdir -p $BACKUP_DIR

# Backup application files
tar -czf $BACKUP_DIR/${BACKUP_NAME}_app.tar.gz -C /opt the-bridge-ai-os

# Backup logs
tar -czf $BACKUP_DIR/${BACKUP_NAME}_logs.tar.gz -C /opt/the-bridge-ai-os logs

# Backup database if exists
# Add database backup commands here

# Cleanup old backups (keep last 7 days)
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete

echo "Backup completed: $BACKUP_NAME"
EOF

chmod +x backup.sh

# Setup daily backup cron job
print_status "Setting up automated backups..."
(crontab -l ; echo "0 2 * * * $APP_DIR/backup.sh") | crontab -

# Create monitoring script
print_status "Creating monitoring script..."
cat > monitor.sh << 'EOF'
#!/bin/bash
APP_NAME="the-bridge-ai-os"
LOG_FILE="/opt/$APP_NAME/logs/monitor.log"

# Check if application is running
if pm2 describe $APP_NAME > /dev/null 2>&1; then
    echo "$(date): ✅ Application is running" >> $LOG_FILE
else
    echo "$(date): ❌ Application is not running - restarting..." >> $LOG_FILE
    pm2 start $APP_NAME
fi

# Check Nginx
if sudo systemctl is-active --quiet nginx; then
    echo "$(date): ✅ Nginx is running" >> $LOG_FILE
else
    echo "$(date): ❌ Nginx is not running - restarting..." >> $LOG_FILE
    sudo systemctl restart nginx
fi

# Check disk space
DISK_USAGE=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')
if [ $DISK_USAGE -gt 90 ]; then
    echo "$(date): ⚠️  Disk usage is ${DISK_USAGE}% - cleanup needed" >> $LOG_FILE
fi

# Check memory usage
MEMORY_USAGE=$(free | grep Mem | awk '{printf "%.0f", $3/$2 * 100.0}')
if [ $MEMORY_USAGE -gt 90 ]; then
    echo "$(date): ⚠️  Memory usage is ${MEMORY_USAGE}% - restart recommended" >> $LOG_FILE
fi
EOF

chmod +x monitor.sh

# Setup monitoring cron job (every 5 minutes)
print_status "Setting up monitoring..."
(crontab -l ; echo "*/5 * * * * $APP_DIR/monitor.sh") | crontab -

# Create update script
print_status "Creating update script..."
cat > update.sh << 'EOF'
#!/bin/bash
APP_DIR="/opt/the-bridge-ai-os"
BACKUP_DIR="/opt/bridge-backups"

echo "🔄 Updating THE BRIDGE AI OS..."

# Create backup
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
tar -czf $BACKUP_DIR/pre_update_$TIMESTAMP.tar.gz -C /opt the-bridge-ai-os

# Pull latest changes (assuming git repo)
cd $APP_DIR
if [ -d .git ]; then
    git pull origin main
else
    echo "⚠️  Not a git repository - manual update required"
    exit 1
fi

# Install new dependencies
npm ci --production

# Restart application
pm2 restart the-bridge-ai-os

# Run health check
sleep 10
if curl -f http://localhost:3000/api/health > /dev/null; then
    echo "✅ Update successful"
else
    echo "❌ Update failed - check logs"
    exit 1
fi
EOF

chmod +x update.sh

print_success "Deployment completed successfully!"
echo ""
echo "🌉 THE BRIDGE AI OS is now running at:"
echo "   • http://$DOMAIN"
echo "   • https://$DOMAIN (if SSL enabled)"
echo ""
echo "📊 Monitoring:"
echo "   • PM2: pm2 status"
echo "   • Logs: tail -f $APP_DIR/logs/*.log"
echo "   • Nginx: sudo systemctl status nginx"
echo ""
echo "🔄 Management:"
echo "   • Restart: pm2 restart $APP_NAME"
echo "   • Update: $APP_DIR/update.sh"
echo "   • Backup: $APP_DIR/backup.sh"
echo ""
echo "📈 Monitoring logs: tail -f $APP_DIR/logs/monitor.log"
echo ""
echo "🎉 Deployment complete! Your AI OS is live on the VPS!"