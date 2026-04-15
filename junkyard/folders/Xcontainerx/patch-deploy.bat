@echo ==========================================
@echo IMMEDIATE PATCH DEPLOY
@echo ==========================================
@echo.

cd C:\aoe-unified-final\containerx

echo Building hardened containerx...
docker build -t containerx-secure .

echo Stopping old container...
docker stop containerx-terminal 2>nul
docker rm containerx-terminal 2>nul

echo Starting hardened container...
docker run -d -p 3000:3000 --name containerx-terminal containerx-secure

echo.
echo ==========================================
echo PATCH DEPLOY COMPLETE
echo ContainerX Hardened running on http://localhost:3000
echo ==========================================
