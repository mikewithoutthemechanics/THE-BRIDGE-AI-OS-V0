# LAPTOP 2 SETUP - Run This First

**On Laptop 2 terminal:**

```bash
cd /c/aoe-unified-final
bash setup-laptop2-unattended.sh
```

**What it does:**
1. Waits for L1 to finish bootstrap (max 30 min)
2. Clones repo if needed
3. Creates branch `feature/supadash-consolidation`
4. Launches 7 specialist agents on port 9001
5. Starts auto-sync daemon (git pull/push every 5 min)
6. Starts health check daemon (every 60 sec)

**Do this AFTER L1 runs bootstrap:**
```bash
./agents/bootstrap-day1.sh  # Run on L1 first!
```

Then run this on L2 immediately after (can be same time or right after):
```bash
ssh laptop2 "bash -s" < /c/aoe-unified-final/setup-laptop2-unattended.sh &
```

Or directly on Laptop 2:
```bash
cd /c/aoe-unified-final && bash setup-laptop2-unattended.sh
```

**Monitor L2 status:**
```bash
curl http://localhost:9001/api/status | jq
# Should show: 7 agents ready
```
