# AUTO-CONNECT ALL 3 LAPTOPS - RUN ON L1 (PowerShell)

$REPO = "C:\aoe-unified-final"
$L2_HOST = "laptop2"
$L3_HOST = "laptop3"
$GIT_URL = "https://${env:GH_TOKEN}@github.com/bridgeaios/THE-BRIDGE-AI-OS-V0.git"

function Setup-SSH {
    param($host)
    ssh-keygen -t ed25519 -f $env:USERPROFILE\.ssh\id_ed25519 -N "" -C "supadash@$env:COMPUTERNAME" -y 2>$null | Out-Null
    ssh-copy-id -i $env:USERPROFILE\.ssh\id_ed25519.pub $host 2>$null | Out-Null
    Write-Host "✓ SSH configured for $host"
}

function Verify-Host {
    param($host)
    $result = ssh -o ConnectTimeout=5 $host "echo OK" 2>$null
    if ($result -eq "OK") {
        Write-Host "✓ $host reachable"
        return $true
    }
    Write-Host "✗ $host NOT reachable"
    return $false
}

function Clone-Repo {
    param($host)
    ssh $host "mkdir -p /c && cd /c && [ -d aoe-unified-final ] || git clone $GIT_URL aoe-unified-final" 2>$null
}

function Setup-Branch {
    param($host)
    ssh $host "cd /c/aoe-unified-final && git checkout feature/supadash-consolidation 2>/dev/null || git checkout -b feature/supadash-consolidation" 2>$null
}

function Create-Dirs {
    param($host)
    ssh $host "mkdir -p /c/aoe-unified-final/{shared,LOGS,STANDUPS,AGENTS}" 2>$null
}

Write-Host "═══════════════════════════════════════════════════════════"
Write-Host "AUTO-CONNECTING 3 LAPTOPS (PowerShell)"
Write-Host "═══════════════════════════════════════════════════════════"
Write-Host ""

# L1 local setup
Write-Host "► Setting up L1 (local)..."
Set-Location $REPO
New-Item -ItemType Directory -Force -Path shared, LOGS, STANDUPS, AGENTS | Out-Null
git checkout feature/supadash-consolidation 2>$null
Write-Host "✓ L1 ready"
Write-Host ""

# SSH key setup
Write-Host "► Setting up SSH keys..."
Setup-SSH $L2_HOST
Setup-SSH $L3_HOST
Write-Host ""

# Verify connectivity
Write-Host "► Verifying connectivity..."
if (-not (Verify-Host $L2_HOST)) { exit 1 }
if (-not (Verify-Host $L3_HOST)) { exit 1 }
Write-Host ""

# Clone repos (parallel)
Write-Host "► Cloning repo on L2 and L3..."
$jobs = @()
$jobs += (Start-Job -ScriptBlock { ssh $using:L2_HOST 'bash -c "mkdir -p /c; cd /c; [ -d aoe-unified-final ] || git clone '"'"'https://${env:GH_TOKEN}@github.com/bridgeaios/THE-BRIDGE-AI-OS-V0.git'"'"' aoe-unified-final"' })
$jobs += (Start-Job -ScriptBlock { ssh $using:L3_HOST 'bash -c "mkdir -p /c; cd /c; [ -d aoe-unified-final ] || git clone '"'"'https://${env:GH_TOKEN}@github.com/bridgeaios/THE-BRIDGE-AI-OS-V0.git'"'"' aoe-unified-final"' })
Wait-Job $jobs | Out-Null
Write-Host "✓ Repos cloned"
Write-Host ""

# Setup branches (parallel)
Write-Host "► Setting up git branches..."
$jobs = @()
$jobs += (Start-Job -ScriptBlock { ssh $using:L2_HOST 'bash -c "cd /c/aoe-unified-final; git checkout feature/supadash-consolidation 2>/dev/null || git checkout -b feature/supadash-consolidation"' })
$jobs += (Start-Job -ScriptBlock { ssh $using:L3_HOST 'bash -c "cd /c/aoe-unified-final; git checkout feature/supadash-consolidation 2>/dev/null || git checkout -b feature/supadash-consolidation"' })
Wait-Job $jobs | Out-Null
Write-Host "✓ Branches ready"
Write-Host ""

# Create directories (parallel)
Write-Host "► Creating directories..."
$jobs = @()
$jobs += (Start-Job -ScriptBlock { ssh $using:L2_HOST "mkdir -p /c/aoe-unified-final/{shared,LOGS,STANDUPS,AGENTS}" })
$jobs += (Start-Job -ScriptBlock { ssh $using:L3_HOST "mkdir -p /c/aoe-unified-final/{shared,LOGS,STANDUPS,AGENTS}" })
Wait-Job $jobs | Out-Null
Write-Host "✓ Directories created"
Write-Host ""

# Git auto-sync script
Write-Host "► Configuring git auto-sync..."
$syncScript = @'
#!/bin/bash
cd /c/aoe-unified-final
while true; do
  git pull origin feature/supadash-consolidation 2>/dev/null || true
  git push origin feature/supadash-consolidation 2>/dev/null || true
  sleep 300
done
'@

$syncScript | Out-File -FilePath /tmp/git-auto-push.sh -Encoding ASCII -Force

# Deploy sync daemon (parallel)
$jobs = @()
$jobs += (Start-Job -ScriptBlock { scp /tmp/git-auto-push.sh "$using:L2_HOST`:/tmp/" 2>$null })
$jobs += (Start-Job -ScriptBlock { scp /tmp/git-auto-push.sh "$using:L3_HOST`:/tmp/" 2>$null })
Wait-Job $jobs | Out-Null

$jobs = @()
$jobs += (Start-Job -ScriptBlock { ssh $using:L2_HOST "nohup /tmp/git-auto-push.sh > /dev/null 2>&1 &" })
$jobs += (Start-Job -ScriptBlock { ssh $using:L3_HOST "nohup /tmp/git-auto-push.sh > /dev/null 2>&1 &" })
Wait-Job $jobs | Out-Null

Write-Host "✓ Auto-sync configured (every 5 min)"
Write-Host ""

Write-Host "═══════════════════════════════════════════════════════════"
Write-Host "✓ ALL 3 LAPTOPS CONNECTED"
Write-Host "═══════════════════════════════════════════════════════════"
Write-Host ""
Write-Host "Next: Run ./agents/bootstrap-day1.sh"
Write-Host ""
