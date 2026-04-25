#!/usr/bin/env bash
# Phase 2B — Threshold-gated enforcement. Only acts after N consecutive failures.
# DISABLED BY DEFAULT. Enable only after Phase 2A observation window shows
# zero unexpected WOULD_FAIL entries.

set -u

# Load empirical thresholds if derive_thresholds.sh has produced them.
THRESHOLDS_ENV="${THRESHOLDS_ENV:-$(dirname "$0")/thresholds.env}"
[ -r "$THRESHOLDS_ENV" ] && . "$THRESHOLDS_ENV"

PORT="${ORCHESTRA_PORT:-7777}"
URL="http://127.0.0.1:${PORT}/healthz"
FAIL_COUNT_FILE="${FAIL_COUNT_FILE:-/tmp/orchestra_fail_count}"
THRESHOLD="${FAIL_THRESHOLD:-3}"
APP_NAME="${PM2_APP_NAME:-orchestra-core}"
TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "$URL" 2>/dev/null)"
CODE="${CODE:-000}"
COUNT="$(cat "$FAIL_COUNT_FILE" 2>/dev/null || echo 0)"

if [ "$CODE" = "200" ]; then
  COUNT=0
else
  COUNT=$((COUNT + 1))
fi

echo "$COUNT" > "$FAIL_COUNT_FILE"

if [ "$COUNT" -ge "$THRESHOLD" ]; then
  echo "${TS} A=0 confirmed_failure count=${COUNT} code=${CODE} → pm2 restart ${APP_NAME}"
  pm2 restart "$APP_NAME" --update-env
  echo 0 > "$FAIL_COUNT_FILE"
else
  echo "${TS} A=1 observed count=${COUNT} code=${CODE} threshold=${THRESHOLD}"
fi
