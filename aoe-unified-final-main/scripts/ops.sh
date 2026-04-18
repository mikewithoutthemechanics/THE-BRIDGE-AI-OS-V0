#!/usr/bin/env bash
# Orchestra ops cookbook. One-shot commands, callable by id.
# Usage:  scripts/ops.sh <id>       e.g.  scripts/ops.sh c11
#         scripts/ops.sh list       list all ids
#
# Port is centralized (ORCHESTRA_PORT, default 7777).
# Destructive simulations (c44–c48) live in chaos_test.sh and require CONFIRM=yes.

set -u
PORT="${ORCHESTRA_PORT:-7777}"
APP_NAME="${PM2_APP_NAME:-orchestra-core}"
CSV="${DISCOVERY_CSV:-logs/discovery.csv}"
URL="http://127.0.0.1:${PORT}"

case "${1:-help}" in
  # --- Discovery / Calibration ---
  c1)  wc -l "$CSV" ;;
  c2)  tail -n 20 "$CSV" ;;
  c3)  awk -F, 'NR>1{lat+=$3;n++}END{if(n)print "avg_latency="lat/n}' "$CSV" ;;
  c4)  awk -F, 'NR>1 && $4!=""{mem+=$4;n++}END{if(n)print "avg_mem="mem/n}' "$CSV" ;;
  c5)  awk -F, 'NR>1{if($2!=200)c++;else c=0;if(c>m)m=c}END{print "max_consecutive_failures="m+0}' "$CSV" ;;
  c6)  sort -t, -k3 -nr "$CSV" | head ;;
  c7)  sort -t, -k4 -nr "$CSV" | head ;;
  c8)  cut -d, -f3 "$CSV" | sort -n | tail -1 ;;
  c9)  cut -d, -f4 "$CSV" | sort -n | tail -1 ;;
  c10) grep -c ",500," "$CSV" || true ;;

  # --- Health / Validation ---
  c11) curl -i "$URL/healthz" ;;
  c12) while :; do curl -s -o /dev/null -w "%{http_code}\n" "$URL/healthz"; sleep 1; done ;;
  c13) command -v ab >/dev/null && ab -n 100 -c 10 "$URL/healthz" || echo "ab not installed; fallback" && \
       for i in $(seq 1 100); do curl -s -o /dev/null -w "%{http_code} %{time_total}\n" "$URL/healthz"; done ;;
  c14) curl -w "%{time_total}\n" -o /dev/null -s "$URL/healthz" ;;
  c15) for i in $(seq 1 20); do curl -s -o /dev/null -w "%{http_code}\n" "$URL/healthz"; done ;;

  # --- PM2 Control ---
  c16) pm2 status ;;
  c17) pm2 logs "$APP_NAME" --lines 50 ;;
  c18) pm2 restart ecosystem.config.js ;;
  c19) pm2 reload ecosystem.config.js ;;
  c20) pm2 monit ;;
  c21) pm2 save ;;
  c22) echo "SAFETY: refusing blind delete. Run: pm2 delete $APP_NAME" ;;
  c23) pm2 start ecosystem.config.js ;;

  # --- Process / Memory ---
  c24) ps aux 2>/dev/null | grep -E 'server\.js' | grep -v grep || tasklist 2>/dev/null | grep -i node ;;
  c25) top -bn1 2>/dev/null | head || echo "top unavailable on this platform" ;;
  c26) ps -o pid,rss,cmd -C node 2>/dev/null || echo "platform lacks -C flag" ;;
  c27) free -m 2>/dev/null || echo "free unavailable on this platform" ;;
  c28) vmstat 1 5 2>/dev/null || echo "vmstat unavailable on this platform" ;;

  # --- Network / Ports ---
  c29) ss -tulnp 2>/dev/null | grep ":$PORT" || netstat -ano 2>/dev/null | grep ":$PORT" ;;
  c30) lsof -i ":$PORT" 2>/dev/null || netstat -ano 2>/dev/null | grep ":$PORT" ;;
  c31) netstat -tulnp 2>/dev/null | grep node || netstat -ano 2>/dev/null | grep ":$PORT" ;;
  c32) curl -i "$URL/" ;;
  c33) ping -c 3 127.0.0.1 2>/dev/null || ping -n 3 127.0.0.1 ;;

  # --- Drift / Integrity ---
  c34) sha256sum orchestra.html 2>/dev/null || shasum -a 256 orchestra.html ;;
  c35) find . -type f -not -path "*/node_modules/*" -not -path "*/.git/*" | wc -l ;;
  c36) [ -r baseline.sha256 ] && diff baseline.sha256 <(find . -type f -not -path "*/node_modules/*" -not -path "*/.git/*" -exec sha256sum {} \; 2>/dev/null | sort | sha256sum) || echo "no baseline.sha256 — run: scripts/ops.sh baseline" ;;
  c37) stat orchestra.html 2>/dev/null || ls -la orchestra.html ;;
  c38) md5sum server.js 2>/dev/null || md5 server.js ;;

  # --- Logs / Observability ---
  c39) tail -f logs/quant.log 2>/dev/null || echo "logs/quant.log not yet produced" ;;
  c40) grep '"decision":0' logs/quant.log 2>/dev/null || echo "no decision:0 events" ;;
  c41) wc -l logs/quant.log 2>/dev/null || echo "logs/quant.log absent" ;;
  c42) tail -n 100 logs/quant.log 2>/dev/null || echo "logs/quant.log absent" ;;
  c43) grep -r ERROR logs/ 2>/dev/null || echo "no ERROR entries" ;;

  # --- Failure Simulation (DELEGATED to chaos_test.sh, CONFIRM=yes required) ---
  c44|c45|c46|c48) echo "DESTRUCTIVE — use: CONFIRM=yes scripts/chaos_test.sh $1" ;;
  c47) sleep 2 && pm2 restart ecosystem.config.js ;;

  # --- Recovery / Rollback ---
  c49) [ -r orchestra_backup.tgz ] && tar -xzf orchestra_backup.tgz || echo "no orchestra_backup.tgz" ;;
  c50) pm2 restart ecosystem.config.js --update-env ;;

  # --- Utilities ---
  baseline)
    find . -type f -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/logs/*" \
      -exec sha256sum {} \; 2>/dev/null | sort | sha256sum > baseline.sha256
    echo "wrote baseline.sha256"
    ;;
  list)
    grep -E '^\s+c[0-9]+\)' "$0" | sed 's/)//' | awk '{print $1}'
    ;;
  help|*)
    sed -n '1,8p' "$0"
    echo "Try: scripts/ops.sh list"
    ;;
esac
