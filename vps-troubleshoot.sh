# Troubleshooting commands to run on your VPS

# Check if PM2 process is running
pm2 status

# If not running, start it
pm2 start ecosystem.config.js --env production

# Check if the app directory exists and has files
ls -la /var/www/bridgeai/app/

# Check if orchestra-server.js exists
ls -la /var/www/bridgeai/app/orchestra-server.js

# Try to run the server directly to see errors
cd /var/www/bridgeai/app
node orchestra-server.js

# Check environment variables
cd /var/www/bridgeai
cat .env | grep -v "^#" | grep -v "^$"

# Check Node.js version
node --version

# Check if port 80 is available
netstat -tlnp | grep :80

# Check system resources
free -h
df -h