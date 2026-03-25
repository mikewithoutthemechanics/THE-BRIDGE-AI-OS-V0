#!/bin/bash
# AUTO-CONNECT ALL 3 LAPTOPS - RUN ON L1

set -e

REPO="/c/aoe-unified-final"
L2_HOST="laptop2"
L3_HOST="laptop3"

# SSH key setup (one-time on each laptop)
setup_ssh() {
  local host=$1
  ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519 -N "" -C "supadash@$(hostname)" 2>/dev/null || true
  ssh-copy-id -i ~/.ssh/id_ed25519.pub $host 2>/dev/null || echo "SSH already configured for $host"
}

# Verify connectivity
verify_host() {
  local host=$1
  if ssh -o ConnectTimeout=5 $host "echo OK" > /dev/null 2>&1; then
    echo "✓ $host reachable"
    return 0
  else
    echo "✗ $host NOT reachable"
    return 1
  fi
}

# Clone repo on all laptops
clone_repo() {
  local host=$1
  ssh $host "mkdir -p /c && cd /c && [ -d aoe-unified-final ] || git clone <YOUR_REPO_URL> aoe-unified-final"
}

# Setup feature branch on all laptops
setup_branch() {
  local host=$1
  ssh $host "cd /c/aoe-unified-final && git checkout feature/supadash-consolidation 2>/dev/null || git checkout -b feature/supadash-consolidation"
}

# Create directories on all laptops
create_dirs() {
  local host=$1
  ssh $host "mkdir -p /c/aoe-unified-final/{shared,LOGS,STANDUPS,AGENTS}"
}

echo "═══════════════════════════════════════════════════════════"
echo "AUTO-CONNECTING 3 LAPTOPS"
echo "═══════════════════════════════════════════════════════════"
echo ""

# L1 local setup
echo "► Setting up L1 (local)..."
cd $REPO
mkdir -p shared LOGS STANDUPS AGENTS
git checkout feature/supadash-consolidation 2>/dev/null || git checkout -b feature/supadash-consolidation
echo "✓ L1 ready"
echo ""

# SSH key setup (one-time)
echo "► Setting up SSH keys (one-time)..."
setup_ssh $L2_HOST
setup_ssh $L3_HOST
echo ""

# Verify connectivity
echo "► Verifying connectivity..."
verify_host $L2_HOST || exit 1
verify_host $L3_HOST || exit 1
echo ""

# Clone repos on L2 and L3
echo "► Cloning repo on L2 and L3..."
clone_repo $L2_HOST &
clone_repo $L3_HOST &
wait
echo "✓ Repos cloned"
echo ""

# Setup branches
echo "► Setting up git branches..."
setup_branch $L2_HOST &
setup_branch $L3_HOST &
wait
echo "✓ Branches ready"
echo ""

# Create directories
echo "► Creating directories..."
create_dirs $L2_HOST &
create_dirs $L3_HOST &
wait
echo "✓ Directories created"
echo ""

# Configure git for auto-sync
echo "► Configuring git auto-sync..."
cat > /tmp/git-auto-push.sh << 'SYNCEOF'
#!/bin/bash
cd /c/aoe-unified-final
while true; do
  git pull origin feature/supadash-consolidation 2>/dev/null || true
  git push origin feature/supadash-consolidation 2>/dev/null || true
  sleep 300
done
SYNCEOF

chmod +x /tmp/git-auto-push.sh

# Deploy sync daemon to L2 and L3
scp /tmp/git-auto-push.sh $L2_HOST:/tmp/
scp /tmp/git-auto-push.sh $L3_HOST:/tmp/

ssh $L2_HOST "nohup /tmp/git-auto-push.sh > /dev/null 2>&1 &" &
ssh $L3_HOST "nohup /tmp/git-auto-push.sh > /dev/null 2>&1 &" &
wait

echo "✓ Auto-sync configured (every 5 min)"
echo ""

echo "═══════════════════════════════════════════════════════════"
echo "✓ ALL 3 LAPTOPS CONNECTED"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Next: Run ./agents/bootstrap-day1.sh"
echo ""
