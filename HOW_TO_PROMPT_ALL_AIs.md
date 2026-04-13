# How to Set Up All 3 Laptops with AI Prompts

You have 3 files. Paste each into the AI running on that laptop.

---

## LAPTOP 1 (This Laptop - Claude Code)

**File:** `PROMPT_FOR_LAPTOP1_AI.txt`

**Action:** Paste this into Claude Code running on L1 in this repository.

**What it does:**
- Runs bootstrap at Hour 0
- Launches 6 agents on port 9000
- Instructs L2 and L3 to start
- Publishes contracts at Hour 4
- Monitors Days 2-8

---

## LAPTOP 2 (Kimi Code or Claude Code)

**File:** `PROMPT_FOR_LAPTOP2_AI.txt`

**Action:**
1. Copy this file to Laptop 2
2. Paste into Claude Code / Kimi Code running on L2 in this repository

**What it does:**
- Waits for L1 bootstrap
- Runs unattended setup script
- Launches 7 specialist agents on port 9001
- Starts auto-sync daemon

---

## LAPTOP 3 (VSCode or Claude Code)

**File:** `PROMPT_FOR_LAPTOP3_AI.txt`

**Action:**
1. Copy this file to Laptop 3
2. Paste into Claude Code running on L3 in this repository

**What it does:**
- Waits for L1 bootstrap
- Runs unattended setup script
- Launches 4+ Minimax instances on port 9002
- Starts auto-sync daemon

---

## EXECUTION SEQUENCE

1. **Paste L1 prompt** into Claude Code on Laptop 1
2. **Paste L2 prompt** into Claude Code on Laptop 2
3. **Paste L3 prompt** into Claude Code on Laptop 3
4. **L1 AI runs first** (executes bootstrap-day1.sh)
5. **L2 AI starts immediately after** (waits for L1, then setup-laptop2-unattended.sh)
6. **L3 AI starts immediately after** (waits for L1, then setup-laptop3-unattended.sh)
7. **All 3 come online in parallel**
8. **4 hours later:** L1 publishes contracts
9. **8 days later:** Done

---

## FILES TO COPY TO OTHER LAPTOPS

```bash
# Copy L2 prompt to Laptop 2:
scp /c/aoe-unified-final/PROMPT_FOR_LAPTOP2_AI.txt laptop2:/c/aoe-unified-final/

# Copy L3 prompt to Laptop 3:
scp /c/aoe-unified-final/PROMPT_FOR_LAPTOP3_AI.txt laptop3:/c/aoe-unified-final/
```

Or manually copy via USB/network share.

---

## VERIFICATION

After all 3 AIs have completed their setup:

```bash
curl http://localhost:9000/api/status | jq   # L1: 6 agents
curl http://localhost:9001/api/status | jq   # L2: 7 agents
curl http://localhost:9002/api/status | jq   # L3: 4+ instances
```

All should return success.

---

## THAT'S IT

The AIs do everything. No manual intervention needed for 8 days.
