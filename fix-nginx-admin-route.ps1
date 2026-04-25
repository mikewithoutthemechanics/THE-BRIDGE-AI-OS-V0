param()
$ErrorActionPreference = 'Stop'
$VpsHost = 'root@102.208.228.44'

$remoteScript = @'
set -euo pipefail

CONF=/etc/nginx/sites-enabled/bridgeai
BACKUP_DIR=/root/nginx-backups
TS=$(date +%s)
BACKUP="$BACKUP_DIR/bridgeai.pre-adminroute-$TS"

mkdir -p "$BACKUP_DIR"

# Evict any previously-misplaced backups from sites-enabled
STRAGGLERS=$(ls /etc/nginx/sites-enabled/bridgeai.pre-* 2>/dev/null || true)
if [ -n "$STRAGGLERS" ]; then
  for f in $STRAGGLERS; do mv "$f" "$BACKUP_DIR/$(basename $f)"; done
fi

if [ ! -f "$CONF" ]; then echo "ERROR: $CONF not found"; exit 1; fi

# Step 1: if a prior attempt wrote routes into the HTTP:80 block, undo that first
# (routes sitting above a `return 301 https://...` default `location /`).
if python3 - "$CONF" <<'PY'
import sys, re, pathlib
p = pathlib.Path(sys.argv[1])
src = p.read_text()
# Detect a known-bad shape: our inserted block directly followed by the HTTP->HTTPS redirect stanza
bad = re.search(
    r"    # Admin dashboard served by admin-api on :4011\.\n(?:.*\n){1,40}?    location / \{\n        return 301 https",
    src,
)
sys.exit(0 if bad else 1)
PY
then
  echo "--- rolling back misplaced admin block in :80 server ---"
  python3 - "$CONF" <<'PY'
import re, pathlib, sys
p = pathlib.Path("/etc/nginx/sites-enabled/bridgeai")
src = p.read_text()
# Remove our exact inserted block up to the blank line before 'location / {'
new = re.sub(
    r"    # Admin dashboard served by admin-api on :4011\.\n(?:    .*\n)+?    \}\n\n(?=    location / \{\n        return 301 https)",
    "",
    src,
    count=1,
)
if new == src:
    print("WARN: could not remove bad insertion automatically; manual review needed", file=sys.stderr)
else:
    p.write_text(new)
    print("removed misplaced admin block")
PY
fi

cp "$CONF" "$BACKUP"
echo "backup: $BACKUP ($(stat -c%s $BACKUP) bytes)"

echo "--- pre-edit nginx -t ---"
if ! nginx -t 2>&1 | tail -3; then exit 9; fi

# Step 2: insert admin routes immediately BEFORE the unique :8080 proxy block
# The anchor is "    location / {" whose next line is "        proxy_pass http://localhost:8080;"
# That combination exists ONLY in the :443 server block.
python3 - "$CONF" <<'PY'
import re, pathlib, sys
p = pathlib.Path(sys.argv[1])
src = p.read_text()

if "location = /admin/" in src and "location /admin/ {" in src:
    # Already have admin routes; but verify they're in the 8080 block, not the 80 one.
    # Check: does the :443 `location / { proxy_pass ... 8080` block have admin above it?
    m = re.search(
        r"(    location = /admin/ \{[\s\S]*?\}\n\n)    location / \{\n        proxy_pass http://localhost:8080",
        src,
    )
    if m:
        print("admin routes already correctly positioned; nothing to do")
        sys.exit(0)
    # else fall through to insert

block = (
    "    # Admin dashboard served by admin-api on :4011.\n"
    "    # Exact /admin/ -> /, prefix /admin/* keeps path for JSON routes.\n"
    "    location = /admin  { return 301 /admin/; }\n"
    "    location = /admin/ {\n"
    "        proxy_pass http://127.0.0.1:4011/;\n"
    "        proxy_http_version 1.1;\n"
    "        proxy_set_header Host $host;\n"
    "        proxy_set_header X-Real-IP $remote_addr;\n"
    "        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n"
    "        proxy_set_header X-Forwarded-Proto $scheme;\n"
    "    }\n"
    "    location /admin/ {\n"
    "        proxy_pass http://127.0.0.1:4011;\n"
    "        proxy_http_version 1.1;\n"
    "        proxy_set_header Host $host;\n"
    "        proxy_set_header X-Real-IP $remote_addr;\n"
    "        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n"
    "        proxy_set_header X-Forwarded-Proto $scheme;\n"
    "    }\n\n"
)
# Unique anchor: the :443 block's `location /` whose proxy_pass is localhost:8080.
pattern = r"(    location / \{\n        proxy_pass http://localhost:8080;)"
new, n = re.subn(pattern, block + r"\1", src, count=1)
if n == 0:
    print("ERROR: unique 8080 anchor not found", file=sys.stderr)
    sys.exit(2)
p.write_text(new)
print(f"inserted admin routes before :8080 proxy block ({n} replacement)")
PY

echo "--- post-edit nginx -t ---"
if ! nginx -t 2>&1 | tail -3; then
  echo "SYNTAX FAILED - rolling back"
  cp "$BACKUP" "$CONF"
  nginx -t 2>&1 | tail -3
  exit 3
fi

echo "--- reload ---"
systemctl reload nginx
sleep 1

echo "--- verify public URL ---"
HTTP=$(curl -sSL -o /tmp/_admin.html -w '%{http_code}' https://bridge-ai-os.com/admin/)
SIZE=$(stat -c%s /tmp/_admin.html)
HITS=$(grep -c mem_mb /tmp/_admin.html || true)
TITLE=$(grep -oE '<title>[^<]+</title>' /tmp/_admin.html | head -1 || true)
echo "public: HTTP=$HTTP size=$SIZE mem_mb=$HITS"
echo "title : $TITLE"

if [ "$HTTP" = "200" ] && [ "$HITS" = "3" ]; then
  echo ""
  echo "=========================================="
  echo "  SUCCESS - admin dashboard live"
  echo "  https://bridge-ai-os.com/admin/"
  echo "  backup: $BACKUP"
  echo "=========================================="
else
  echo "VERIFY FAILED - expected HTTP=200 mem_mb=3"
  echo "rollback: cp $BACKUP $CONF && systemctl reload nginx"
  exit 4
fi
'@

Write-Host "Running Option A fix v3 on $VpsHost ..."
$remoteScript | ssh -o BatchMode=yes $VpsHost 'bash -s'
$code = $LASTEXITCODE
if ($code -eq 0) { Write-Host "DONE" -ForegroundColor Green } else { Write-Warning "Fix script exited with code $code" }
exit $code
