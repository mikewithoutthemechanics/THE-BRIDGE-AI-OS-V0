#!/usr/bin/env bash
# Destructive failure simulation. REQUIRES CONFIRM=yes.
# Always takes a backup before acting. Always prints recovery command.
# Intended use: prove Layer 1 + 2B actually notice and react.

set -u

[ "${CONFIRM:-}" = "yes" ] || { echo "refusing: set CONFIRM=yes to run destructive chaos test"; exit 2; }

ID="${1:-}"
APP_NAME="${PM2_APP_NAME:-orchestra-core}"

case "$ID" in
  c44)
    [ -f orchestra.html ] || { echo "orchestra.html missing"; exit 1; }
    cp orchestra.html orchestra.html.chaos-bak
    mv orchestra.html orchestra.html.bak
    echo "moved orchestra.html → orchestra.html.bak (backup at .chaos-bak)"
    echo "expect: /healthz → 500 within next tick"
    echo "recover: mv orchestra.html.bak orchestra.html"
    ;;
  c45)
    PID="$(pgrep -f server.js | head -1)"
    [ -n "$PID" ] || { echo "no server.js process"; exit 1; }
    kill -9 "$PID"
    echo "killed server.js pid=$PID"
    echo "expect: PM2 autorestart within restart_delay (2s)"
    ;;
  c46)
    [ -f orchestra.html ] || { echo "orchestra.html missing"; exit 1; }
    cp -p orchestra.html orchestra.html.perm-bak
    chmod 000 orchestra.html
    echo "chmod 000 orchestra.html (backup metadata saved)"
    echo "recover: chmod 644 orchestra.html"
    ;;
  c48)
    [ -f orchestra.html ] || { echo "orchestra.html missing"; exit 1; }
    cp orchestra.html orchestra.html.corrupt-bak
    echo "corrupt" >> orchestra.html
    echo "appended corruption marker"
    echo "recover: mv orchestra.html.corrupt-bak orchestra.html"
    ;;
  *)
    echo "unknown id: $ID"
    echo "valid: c44 (move html) | c45 (kill server) | c46 (chmod 000) | c48 (corrupt html)"
    exit 2
    ;;
esac
