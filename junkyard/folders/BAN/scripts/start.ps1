# BAN — Bridge AI Network Startup Script
Write-Host "`n  ⚡ BAN — Bridge AI Network" -ForegroundColor Cyan
Write-Host "  ─────────────────────────────" -ForegroundColor DarkGray

# Check Python
$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) {
    Write-Host "  ✗ Python not found. Install Python 3.11+" -ForegroundColor Red
    exit 1
}
Write-Host "  ✓ Python: $($python.Source)" -ForegroundColor Green

# Install dependencies
Write-Host "  → Installing dependencies..." -ForegroundColor Yellow
pip install -r requirements.txt --quiet

# Start server
Write-Host ""
Write-Host "  ⚡ Starting BAN on http://localhost:8000" -ForegroundColor Cyan
Write-Host "  ─────────────────────────────" -ForegroundColor DarkGray
Write-Host ""

Set-Location $PSScriptRoot\..
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
