# 🚀 EXECUTE 3-LAPTOP SETUP NOW

## STEP 1: L1 (Local - This Laptop)

**Terminal 1 on L1:**
```bash
cd /c/aoe-unified-final
./agents/bootstrap-day1.sh
```

Wait for output:
```
✓ BOOTSTRAP COMPLETE
✓ L1 (Port 9000): 6 Claude agents ready
```

Takes ~30-60 seconds.

---

## STEP 2: L2 (Laptop 2) - Start IMMEDIATELY After L1 Bootstrap

**Terminal 2 on L1 (deploy to L2):**
```bash
ssh laptop2 "bash -s" < /c/aoe-unified-final/setup-laptop2-unattended.sh &
```

Or **directly on Laptop 2 terminal:**
```bash
cd /c/aoe-unified-final && bash setup-laptop2-unattended.sh
```

Takes ~2-3 minutes. Shows:
```
✓ L2 READY
✓ 7 specialist agents initialized
✓ Auto-sync daemon running
```

---

## STEP 3: L3 (Laptop 3) - Start IMMEDIATELY After L1 Bootstrap

**Terminal 3 on L1 (deploy to L3):**
```bash
ssh laptop3 "bash -s" < /c/aoe-unified-final/setup-laptop3-unattended.sh &
```

Or **directly on Laptop 3 terminal:**
```bash
cd /c/aoe-unified-final && bash setup-laptop3-unattended.sh
```

For 6 instances instead of 4:
```bash
MINIMAX_INSTANCES=6 bash setup-laptop3-unattended.sh
```

Takes ~2-3 minutes. Shows:
```
✓ L3 READY
✓ 4+ Minimax instances (12+ sub-agents) initialized
✓ Auto-sync daemon running
```

---

## STEP 4: Monitor All 3

**Terminal 4 on L1:**
```bash
watch -n 5 'curl -s http://localhost:9000/api/status | jq .agents | length; curl -s http://localhost:9001/api/status | jq .agents | length; curl -s http://localhost:9002/api/status | jq .instances'
```

Should show:
```
6       # L1 agents
7       # L2 agents
4       # L3 instances (or custom number)
```

---

## STEP 5: Wait 4 Hours, Then Publish Contracts

**After Day 1 Hour 4 (4 hours after bootstrap):**

```bash
./agents/publish-contracts-day1.sh
```

Shows:
```
✓ CONTRACTS PUBLISHED
✓ 5 contracts now live
```

All agents can now start real work.

---

## STEP 6: Days 2-8 - Automatic

Do nothing. Everything runs automatically:
- L1: Generates code
- L2: Verifies + detects conflicts
- L3: Optimizes in parallel
- All sync via git every 5 min

---

## QUICK CHECKLIST

- [ ] L1 bootstrap complete (port 9000)
- [ ] L2 setup complete (port 9001)
- [ ] L3 setup complete (port 9002)
- [ ] All 3 laptops show agents/instances
- [ ] Wait 4 hours
- [ ] Publish contracts
- [ ] Wait 8 days
- [ ] Production cutover

---

## NETWORK REQUIREMENT

For `ssh laptop2` and `ssh laptop3` to work:
1. All 3 laptops on same network
2. SSH keys configured (auto-connect script handles this)
3. `/etc/hosts` or DNS resolves `laptop2` and `laptop3`

If SSH fails, check:
```bash
ping laptop2
ssh laptop2 "echo OK"
```

If no response, edit `/etc/hosts`:
```
192.168.x.x  laptop2
192.168.x.y  laptop3
```
