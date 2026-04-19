#!/bin/bash
# THE BRIDGE AI OS - Quick Setup Script
# Run this after manually copying files to VPS

set -e

echo "🌉 THE BRIDGE AI OS - Quick Setup"
echo "═══════════════════════════════════"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

# Install systemd services
echo -e "${BLUE}Installing systemd services...${NC}"

sudo cp the-bridge-ai-os.service /etc/systemd/system/
sudo cp the-bridge-ai-os-health.service /etc/systemd/system/
sudo cp the-bridge-ai-os-health.timer /etc/systemd/system/

# Enable and start services
sudo systemctl daemon-reload
sudo systemctl enable the-bridge-ai-os.service
sudo systemctl enable the-bridge-ai-os-health.timer
sudo systemctl start the-bridge-ai-os-health.timer

echo -e "${GREEN}✅ Systemd services installed and enabled${NC}"

# Make scripts executable
chmod +x *.sh
echo -e "${GREEN}✅ Scripts made executable${NC}"

# Create logs directory
mkdir -p logs
echo -e "${GREEN}✅ Logs directory created${NC}"

echo ""
echo "🎉 Quick setup complete!"
echo ""
echo "Next steps:"
echo "1. Configure your environment: nano .env.production"
echo "2. Start the application: sudo systemctl start the-bridge-ai-os"
echo "3. Check status: sudo systemctl status the-bridge-ai-os"
echo "4. View logs: journalctl -u the-bridge-ai-os -f"