#!/bin/bash
# Quick BridgeAI OS v3 VPS Deployment
# Usage: ./quick-deploy-v3.sh [VPS_HOST] [DOMAIN]

set -e

VPS_HOST=${1:-""}
DOMAIN=${2:-""}

if [ -z "$VPS_HOST" ]; then
    echo "❌ Error: Please provide VPS host as first argument"
    echo "Usage: ./quick-deploy-v3.sh your-vps-ip [yourdomain.com]"
    exit 1
fi

echo "🚀 BridgeAI OS v3 - Quick VPS Deployment"
echo "========================================"
echo "VPS Host: $VPS_HOST"
echo "Domain: ${DOMAIN:-Not configured}"
echo ""

# Set environment variables
export VPS_HOST=$VPS_HOST
if [ -n "$DOMAIN" ]; then
    export DOMAIN=$DOMAIN
fi

# Generate production .env if it doesn't exist
if [ ! -f .env.production ]; then
    echo "❌ Error: .env.production template not found"
    exit 1
fi

# Copy production environment
cp .env.production .env

# Replace placeholder passwords with generated ones
sed -i "s/CHANGE_THIS_TO_A_SECURE_PASSWORD_[^']*/$(openssl rand -hex 16)/g" .env
sed -i "s/CHANGE_THIS_JWT_SECRET_[^']*/$(openssl rand -hex 32)/g" .env
sed -i "s/CHANGE_THIS_ENCRYPTION_KEY_[^']*/$(openssl rand -hex 32)/g" .env
sed -i "s/CHANGE_THIS_GRAFANA_PASSWORD_[^']*/$(openssl rand -hex 12)/g" .env

echo "✅ Environment configured"
echo ""

# Run the main deployment
./deploy-to-vps.sh

echo ""
echo "🎉 DEPLOYMENT COMPLETE!"
echo ""
echo "🌐 Access your BridgeAI OS v3:"
if [ -n "$DOMAIN" ]; then
    echo "• Main Site: https://$DOMAIN"
    echo "• Admin Dashboard: https://$DOMAIN/admin"
    echo "• Health Check: https://health.$DOMAIN"
else
    echo "• Admin Dashboard: http://$VPS_HOST:3100"
    echo "• Gateway API: http://$VPS_HOST:3300"
    echo "• Health Check: http://$VPS_HOST:8080/health"
fi