@echo off
REM =============================================================================
REM Bridge AI OS — Vendor & Inventory Deployment (Windows)
REM =============================================================================
REM Run this on your VPS (Windows) or use WSL
REM =============================================================================

echo ╔══════════════════════════════════════════════════════════════╗
echo ║  Bridge AI OS — Vendor ^& Inventory System Deployment       ║
echo ╚══════════════════════════════════════════════════════════════╝
echo.

REM Step 1: Check for gateway.js
echo [Step 1] Checking for gateway.js...
if not exist "C:\aoe-unified-final-main\gateway.js" (
    echo   WARNING: gateway.js not found in project root
    echo   Expected location: C:\aoe-unified-final-main\gateway.js
    echo   If your gateway is on a VPS, copy this file there first.
    pause
    exit /b 1
)
echo   Found gateway.js
echo.

REM Step 2: Apply migrations manually (Supabase)
echo [Step 2] Database migrations
echo   Open https://app.supabase.com -> SQL Editor
echo   Paste contents of: db\migrations\004_vendor_inventory_management.sql
echo   Run the query
echo.
pause

REM Step 3: Patch gateway.js
echo [Step 3] Patching gateway.js...
python patch_gateway_vendor_inventory_routes.py C:\aoe-unified-final-main\gateway.js
if errorlevel 1 (
    echo   ERROR: Patch failed
    pause
    exit /b 1
)
echo   gateway.js patched successfully
echo.

REM Step 4: Restart services
echo [Step 4] Restart services
echo   If using PM2: pm2 restart gateway
echo   If using systemd: sudo systemctl restart bridgeai-gateway
echo   If using Docker: docker-compose restart gateway
echo.
pause

REM Step 5: Seed data
echo [Step 5] Seed initial data
set /p TOKEN="Paste your bridge_token (from browser console): "
if not "%TOKEN%"=="" (
    python bulk_add_vendors.py --token %TOKEN% --api http://127.0.0.1:8080
) else (
    echo Skipping data import
)
echo.

echo ╔══════════════════════════════════════════════════════════════╗
echo ║  Deployment complete!                                       ║
echo ╚══════════════════════════════════════════════════════════════╝
echo.
pause
