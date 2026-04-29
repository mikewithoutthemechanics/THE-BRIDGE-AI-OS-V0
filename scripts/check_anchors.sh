#!/usr/bin/env bash
# Integrity check: every rail data-href="#X" must resolve to <section id="X"> in orchestra.html.
# Exits non-zero if any dead link is found. Suitable for pre-commit or CI.

set -u

HTML="${ORCHESTRA_HTML:-orchestra.html}"
[ -r "$HTML" ] || { echo "FAIL: $HTML not found"; exit 1; }

# Extract every #anchor from data-href (skip '.')
anchors="$(grep -oE 'data-href="#[^"]+"' "$HTML" | sed 's/data-href="#//; s/"$//' | sort -u)"
# Extract every section/element id=""
ids="$(grep -oE 'id="[^"]+"' "$HTML" | sed 's/id="//; s/"$//' | sort -u)"

fail=0
for a in $anchors; do
  if ! echo "$ids" | grep -qxF "$a"; then
    echo "DEAD ANCHOR: #$a (no matching id= attribute)"
    fail=1
  fi
done

if [ "$fail" = "0" ]; then
  echo "OK: every data-href resolves."
  echo "anchors probed: $(echo "$anchors" | wc -w | tr -d ' ')"
fi
exit "$fail"
