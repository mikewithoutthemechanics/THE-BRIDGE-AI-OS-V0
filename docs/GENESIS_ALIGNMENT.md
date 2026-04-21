# BRDG Genesis Alignment — Single Source of Truth

This document is the operational handbook for bringing the live BRDG economy
back in line with the original **BRIDGE_REAL_SYSTEM_BLUEPRINT.md** ("genesis
plan"). It is written to be read by both humans and agents; every machine-
actionable value lives in [`config/genesis-alignment.json`](../config/genesis-alignment.json).

> **Ground rules (non-negotiable, enforced by the scripts):**
> 1. **No invented data.** Anything that must come from a human (Safe
>    addresses, TGE date, SyncSwap router) is marked `REQUIRED_HUMAN` in
>    `config/genesis-alignment.json`. Scripts refuse to run while placeholders
>    remain.
> 2. **No on-chain action from this repo's own signer.** Every state-changing
>    step produces a **Safe Transaction Builder** JSON bundle that a human
>    signs from the appropriate Gnosis Safe.
> 3. **Every phase ends with `npm run genesis:audit`.** The audit reads live
>    Linea state and produces `docs/genesis-alignment/audit-latest.json`
>    + `.md`. Exit code 0 = pass, 1 = hard fail, 2 = infrastructure error.

---

## 0 · What the genesis plan committed to

Sourced verbatim from:
- `BRIDGE_REAL_SYSTEM_BLUEPRINT.md` §1A (BRDG Token), §1B (Treasury Vault),
  §2 (StakingVault), §3 (DEX seed), §Security.
- `BRIDGE_FINAL_FORM.md` Phase 16 (Autonomous Treasury).

| Commitment | Genesis value |
|---|---|
| Max supply | **100,000,000 BRDG** (hard cap) |
| TGE mint | **10M to treasury + 5M to StakingVault = 15M** |
| Remaining supply | 85M mintable by **governance multisig** over time |
| Mint authority | `AccessControl` `MINTER_ROLE` (treasury + governance) |
| Task-fee burn | **1% of every task fee** (via `burnFromFee`) |
| Task split | **85% agent / 14% treasury / 1% burn** |
| Revenue split | **40% ops / 25% liquidity / 20% reserve / 15% founder** |
| Initial liquidity | **1 ETH + 10,000 BRDG** on SyncSwap, target price 0.0001 ETH/BRDG |
| Treasury key | **Dedicated seed — NOT derived from JWT/app secrets** |
| Admin control | **2-of-3 Safe**: Founder HW + Ops (KeyForge) + Arbiter |

Everything below is the mechanism for closing the gap between those
commitments and what is actually deployed on Linea today.

---

## 1 · Migration phases (must run in order)

Each phase has a script, a list of inputs, and an exit criterion enforced
by `npm run genesis:audit`.

### Phase A — Code-only fixes  ✅ COMPLETE

Removed the `JWT_SECRET` / `BRIDGE_SIWE_JWT_SECRET` / `BRIDGE_INTERNAL_SECRET`
fallback from everywhere the treasury key could be derived:

- [`lib/eth-treasury.js`](../lib/eth-treasury.js) — now throws if
  `TREASURY_PRIVATE_KEY` (or `DEPLOYER_PRIVATE_KEY`) is missing.
- [`lib/brdg-distributor.js`](../lib/brdg-distributor.js) — `hasSecret` gate
  only accepts an explicit dedicated key.
- [`hardhat.config.js`](../hardhat.config.js) and
  [`contracts/hardhat.config.js`](../contracts/hardhat.config.js) — same.

Nothing to execute on-chain. Verified by reading those files; re-running
the audit reflects no change at this layer.

### Phase B — Deploy vesting contracts

Script: [`scripts/deploy-vesting.js`](../scripts/deploy-vesting.js).

Deploys four OpenZeppelin-VestingWallet-based contracts, one per
vesting bucket on the public tokenomics page:

| Contract | File | Cliff | Linear | Total |
|---|---|---|---|---|
| `FounderVesting` | [`contracts/FounderVesting.sol`](../contracts/FounderVesting.sol) | 12 mo | 36 mo | 48 mo |
| `CommunityDistributor` | [`contracts/CommunityDistributor.sol`](../contracts/CommunityDistributor.sol) | 1 mo | 36 mo | 37 mo |
| `TreasuryOpsTimelock` | [`contracts/TreasuryOpsTimelock.sol`](../contracts/TreasuryOpsTimelock.sol) | 3 mo | 36 mo | 39 mo |
| `ReserveLock` | [`contracts/ReserveLock.sol`](../contracts/ReserveLock.sol) | 12 mo (hard unlock) | — | 12 mo |

**Prerequisites** (all `REQUIRED_HUMAN` — fill into `config/genesis-alignment.json` before running):

- `safes.PROTOCOL_SAFE.address` — Gnosis Safe on Linea that will own BRDG + vaults after Phase C1.
- `safes.FOUNDER_SAFE.address`, `safes.COMMUNITY_SAFE.address`, `safes.LP_SAFE.address` — beneficiary Safes.
- `GENESIS_TGE_ISO` env var — ISO-8601 timestamp of Token Generation Event (e.g. `2026-05-01T00:00:00Z`). Vesting `startTimestamp` of every contract is anchored to this one value.

**Run:**

```bash
export DEPLOYER_PRIVATE_KEY=0x...           # dedicated deployer key (not JWT-derived)
export GENESIS_TGE_ISO=2026-05-01T00:00:00Z
npx hardhat compile
npx hardhat run scripts/deploy-vesting.js --network linea
```

On success the script writes the deployed addresses back into
`config/genesis-alignment.json` under `vestingContracts.*` and drops a
per-run receipt into `docs/genesis-alignment/deploy-vesting-<unix>.json`.

**Verify each contract on Lineascan:**

```bash
npx hardhat verify --network linea $FOUNDER_VESTING <beneficiary> <start> <cliffSec> <durationSec>
# …and one call per contract. The constructor args are echoed at deploy time.
```

### Phase C — Safe transaction bundles

Each sub-phase emits a JSON bundle under
`docs/genesis-alignment/safe-bundles/`. Import these into
[Safe Transaction Builder](https://app.safe.global/apps/tx-builder) from
the right Safe, review each tx, then execute.

#### C1 — Ownership migration & burn-exempt

Script: [`scripts/gen-safe-ownership-bundle.js`](../scripts/gen-safe-ownership-bundle.js).

**Signed by the current `BRDG.owner()` — the deployer EOA (`0xAC30…6F64`).**

Bundle order is deliberate:

| # | Tx | Reason |
|---|---|---|
| 1 | `BRDG.setBurnExempt(TreasuryVault, true)` | Fixes the #1 latent bug: vault currently eats 1% on any deposit. Must happen BEFORE ownership moves or the Safe has to re-do it. |
| 2 | `BRDG.setBurnExempt(FounderVesting, true)` | Same reason, for each vesting contract. |
| 3 | `BRDG.setBurnExempt(CommunityDistributor, true)` | " |
| 4 | `BRDG.setBurnExempt(TreasuryOpsTimelock, true)` | " |
| 5 | `BRDG.setBurnExempt(ReserveLock, true)` | " |
| 6 | `BRDG.transferOwnership(PROTOCOL_SAFE)` | Removes single-key mint authority. |
| 7 | `TreasuryVault.transferOwnership(PROTOCOL_SAFE)` | " |
| 8 | `StakingVault.transferOwnership(PROTOCOL_SAFE)` | " |

**Generate:**

```bash
node scripts/gen-safe-ownership-bundle.js
# → docs/genesis-alignment/safe-bundles/ownership-migration.json
```

The deployer EOA is not (yet) a Safe, so the operator can either:
1. Promote the EOA to a single-signer Safe first and import the bundle, or
2. Send the 8 txs sequentially from the EOA using a simple loop script
   (`scripts/gen-safe-ownership-bundle.js` emits raw `to`/`data` pairs that
   any wallet can re-sign).

**Audit after:** `npm run genesis:audit` — hard checks `BRDG.burnExempt(TreasuryVault) == true` and `BRDG.owner == PROTOCOL_SAFE` should flip to pass.

#### C2 — Staking top-up

Script: [`scripts/gen-safe-staking-topup-bundle.js`](../scripts/gen-safe-staking-topup-bundle.js).

Reads `StakingVault`'s current BRDG balance from live Linea and mints the
**exact delta** to 5,000,000 BRDG — the genesis §1A TGE amount. If the
vault is already ≥ 5M, the script refuses.

**Signed by PROTOCOL_SAFE** (the new `BRDG.owner()` after C1).

```bash
node scripts/gen-safe-staking-topup-bundle.js
# → docs/genesis-alignment/safe-bundles/staking-topup.json
```

**Audit after:** `StakingVault.balance >= 5M` check flips to pass.

#### C3 — Liquidity seed

Script: [`scripts/gen-safe-liquidity-bundle.js`](../scripts/gen-safe-liquidity-bundle.js).

Emits a two-tx bundle — `mint(PROTOCOL_SAFE, 10_000 BRDG)` +
`approve(SyncSwapRouter, 10_000 BRDG)`. The final `addLiquidity` call is
**not encoded** — see the note below.

**Required config:** add the official SyncSwap router on Linea to
`config.syncSwap.router`. Do NOT guess it; confirm from SyncSwap's own docs
and commit separately.

**Why the router call is left manual:** the SyncSwap router ABI varies
between classic/stable/concentrated pools and across versions. Encoding a
call with the wrong ABI would silently lose the 10k BRDG + 1 ETH seed.
Instead the operator finishes in the SyncSwap UI from `PROTOCOL_SAFE` via
WalletConnect — "Add Liquidity" on the existing BRDG/ETH pool, LP tokens
to `LP_SAFE`.

### Phase D — Validate (run after every phase)

```bash
npm run genesis:audit
```

Reads live Linea state, writes:
- `docs/genesis-alignment/audit-latest.json` (agent-readable)
- `docs/genesis-alignment/audit-latest.md` (human-readable)

Exit code reflects hard-fail count. A clean migration ends with exit 0
and `verdict: PASS`.

---

## 2 · Quickstart (operator cheat sheet)

```bash
# 1. Clone & install
git checkout <this-branch>
npm ci
npx hardhat compile

# 2. Baseline audit (expected: 3 hard fails pre-migration)
npm run genesis:audit

# 3. Create Safes on app.safe.global (Network: Linea), fill into
#    config/genesis-alignment.json → safes.*
$EDITOR config/genesis-alignment.json

# 4. Phase B: deploy vesting
export DEPLOYER_PRIVATE_KEY=0x...
export GENESIS_TGE_ISO=2026-05-01T00:00:00Z
npx hardhat run scripts/deploy-vesting.js --network linea

# 5. Verify vesting contracts on Lineascan
npx hardhat verify --network linea $FOUNDER_VESTING ...
# (repeat for the other three)

# 6. Phase C1: ownership + burn-exempt bundle
node scripts/gen-safe-ownership-bundle.js
# import docs/genesis-alignment/safe-bundles/ownership-migration.json
# into Safe Tx Builder, signed by the current deployer EOA
npm run genesis:audit      # re-validate

# 7. Phase C2: staking top-up
node scripts/gen-safe-staking-topup-bundle.js
# import staking-topup.json into Safe Tx Builder, signed by PROTOCOL_SAFE
npm run genesis:audit

# 8. Phase C3: liquidity seed
#    First, add official SyncSwap router address to config.syncSwap.router
node scripts/gen-safe-liquidity-bundle.js
# mint + approve from Safe, then Add Liquidity via SyncSwap UI
npm run genesis:audit      # should now be PASS
```

---

## 3 · What the audit checks (enforced invariants)

See [`scripts/audit-genesis-alignment.js`](../scripts/audit-genesis-alignment.js)
for the source of truth. Every check has a `severity` of `hard` (blocks
PR merge) or `soft` (informational).

| Layer | Check |
|---|---|
| Network | chainId == 59144 (Linea) |
| Bytecode | each of BRDG, TreasuryVault, StakingVault, DEXPool, FounderVesting, CommunityDistributor, TreasuryOpsTimelock, ReserveLock has non-empty bytecode |
| BRDG | `symbol == BRDG`, `decimals == 18`, `MAX_SUPPLY == 100,000,000e18`, `BURN_BPS == 100` |
| BRDG owner | `owner == PROTOCOL_SAFE` (after C1) |
| TreasuryVault | brdg pointer matches, split bps == 4000/2500/2000/1500, `burnExempt == true` |
| StakingVault | brdg pointer matches, `burnExempt == true`, balance ≥ 5,000,000 BRDG |
| Vesting | each deployed vesting contract is burn-exempt |
| Deployer EOA | balance == 0 BRDG after C1 (soft until C1 status == COMPLETE) |
| SyncSwap pool | balance ≥ 10,000 BRDG |
| Legacy | superseded BRDG and TreasuryVault predecessors hold 0 BRDG |

---

## 4 · Files in this alignment

| Path | Purpose |
|---|---|
| [`config/genesis-alignment.json`](../config/genesis-alignment.json) | Typed config — provenance-tagged source of truth |
| [`scripts/audit-genesis-alignment.js`](../scripts/audit-genesis-alignment.js) | Read-only on-chain audit (Phase D) |
| [`scripts/deploy-vesting.js`](../scripts/deploy-vesting.js) | Vesting deploy (Phase B) |
| [`scripts/gen-safe-ownership-bundle.js`](../scripts/gen-safe-ownership-bundle.js) | Phase C1 Safe bundle |
| [`scripts/gen-safe-staking-topup-bundle.js`](../scripts/gen-safe-staking-topup-bundle.js) | Phase C2 Safe bundle |
| [`scripts/gen-safe-liquidity-bundle.js`](../scripts/gen-safe-liquidity-bundle.js) | Phase C3 Safe bundle |
| [`contracts/FounderVesting.sol`](../contracts/FounderVesting.sol) | 12-mo cliff, 36-mo linear |
| [`contracts/CommunityDistributor.sol`](../contracts/CommunityDistributor.sol) | 1-mo cliff, 36-mo linear |
| [`contracts/TreasuryOpsTimelock.sol`](../contracts/TreasuryOpsTimelock.sol) | 3-mo cliff, 36-mo linear |
| [`contracts/ReserveLock.sol`](../contracts/ReserveLock.sol) | 12-mo hard timelock |
| `docs/genesis-alignment/audit-latest.json` | Latest audit (machine) |
| `docs/genesis-alignment/audit-latest.md` | Latest audit (human) |
| `docs/genesis-alignment/safe-bundles/*.json` | Per-phase Safe bundles |
| `docs/genesis-alignment/deploy-vesting-<unix>.json` | Per-run deploy receipts |

---

## 5 · Open items still requiring human input

Blocking further progress:

| Item | Why | How to resolve |
|---|---|---|
| `safes.PROTOCOL_SAFE.address` | Needed by B, C1, C2, C3 | Create 2-of-3 or 3-of-5 Safe at [app.safe.global](https://app.safe.global/) on Linea. Paste the address into the config. |
| `safes.FOUNDER_SAFE.address` | Beneficiary of FounderVesting | Same. Recommend HW-wallet-backed signers. |
| `safes.LP_SAFE.address` | LP-token custody, vested liquidity reserve | Same. |
| `safes.COMMUNITY_SAFE.address` | Operates CommunityDistributor | Same. |
| `GENESIS_TGE_ISO` | Vesting anchor | Decide the TGE date. Every contract's cliff starts from this. Once chosen, do NOT change. |
| `syncSwap.router` | Phase C3 approve target | Read it from SyncSwap's own published docs. Commit as a separate, reviewed change. |

Non-blocking but tracked:

- The marketing page (`public/tokenomics.html`) should be re-reviewed against
  the deployed vesting contracts once Phase B completes — specifically the
  "Liquidity & Market Making" 50% TGE claim (10M) needs either (a) a second
  vesting contract for the remaining 10M, or (b) an explicit edit of the
  tokenomics page if the plan has changed.
- Buyback engine (`services/buyback-engine.js`), UBI distributor, and the
  task-fee router need operational-liveness confirmation separately — they
  are out of scope for this alignment (code exists, but runtime verification
  is a separate task).
