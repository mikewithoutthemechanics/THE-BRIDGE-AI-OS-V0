@echo off
echo Quick check - Stabilized System
echo ================================

echo.
echo 1. Container status:
docker-compose ps --services | for /f "delims=" %%i in ('more') do (
    docker-compose ps -f "name=%%i" --format json 2>nul | findstr /C:"\"State\":\"running\"" >nul
    if errorlevel 1 (
        echo    ✗ %%i: NOT RUNNING
    ) else (
        echo    ✓ %%i: RUNNING
    )
)

echo.
echo 2. API health:
curl -s -o /dev/null -w "   Backend HTTP: %%{http_code}\n" http://localhost:8080/admin/overview
curl -s -o /dev/null -w "   Frontend HTTP: %%{http_code}\n" http://localhost:8082/
curl -s -o /dev/null -w "   Edge health: %%{http_code}\n" http://localhost:8080/api/edge-health

echo.
echo 3. Service Worker:
curl -s -o /dev/null -w "   sw.js: %%{http_code}\n" http://localhost:8082/sw.js

echo.
echo Full validation: python verify-stabilized.py
pause