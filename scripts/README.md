# Orchestra Loop Scripts — Layer 2 (matrix-gated)

Activation ladder. **Do not skip phases.**

| Phase  | Script                 | Action                | Gate to advance                        |
|--------|------------------------|-----------------------|----------------------------------------|
| Calib. | `discovery.sh`         | Collect CSV           | 5–30 min of real traffic               |
| Calib. | `derive_thresholds.sh` | Empirical cutoffs     | Clean `thresholds.env` produced        |
| 2A     | `passive_loop.sh`      | Observe only          | 2–6h of zero unexpected `WOULD_FAIL`   |
| 2B     | `threshold_loop.sh`    | Restart after N fails | Zero false restarts during 2B window   |
| 2C     | (threshold with N=1)   | Immediate restart     | Only after 2B proves signal reliable   |

## Calibration — observe → measure → derive

```bash
# 1. Ensure server is up on port 7777
# 2. Capture (30 min @ 5s ideal; 60s @ 3s for smoke)
DURATION=1800 INTERVAL=5 scripts/discovery.sh

# 3. Derive empirical thresholds → scripts/thresholds.env
scripts/derive_thresholds.sh
```

`thresholds.env` is sourced automatically by `threshold_loop.sh`. The derived `FAIL_THRESHOLD` (N) is `max_consecutive_failures + 1`, minimum 2.

## Phase 2A — enable (passive, safe)

### Linux VPS (bridge-ai-os.com)

```bash
chmod +x scripts/passive_loop.sh
(crontab -l 2>/dev/null; echo "* * * * * cd /path/to/aoe-unified-final && scripts/passive_loop.sh >> logs/passive.log 2>&1") | crontab -
```

### Windows (local dev)

```powershell
schtasks /Create /SC MINUTE /MO 1 /TN "OrchestraPassive" ^
  /TR "bash c:\aoe-unified-final-main\scripts\passive_loop.sh >> c:\aoe-unified-final-main\logs\passive.log 2>&1"
```

## Phase 2B — enable (only after 2A clean)

Swap `passive_loop.sh` → `threshold_loop.sh` in the scheduler. Remove 2A entry first.

## Phase 2C — enable (only after 2B clean)

Set `FAIL_THRESHOLD=1` in the cron environment, or rebuild `thresholds.env` with that value.

## Ops cookbook

Every diagnostic / health / pm2 / drift command is addressable by ID:

```bash
scripts/ops.sh c11        # curl -i /healthz
scripts/ops.sh c15        # 20× http_code sampling
scripts/ops.sh c29        # port listener check (Linux or Windows)
scripts/ops.sh c34        # sha256sum orchestra.html
scripts/ops.sh baseline   # write baseline.sha256 for drift diffs
scripts/ops.sh list       # list every id
```

## Chaos / failure simulation (destructive — gated)

```bash
CONFIRM=yes scripts/chaos_test.sh c44   # move orchestra.html
CONFIRM=yes scripts/chaos_test.sh c45   # kill server.js
CONFIRM=yes scripts/chaos_test.sh c46   # chmod 000
CONFIRM=yes scripts/chaos_test.sh c48   # append corrupt bytes
```

Each prints its own recovery command. Always takes a backup first.

## Environment overrides

- `ORCHESTRA_PORT` (default 7777)
- `FAIL_THRESHOLD` (default 3; overridden by `thresholds.env`)
- `FAIL_COUNT_FILE` (default `/tmp/orchestra_fail_count`)
- `PM2_APP_NAME` (default `orchestra-core`)
- `DURATION`, `INTERVAL` (discovery.sh)

## Rollback

Remove the cron / scheduled task. Layer 1 (PM2 autorestart + `/healthz`) remains fully functional without any loop.
