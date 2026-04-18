#!/usr/bin/env bash
# Phase 2A — Passive observer. Detects but never acts.
# Purpose: surface false positives (transient 5xx, cold-start races, file I/O blips)
# BEFORE Phase 2B (threshold-gated restart) is enabled.

set -u

PORT="${ORCHESTRA_PORT:-7777}"
URL="http://127.0.0.1:${PORT}/healthz"
TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "$URL" 2>/dev/null)"
CODE="${CODE:-000}"
LATENCY_MS="$(curl -s -o /dev/null -w '%{time_total}' --max-time 3 "$URL" 2>/dev/null)"
LATENCY_MS="${LATENCY_MS:-0}"

if [ "$CODE" = "200" ]; then
  STATUS="OK"
else
  STATUS="WOULD_FAIL"
fi

echo "${TS} status=${STATUS} code=${CODE} latency=${LATENCY_MS}s url=${URL}"
