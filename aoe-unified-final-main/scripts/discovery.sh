#!/usr/bin/env bash
# Calibration capture — records code, latency, memory every INTERVAL seconds
# for DURATION seconds. Produces logs/discovery.csv consumed by derive_thresholds.sh.
#
# Usage:
#   scripts/discovery.sh                    # defaults: 300s @ 5s
#   DURATION=1800 INTERVAL=5 ...            # 30min @ 5s (recommended)
#   DURATION=60 ...                         # quick smoke (insufficient data)

set -u

PORT="${ORCHESTRA_PORT:-7777}"
URL="http://127.0.0.1:${PORT}/healthz"
CSV="${DISCOVERY_CSV:-logs/discovery.csv}"
DURATION="${DURATION:-300}"
INTERVAL="${INTERVAL:-5}"
PROCESS_MATCH="${PROCESS_MATCH:-server.js}"

mkdir -p "$(dirname "$CSV")"
[ -s "$CSV" ] || echo "ts,code,latency,mem_mb" > "$CSV"

echo "[discovery] url=$URL duration=${DURATION}s interval=${INTERVAL}s csv=$CSV"
END=$(( $(date +%s) + DURATION ))

while [ "$(date +%s)" -lt "$END" ]; do
  TS=$(date +%s)
  CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "$URL" 2>/dev/null)"
  CODE="${CODE:-000}"
  LAT="$(curl -s -o /dev/null -w '%{time_total}' --max-time 3 "$URL" 2>/dev/null)"
  LAT="${LAT:-0}"
  # Portable process lookup: pgrep (Linux) or tasklist/wmic fallback
  if command -v pgrep >/dev/null 2>&1; then
    PID="$(pgrep -f "$PROCESS_MATCH" | head -1)"
  else
    PID=""
  fi
  if [ -n "$PID" ] && [ -r "/proc/$PID/status" ]; then
    MEM="$(awk '/VmRSS/{print $2/1024}' /proc/$PID/status)"
  else
    # Windows / no /proc — leave blank; derive will skip blanks
    MEM=""
  fi
  echo "${TS},${CODE},${LAT},${MEM}" >> "$CSV"
  sleep "$INTERVAL"
done
echo "[discovery] done. rows=$(wc -l < "$CSV")"
