#!/usr/bin/env bash
# SessionStart hook: announces the Librarian + BoK availability every boot.
# Stdout is injected back into the model's context as a system-reminder.
# Keep output short, deterministic, and read-only — no writes, no network.

set -u

BOK="docs/BOOK_OF_KNOWLEDGE.md"
TVM="docs/book/TVM.json"

echo "==================================="
echo "=== LIBRARIAN BOOT INITIALIZED ==="
echo "==================================="
echo "Always-on knowledge router. Two modes:"
echo "  solve  — describe a problem, get cited answer + next steps from the BoK"
echo "  seed   — share a new fact/rule/insight, it gets placed in the right chapter"
echo "Invoke: 'ask the librarian ...' or use the librarian agent directly."

if [ -f "$BOK" ]; then
  stamp=$(grep -m1 -iE '^last updated:' "$BOK" 2>/dev/null | head -c 80 || true)
  [ -n "$stamp" ] && echo "BoK: $BOK ($stamp)" || echo "BoK: $BOK"
else
  echo "BoK: NOT BUILT — run the book-of-knowledge agent to create $BOK"
fi

if [ -f "$TVM" ]; then
  topics=$(grep -oE '"[a-z0-9-]+":[[:space:]]*\{' "$TVM" 2>/dev/null | wc -l | tr -d ' ')
  echo "TVM: $TVM (${topics} topics)"
else
  echo "TVM: NOT BUILT — librarian solve mode will be limited until BoK is built"
fi
