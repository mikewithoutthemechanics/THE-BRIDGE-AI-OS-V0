#!/bin/bash
# Trigger redeploy
echo "deploy" >> api/index.js.bak 2>/dev/null || true
