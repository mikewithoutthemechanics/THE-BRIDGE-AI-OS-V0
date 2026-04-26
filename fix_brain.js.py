import sys

sys.stderr.write(
    "fix_brain.js.py is deprecated and no longer modifies repository files.\n"
    "This script previously performed string-based rewriting of brain.js using\n"
    "embedded source blocks, which is fragile and can drift from the real implementation.\n"
)
raise SystemExit(1)
