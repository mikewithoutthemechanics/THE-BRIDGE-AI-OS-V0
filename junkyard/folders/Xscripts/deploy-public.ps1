#!/usr/bin/env pwsh
# ================================
# BRIDGE AI OS → PUBLIC DEPLOY
# Traefik reverse proxy + Let's Encrypt SSL
# ================================

param(
    [string]$Domain  = "ai-os.co.za",
    [string]$Email   = "admin@ai-os.co.za",
    [string]$AppPort = "8082"   # internal container port to expose
)

$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host "  BRIDGE AI OS — PUBLIC DEPLOY"         -ForegroundColor Cyan
Write-Host "  Domain : $Domain"
Write-Host "  Email  : $Email"
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host ""

# --- 1. CREATE TRAEFIK CONFIG DIR ---
New-Item -ItemType Directory -Force -Path .\traefik | Out-Null

# --- 2. WRITE traefik.yml ---
@"
entryPoints:
  web:
    address: ":80"
    http:
      redirections:
        entryPoint:
          to: websecure
          scheme: https
  websecure:
    address: ":443"

providers:
  docker:
    exposedByDefault: false
  file:
    directory: /etc/traefik/dynamic
    watch: true

certificatesResolvers:
  letsencrypt:
    acme:
      email: $Email
      storage: /acme.json
      httpChallenge:
        entryPoint: web
"@ | Out-File .\traefik\traefik.yml -Encoding utf8

Write-Host "  [1/7] traefik.yml written" -ForegroundColor Green

# --- 3. CREATE ACME STORAGE (must have correct permissions) ---
if (-not (Test-Path .\traefik\acme.json)) {
    New-Item .\traefik\acme.json -ItemType File -Force | Out-Null
}
Write-Host "  [2/7] acme.json ready" -ForegroundColor Green

# --- 4. CREATE DOCKER NETWORK ---
docker network create web 2>$null
Write-Host "  [3/7] Docker network 'web' ready" -ForegroundColor Green

# --- 5. REMOVE OLD TRAEFIK + START FRESH ---
docker rm -f bridge-traefik 2>$null

docker run -d `
  --name bridge-traefik `
  --network web `
  -p 80:80 `
  -p 443:443 `
  -v "${PWD}/traefik/traefik.yml:/traefik.yml:ro" `
  -v "${PWD}/traefik/acme.json:/acme.json" `
  -v /var/run/docker.sock:/var/run/docker.sock `
  traefik:v3.0 `
  --configFile=/traefik.yml

Write-Host "  [4/7] Traefik started" -ForegroundColor Green

# --- 6. WRITE docker-compose.override.yml FOR YOUR APP ---
# NOTE: Docker labels must be set at container creation time.
# Use docker-compose so labels persist across restarts.
@"
version: '3.8'
services:
  frontend:
    networks:
      - web
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.frontend.rule=Host(\`"$Domain\`")"
      - "traefik.http.routers.frontend.entrypoints=websecure"
      - "traefik.http.routers.frontend.tls.certresolver=letsencrypt"
      - "traefik.http.services.frontend.loadbalancer.server.port=$AppPort"

networks:
  web:
    external: true
"@ | Out-File .\docker-compose.override.yml -Encoding utf8

Write-Host "  [5/7] docker-compose.override.yml written" -ForegroundColor Green

# --- 7. CONNECT RUNNING CONTAINERS TO 'web' NETWORK ---
docker ps -q | ForEach-Object {
    docker network connect web $_ 2>$null
}
Write-Host "  [6/7] Existing containers connected to 'web' network" -ForegroundColor Green

# --- 8. OPEN FIREWALL PORTS ---
netsh advfirewall firewall add rule name="HTTP_80"  dir=in action=allow protocol=TCP localport=80  2>$null | Out-Null
netsh advfirewall firewall add rule name="HTTPS_443" dir=in action=allow protocol=TCP localport=443 2>$null | Out-Null
Write-Host "  [7/7] Firewall rules added (80, 443)" -ForegroundColor Green

# --- RESULT ---
Write-Host ""
Write-Host "=======================================" -ForegroundColor Green
Write-Host "  DEPLOY COMPLETE"                       -ForegroundColor Green
Write-Host "=======================================" -ForegroundColor Green
Write-Host "  URL  : https://$Domain"
Write-Host "  ADMIN: https://$Domain/dashboard (if Traefik dashboard enabled)"
Write-Host ""
Write-Host "  If not working immediately:"
Write-Host "  1. DNS A record → your public IP"
Write-Host "  2. Router port forwarding: 80 + 443 → this machine"
Write-Host "  3. Wait 30-60s for Let's Encrypt SSL"
Write-Host ""
Write-Host "  To redeploy app with correct labels:"
Write-Host "  docker-compose up -d --force-recreate"
Write-Host "=======================================" -ForegroundColor Green
