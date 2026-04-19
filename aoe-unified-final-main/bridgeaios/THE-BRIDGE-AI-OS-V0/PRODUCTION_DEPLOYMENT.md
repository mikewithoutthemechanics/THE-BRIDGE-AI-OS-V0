# THE BRIDGE AI OS - Production Deployment Guide

## 🚀 VPS Deployment Overview

This guide covers deploying THE BRIDGE AI OS homepage to a VPS with automatic startup, monitoring, and production-grade reliability.

## 📋 Prerequisites

### VPS Requirements
- Ubuntu 20.04+ or Debian 11+
- 2GB RAM minimum, 4GB recommended
- 20GB storage minimum
- Domain name (optional but recommended)

### System Dependencies
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install required packages
sudo apt install -y curl wget git htop ufw fail2ban unattended-upgrades

# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 globally
sudo npm install -g pm2

# Install Nginx
sudo apt install -y nginx

# Install Certbot (for SSL)
sudo apt install -y certbot python3-certbot-nginx
```

## 🛠️  Automated Deployment

### One-Command Deployment
```bash
# Clone repository
git clone https://github.com/yourusername/the-bridge-ai-os.git
cd the-bridge-ai-os

# Set environment variables
export DOMAIN=yourdomain.com
export EMAIL=admin@yourdomain.com

# Run automated deployment
chmod +x deploy-vps.sh
./deploy-vps.sh
```

### Manual Deployment Steps

1. **Prepare VPS**
```bash
# Create application user (optional)
sudo adduser bridge
sudo usermod -aG sudo bridge

# Configure firewall
sudo ufw allow ssh
sudo ufw allow 'Nginx Full'
sudo ufw --force enable
```

2. **Deploy Application**
```bash
# Create application directory
sudo mkdir -p /opt/the-bridge-ai-os
sudo chown $USER:$USER /opt/the-bridge-ai-os

# Copy application files
cp -r . /opt/the-bridge-ai-os/
cd /opt/the-bridge-ai-os

# Install dependencies
npm ci --production

# Configure environment
cp .env.production .env
nano .env  # Edit domain and other settings
```

3. **Configure PM2**
```bash
# Start with PM2
npm run pm2:start

# Save PM2 configuration
pm2 save

# Enable PM2 startup
pm2 startup
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u $USER --hp $HOME

# Install log rotation
pm2 install pm2-logrotate
```

4. **Configure Nginx**
```bash
# Copy Nginx configuration
sudo cp the-bridge-ai-os.service /etc/nginx/sites-available/the-bridge-ai-os

# Edit configuration with your domain
sudo nano /etc/nginx/sites-available/the-bridge-ai-os

# Enable site
sudo ln -sf /etc/nginx/sites-available/the-bridge-ai-os /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Test configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

5. **Setup SSL (Optional but Recommended)**
```bash
# Get SSL certificate
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Setup auto-renewal
sudo crontab -e
# Add: 0 12 * * * /usr/bin/certbot renew --quiet
```

## 📊 Monitoring & Maintenance

### Health Checks
```bash
# Run health check
npm run health-check

# View health check logs
tail -f logs/health_$(date +%Y%m%d).log
```

### Application Monitoring
```bash
# PM2 monitoring
npm run pm2:monit

# View logs
npm run pm2:logs

# Restart application
npm run pm2:restart
```

### System Monitoring
```bash
# Start monitoring script
npm run monitor

# View monitoring logs
tail -f logs/monitor_$(date +%Y%m%d).log
```

### Automated Monitoring Setup
```bash
# Add to crontab for automated health checks
crontab -e
# Add: */5 * * * * cd /opt/the-bridge-ai-os && npm run health-check

# Add monitoring script
# Add: @reboot cd /opt/the-bridge-ai-os && npm run monitor
```

## 🔄 Updates & Backups

### Automated Backups
```bash
# Run backup
npm run backup

# View backup files
ls -la /opt/bridge-backups/
```

### Application Updates
```bash
# Update application
npm run update

# Or manual update
cd /opt/the-bridge-ai-os
git pull origin main
npm ci --production
npm run pm2:restart
```

## 🔧 Troubleshooting

### Common Issues

**Application not starting:**
```bash
# Check PM2 status
pm2 status

# Check logs
npm run pm2:logs

# Restart application
npm run pm2:restart
```

**Nginx errors:**
```bash
# Check Nginx status
sudo systemctl status nginx

# Check configuration
sudo nginx -t

# View error logs
sudo tail -f /var/log/nginx/error.log
```

**High resource usage:**
```bash
# Check system resources
htop

# Check application memory
pm2 monit

# Restart if needed
npm run pm2:restart
```

**SSL issues:**
```bash
# Check certificate
sudo certbot certificates

# Renew certificate
sudo certbot renew

# Reload Nginx
sudo systemctl reload nginx
```

## 📈 Performance Optimization

### PM2 Configuration
- Cluster mode for multi-core utilization
- Memory limits and auto-restart
- Log rotation and compression

### Nginx Optimization
- Gzip compression enabled
- Static file caching
- Connection limits and timeouts

### Application Optimization
- Health checks every 30 seconds
- Automatic recovery on failures
- Resource monitoring and alerts

## 🔒 Security Best Practices

### System Security
```bash
# Disable root login
sudo nano /etc/ssh/sshd_config
# Set: PermitRootLogin no

# Setup fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban

# Enable automatic updates
sudo dpkg-reconfigure unattended-upgrades
```

### Application Security
- CORS configuration for allowed origins
- Rate limiting on API endpoints
- Input validation and sanitization
- Secure headers via Nginx

### SSL/TLS Configuration
- Always use HTTPS in production
- Strong cipher suites
- Certificate auto-renewal
- HSTS headers

## 📊 Metrics & Analytics

### Application Metrics
- PM2 process monitoring
- Response times and error rates
- Resource usage (CPU, memory, disk)
- MCP connection status

### System Metrics
- Server uptime and load average
- Network connections and bandwidth
- Disk usage and I/O operations
- System temperature (if available)

### Log Analysis
```bash
# Search for errors
grep "ERROR" logs/*.log

# Count requests by endpoint
grep "GET\|POST" logs/out.log | cut -d' ' -f7 | sort | uniq -c | sort -nr

# Monitor error rates
tail -f logs/err.log | grep --line-buffered "ERROR"
```

## 🚨 Alerting

### Email Alerts
Configure alerts for:
- Application crashes or restarts
- High resource usage (>80%)
- SSL certificate expiration (<30 days)
- Disk space running low (<10% free)

### Log Monitoring
```bash
# Monitor for critical errors
tail -f logs/combined.log | grep --line-buffered "CRITICAL\|ERROR\|ALERT"
```

## 🌐 Scaling Considerations

### Horizontal Scaling
- Load balancer configuration
- Session management
- Database clustering
- CDN integration

### Vertical Scaling
- Memory and CPU monitoring
- Auto-scaling policies
- Resource optimization
- Performance profiling

## 📚 Additional Resources

- [PM2 Documentation](https://pm2.keymetrics.io/docs/usage/pm2-doc-single-page/)
- [Nginx Configuration](https://nginx.org/en/docs/)
- [Certbot SSL](https://certbot.eff.org/docs/)
- [Node.js Production Best Practices](https://nodejs.org/en/docs/guides/nodejs-production-best-practices/)

## 🎯 Production Checklist

- [ ] Domain configured and DNS propagated
- [ ] SSL certificate installed and auto-renewing
- [ ] Firewall configured (SSH + HTTP/HTTPS only)
- [ ] Fail2ban installed and running
- [ ] Automatic updates enabled
- [ ] Monitoring and alerting configured
- [ ] Backup strategy implemented
- [ ] Log rotation configured
- [ ] Health checks passing
- [ ] Application accessible via domain

---

**🎉 Your THE BRIDGE AI OS is now running in production!**

Monitor the system regularly and update as needed. The automated scripts handle most maintenance tasks, but manual oversight ensures optimal performance.