@echo off
REM Bridge AI OS - 5-Tier Docker Migration Script for Windows

setlocal enabledelayedexpansion

echo.
echo 🚀 Bridge AI OS - 5-Tier Architecture Migration (Windows)
echo ===========================================================
echo.

REM Check for docker command
docker --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Docker is not installed or not in PATH
    exit /b 1
)

REM Check for docker-compose
docker compose version >nul 2>&1
if errorlevel 1 (
    echo ❌ Docker Compose is not installed
    exit /b 1
)

REM Create .env if not exists
if not exist .env (
    echo 📝 Creating .env file...
    (
        echo # Database
        echo DB_USER=bridge
        echo DB_PASS=changeme-prod-password
        echo POSTGRES_INITDB_ARGS=-c max_connections=200
        echo.
        echo # Redis
        echo REDIS_PASS=changeme-redis-password
        echo.
        echo # JWT
        echo JWT_SECRET=your-jwt-secret-key-change-in-production
        echo.
        echo # Neo4j
        echo NEO4J_USER=neo4j
        echo NEO4J_PASS=changeme-neo4j-password
        echo.
        echo # Supabase (optional)
        echo SUPABASE_URL=
        echo SUPABASE_KEY=
        echo.
        echo # Environment
        echo NODE_ENV=production
    ) > .env
    echo ✅ .env file created
)

REM Create certs directory and generate self-signed cert
if not exist certs (
    echo 🔐 Creating SSL certificates directory...
    mkdir certs
    
    REM Use PowerShell to generate certificate (if available)
    powershell -Command "^
        $cert = New-SelfSignedCertificate -DnsName 'localhost' -CertStoreLocation 'cert:\LocalMachine\My' -Subject 'CN=localhost' -NotAfter (Get-Date).AddYears(1); ^
        Export-Certificate -Cert $cert -FilePath 'certs\server.crt' -Force; ^
        [System.IO.File]::WriteAllBytes('certs\server.key', [System.Convert]::FromBase64String('MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQC7z9xYFWOxJgPQ')); ^
        Write-Host 'SSL certificates generated (using self-signed)' ^
    " 2>nul || echo ⚠️  Could not auto-generate certificates. Create manually or use openssl.

    if not exist certs\server.crt (
        echo ⚠️  SSL certificates not found. Create manually:
        echo    openssl req -x509 -newkey rsa:4096 -keyout certs\server.key -out certs\server.crt -days 365 -nodes
    )
)

REM Create migrations directory
if not exist migrations (
    echo 📂 Creating migrations directory...
    mkdir migrations
)

REM Build images
echo.
echo 🏗️  Building Docker images...
docker compose -f docker-compose.prod.yml build --no-cache
if errorlevel 1 (
    echo ❌ Build failed
    exit /b 1
)

REM Start services
echo.
echo 🚀 Starting Bridge AI OS 5-tier architecture...
docker compose -f docker-compose.prod.yml up -d
if errorlevel 1 (
    echo ❌ Start failed
    exit /b 1
)

REM Wait for services
echo.
echo ⏳ Waiting 10s for services to initialize...
timeout /t 10 /nobreak

REM Display status
echo.
echo 📊 Service Status:
docker compose -f docker-compose.prod.yml ps

REM Display connection info
echo.
echo ✅ Bridge AI OS 5-tier stack is running!
echo ===========================================================
echo 📍 Access Points:
echo    - Nginx Tier 1:     https://localhost (TLS)
echo    - Gateway Tier 2:   http://localhost:8080
echo    - Main Tier 3A:     http://localhost:3000
echo    - Brain Tier 3B:    http://localhost:8000
echo    - SVG Tier 3C:      http://localhost:7070
echo    - PostgreSQL:       localhost:5432
echo    - Redis:            localhost:6379
echo.
echo 📋 Useful Commands:
echo    docker compose -f docker-compose.prod.yml logs -f
echo    docker compose -f docker-compose.prod.yml ps
echo    docker compose -f docker-compose.prod.yml down
echo.
