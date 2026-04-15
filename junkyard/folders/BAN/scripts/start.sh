#!/bin/bash
# BAN — Bridge AI Network Startup Script
echo ""
echo "  ⚡ BAN — Bridge AI Network"
echo "  ─────────────────────────────"

cd "$(dirname "$0")/.."

pip install -r requirements.txt --quiet 2>/dev/null

echo ""
echo "  ⚡ Starting BAN on http://localhost:8000"
echo "  ─────────────────────────────"
echo ""

uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
