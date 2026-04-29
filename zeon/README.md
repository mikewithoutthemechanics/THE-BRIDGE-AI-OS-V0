# ZEON Guardian

Mempool-rescue system for BRDG / ERC20 hot-wallet drains on Linea.

If an attacker ever steals the hot wallet's private key and broadcasts
`transferFrom(hot, attacker, X)`, the ZEON sentinel bot sees the pending tx,
broadcasts `rescueFullBalance(token, hot)` at `gasPrice × 1.20`, and the
sequencer orders the rescue first — hot balance flows to ColdSafe,
attacker's tx reverts with `ERC20: insufficient balance`.

## Roles

| Role       | Authority                          | Key class           | Funding needed |
|------------|------------------------------------|---------------------|----------------|
| Owner      | Rotate any role, set watched tokens | Cold (hardware)     | 0.005 ETH deploy |
| Sentinel   | `rescuePullFrom` / `rescueFullBalance` only | Hot (always on) | ~0.001 ETH gas |
| Pauser     | `pause` / `unpause` only           | Warm (separate)     | ~0.001 ETH gas |
| Cold Safe  | Receives rescued funds             | Cold (hardware/multisig) | 0 ETH (recv only) |

## Files

- `contracts/ZeonGuardian.sol` — the rescue contract
- `contracts/MockERC20.sol` — test-only token
- `scripts/sentinel.js` — mempool watcher, broadcasts rescue
- `scripts/pauser.js` — CLI for pause / unpause / status
- `scripts/deploy-modular-vault.js` — one-shot Linea deploy + MAX approve
- `ecosystem.config.js` — pm2 entry for `zeon-sentinel`
- `test/zeon-guardian.test.js` — 9 tests including race simulation

## Test

```bash
cd zeon
npm install
npx hardhat test
```

All 9 tests should pass, including the race test that proves the attacker
reverts when the sentinel's bumped-gas rescue gets ordered first.

## Deploy to Linea

1. Fund three addresses:
   - `ZEON_COLD_SAFE` — hardware wallet or Safe multisig (0 ETH needed)
   - `ZEON_SENTINEL_ADDR` — ~0.001 ETH on Linea
   - `ZEON_PAUSER_ADDR` — ~0.001 ETH on Linea
2. Fund the deployer EOA with ~0.005 ETH.
3. Copy `.env.example` → `/root/.env.zeon` on the VPS, fill values.
4. Dry-run: `node scripts/deploy-modular-vault.js --dry`
5. Deploy: `node scripts/deploy-modular-vault.js`
6. Save the `ZEON_GUARDIAN_ADDR` printed in the deployment receipt.
7. `pm2 start ecosystem.config.js && pm2 save`
8. `node scripts/pauser.js status` → expect `{ paused: false }`.

## Emergency pause

```bash
node scripts/pauser.js pause    # freeze rescues
node scripts/pauser.js unpause  # thaw
```

Use if the sentinel key itself is suspected leaked — pause first, rotate
sentinel via `rotateSentinel(new)` from the owner, then unpause.

## Security notes

- The hot wallet's private key is NEVER stored in ZEON env permanently.
  `ZEON_HOT_WALLET_KEYS` is only used for the one-time MAX approval step,
  then deleted.
- Sentinel compromise ≠ fund loss: attacker holding the sentinel key can
  only call `rescueFullBalance`, which moves funds to the owner-controlled
  ColdSafe. They can grief (waste gas) but cannot steal.
- ZEON does not require mempool visibility to *eventually* rescue — if a
  drain gets confirmed, the next `rescueFullBalance` call still pulls the
  remaining approved balance. Mempool visibility is what wins the *current*
  tx race.
- Linea is a single-sequencer L2 today; sequencer ordering is effectively
  deterministic by `effectiveGasPrice` desc. If Linea's ordering policy
  changes (e.g. fair-ordering / FCFS), tune `GAS_BUMP_PCT` accordingly.
