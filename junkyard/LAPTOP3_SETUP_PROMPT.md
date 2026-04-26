# LAPTOP 3 SETUP - Run This First

**On Laptop 3 terminal:**

```bash
cd /c/aoe-unified-final
bash setup-laptop3-unattended.sh
```

**What it does:**
1. Waits for L1 to finish bootstrap (max 30 min)
2. Clones repo if needed
3. Creates branch `feature/supadash-consolidation`
4. Launches 4+ Minimax instances (default 4) with 3 sub-agents each on port 9002
5. Starts auto-sync daemon (git pull/push every 5 min)
6. Starts health check daemon (every 60 sec)

**Do this AFTER L1 runs bootstrap:**
```bash
./agents/bootstrap-day1.sh  # Run on L1 first!
```

Then run this on L3 immediately after (can be same time or right after):
```bash
ssh laptop3 "bash -s" < /c/aoe-unified-final/setup-laptop3-unattended.sh &
```

Or directly on Laptop 3:
```bash
cd /c/aoe-unified-final && bash setup-laptop3-unattended.sh
```

**To customize instance count (default 4):**
```bash
MINIMAX_INSTANCES=6 bash setup-laptop3-unattended.sh
```

**Monitor L3 status:**
```bash
curl http://localhost:9002/api/status | jq
# Should show: N instances + 3*N sub-agents ready
```
