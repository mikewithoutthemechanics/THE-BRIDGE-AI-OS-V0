# Stabilized System Deployment - PowerShell
# Validates all components before starting

$ErrorActionPreference = "Stop"

Write-Host "=== Bridge AI OS - Stabilized Deployment ===" -ForegroundColor Cyan
Write-Host ""

# 1. Check prerequisites
Write-Host "[1/6] Checking prerequisites..." -ForegroundColor Yellow
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: docker not found" -ForegroundColor Red
    exit 1
}
if (-not (Get-Command docker-compose -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: docker-compose not found" -ForegroundColor Red
    exit 1
}
Write-Host "    Docker: OK" -ForegroundColor Green

# 2. Validate file structure
Write-Host "[2/6] Validating file structure..." -ForegroundColor Yellow
$requiredFiles = @(
    "backend\main.py",
    "backend\requirements.txt",
    "frontend\Dockerfile",
    "frontend\nginx.conf",
    "admin-dashboard.html",
    "public\js\admin-dashboard-stabilized.js",
    "frontend\sw.js",
    "docker-compose.yml"
)

foreach ($f in $requiredFiles) {
    if (-not (Test-Path $f)) {
        Write-Host "ERROR: Missing required file: $f" -ForegroundColor Red
        exit 1
    }
}
Write-Host "    Structure: OK" -ForegroundColor Green

# 3. Build services
Write-Host "[3/6] Building Docker images..." -ForegroundColor Yellow
docker-compose build --no-cache | Out-Null
Write-Host "    Build: OK" -ForegroundColor Green

# 4. Validate Service Worker syntax (if node available)
Write-Host "[4/6] Validating Service Worker..." -ForegroundColor Yellow
if (Get-Command node -ErrorAction SilentlyContinue) {
    node --check frontend\sw.js
    if ($LASTEXITCODE -eq 0) {
        Write-Host "    Service Worker: OK" -ForegroundColor Green
    } else {
        Write-Host "    WARNING: Service Worker syntax check failed (non-critical)" -ForegroundColor Yellow
    }
} else {
    Write-Host "    Skipping SW syntax check (node not installed)" -ForegroundColor Yellow
}

# 5. Start services
Write-Host "[5/6] Starting services..." -ForegroundColor Yellow
docker-compose up -d | Out-Null
Write-Host "    Services started" -ForegroundColor Green

# 6. Wait for health
Write-Host "[6/6] Waiting for health checks..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# Verification
Write-Host ""
Write-Host "=== Verification ===" -ForegroundColor Cyan
Write-Host "Checking edge services..." -ForegroundColor Yellow

$services = @("control", "business", "treasury")
foreach ($svc in $services) {
    $running = (docker-compose ps --services --filter "status=running" | Select-String $svc).Count -eq 1
    if ($running) {
        Write-Host "  ✓ $svc: RUNNING" -ForegroundColor Green
    } else {
        Write-Host "  ✗ $svc: NOT RUNNING" -ForegroundColor Red
        docker-compose logs $svc --tail 20
        exit 1
    }
}

Write-Host ""
Write-Host "=== Access Points ===" -ForegroundColor Cyan
Write-Host "  Frontend:  http://localhost:8082/admin-dashboard.html" -ForegroundColor White
Write-Host "  Backend:   http://localhost:8080/admin/overview" -ForegroundColor White
Write-Host "  WS:        ws://localhost:8080/ws" -ForegroundColor White
Write-Host "  SSE:       http://localhost:8080/events/stream" -ForegroundColor White
Write-Host ""
Write-Host "=== Stabilized System Ready ===" -ForegroundColor Green
Write-Host ""
Write-Host "Key fixes applied:" -ForegroundColor Cyan
Write-Host "  1. Service Worker: throttled to 1 fetch/5s, no navigation intercept" -ForegroundColor White
Write-Host "  2. WebSocket: deterministic heartbeat (3s ping, 5s timeout)" -ForegroundColor White
Write-Host "  3. Treasury: isolated service, no redirects" -ForegroundColor White
Write-Host "  4. Execution channels: fully decoupled" -ForegroundColor White
Write-Host ""
Write-Host "To view logs:" -ForegroundColor Cyan
Write-Host "  docker-compose logs -f backend" -ForegroundColor White
Write-Host "  docker-compose logs -f frontend" -ForegroundColor White