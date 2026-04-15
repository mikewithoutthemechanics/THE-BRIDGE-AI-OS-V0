# BridgeAI OS v3 - VPS Deployment Guide

## 🚀 Complete VPS Deployment for BridgeAI OS v3

This guide deploys your fully operational BridgeAI OS v3 distributed AI system to a remote VPS.

## 📋 Prerequisites

### VPS Requirements
- Ubuntu 20.04+ or Debian 11+
- 4GB RAM minimum (8GB recommended)
- 2 CPU cores minimum (4 recommended)
- 20GB storage minimum
- Root or sudo access

### Local Requirements
- SSH client
- Docker and docker-compose (for building images)
- BridgeAI OS v3 source code

## 🔧 Quick Start Deployment

### 1. Configure Environment

```bash
# Set your VPS details
export VPS_HOST=your-vps-ip-or-domain
export VPS_USER=root  # or your sudo user
export DOMAIN=yourdomain.com  # optional, for SSL

# Example:
export VPS_HOST=192.168.1.100
export DOMAIN=bridge-ai-os.com
```

### 2. Run Automated Deployment

```bash
# Make deployment script executable
chmod +x deploy-to-vps.sh

# Run deployment
./deploy-to-vps.sh
```

That's it! The script will:
- ✅ Setup SSH access to your VPS
- ✅ Install Docker and docker-compose
- ✅ Deploy all BridgeAI OS services
- ✅ Configure reverse proxy (if domain provided)
- ✅ Setup SSL certificates (if domain provided)
- ✅ Configure monitoring and backups
- ✅ Setup firewall security

## 🌐 Access Your Deployed System

After deployment, access your BridgeAI OS v3 at:

### With Domain (Recommended)
- **Main Site**: https://yourdomain.com
- **Admin Dashboard**: https://yourdomain.com/admin
- **System Map**: https://yourdomain.com/map
- **Health Check**: https://health.yourdomain.com

### Direct Access (Without Domain)
- **Admin Dashboard**: http://your-vps-ip:3100
- **Gateway API**: http://your-vps-ip:3300
- **System Map**: http://your-vps-ip:3600
- **Telephony**: http://your-vps-ip:3500
- **Config Service**: http://your-vps-ip:8080

## 🔧 Manual Deployment Steps

If you prefer manual control, follow these steps:

### Step 1: Prepare VPS

```bash
# Connect to your VPS
ssh root@your-vps-ip

# Update system
apt update && apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Install docker-compose
curl -L "https://github.com/docker/compose/releases/download/v2.24.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose
```

### Step 2: Deploy BridgeAI OS

```bash
# Create deployment directory
mkdir -p /opt/bridge-ai-os
cd /opt/bridge-ai-os

# Copy deployment files from your local machine
# (Use scp or your preferred method)
scp user@local-machine:/path/to/bridge-ai-os/docker-compose.v3.yml .
scp user@local-machine:/path/to/bridge-ai-os/.env .
scp -r user@local-machine:/path/to/bridge-ai-os/services .

# Update environment variables for production
nano .env  # Edit with production values

# Start the system
docker-compose -f docker-compose.v3.yml up -d
```

### Step 3: Setup Reverse Proxy (Optional)

```bash
# Install Caddy
apt install -y caddy

# Create Caddyfile
cat > /etc/caddy/Caddyfile << EOF
yourdomain.com {
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

    # SPA fallback
    try_files {path} {path}/ /index.html
    root * /var/www/html
    file_server
}
EOF

# Restart Caddy
systemctl restart caddy
```

### Step 4: Setup SSL (Optional)

```bash
# Install certbot
apt install -y certbot python3-certbot-nginx

# Get SSL certificate
certbot --nginx -d yourdomain.com --non-interactive --agree-tos --email admin@yourdomain.com
```

## 📊 System Architecture

Your deployed BridgeAI OS v3 includes:

```
🌐 Reverse Proxy (Caddy/Nginx)
    ↓
🧬 BridgeAI OS Services
├── 🧠 Config Service (8080) - Self-healing configuration
├── 👁️ Admin API (3100) - Dashboard backend
├── 💰 Treasury (3200) - Billing & wallets
├── 🌐 Gateway (3300) - Main API entry point
├── 🧠 Super Brain (3400) - AI processing
├── 📞 Telephony (3500) - Voice AI
└── 📊 SVG Engine (3600) - System visualization

📦 Infrastructure
├── 🐘 PostgreSQL (5433) - Database
└── 🔴 Redis (6380) - Cache & messaging
```

## 🔒 Security Configuration

The deployment includes:

- **Firewall**: UFW with minimal open ports
- **SSL/TLS**: Automatic certificates via Let's Encrypt
- **Access Control**: Key-based SSH authentication
- **Container Security**: Docker security best practices

## 📈 Monitoring & Maintenance

### Health Checks
```bash
# Check all services
curl http://localhost:8080/health  # Config
curl http://localhost:3100/health  # Admin API
curl http://localhost:3300/health  # Gateway
```

### View Logs
```bash
# All service logs
docker-compose -f /opt/bridge-ai-os/docker-compose.v3.yml logs -f

# Specific service logs
docker-compose -f /opt/bridge-ai-os/docker-compose.v3.yml logs -f treasury
```

### System Management
```bash
# Restart services
docker-compose -f /opt/bridge-ai-os/docker-compose.v3.yml restart

# Update services
docker-compose -f /opt/bridge-ai-os/docker-compose.v3.yml pull
docker-compose -f /opt/bridge-ai-os/docker-compose.v3.yml up -d

# Backup database
docker exec bridge-v3-postgres pg_dump -U bridge bridge_ai > backup.sql
```

## 🚨 Troubleshooting

### Common Issues

**Services not starting:**
```bash
# Check service status
docker-compose -f /opt/bridge-ai-os/docker-compose.v3.yml ps

# Check service logs
docker-compose -f /opt/bridge-ai-os/docker-compose.v3.yml logs [service-name]
```

**Port conflicts:**
```bash
# Check what's using ports
netstat -tlnp | grep :[port]

# Change ports in docker-compose.v3.yml if needed
```

**SSL certificate issues:**
```bash
# Renew certificates
certbot renew

# Check certificate status
certbot certificates
```

## 🔄 Updates & Scaling

### Update BridgeAI OS
```bash
cd /opt/bridge-ai-os
git pull  # If using git
docker-compose -f docker-compose.v3.yml pull
docker-compose -f docker-compose.v3.yml up -d
```

### Scale Services
```bash
# Scale a service
docker-compose -f docker-compose.v3.yml up -d --scale super-brain=3

# Check scaling status
docker-compose -f docker-compose.v3.yml ps
```

## 📞 Support

For issues with BridgeAI OS v3 deployment:

1. Check the logs: `docker-compose logs -f`
2. Verify network connectivity: `curl localhost:[port]/health`
3. Check system resources: `htop` or `docker stats`
4. Review firewall rules: `ufw status`

## 🎯 Production Checklist

- [ ] Domain configured and DNS pointing to VPS
- [ ] SSL certificates active
- [ ] Firewall properly configured
- [ ] Monitoring alerts set up
- [ ] Automated backups configured
- [ ] Log rotation enabled
- [ ] Security updates automated

---

**🎉 Your BridgeAI OS v3 is now live on your VPS!**

Access your distributed AI operating system at: **https://yourdomain.com**

The system will autonomously heal itself, route calls intelligently, manage billing, and visualize its operations in real-time.