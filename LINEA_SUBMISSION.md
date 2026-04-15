# Linea Ecosystem Submission — Bridge AI OS / BRDG

**Status:** Ready after Gate A (deploy) + Gate B (contract verification) complete.
**Prepared:** 2026-04-14

---

## Gate A — Site verification

Automated by the `fix(site,treasury,sse,ehsa)` commit pushed to main on 2026-04-14.
CI deploys the repo to `/var/www/bridgeai` on the VPS on every push.

**Verify after CI finishes (~2–5 min post-push):**

```bash
curl -sI https://bridge-ai-os.com/tokenomics | head -1
curl -s  https://bridge-ai-os.com/tokenomics | grep -c 0x6Ee9Fb40b97139EEEc406c096393e0b53C89975f
curl -s  https://bridge-ai-os.com/tokenomics | grep -c 0x6daA8db214B7c7D95fB26d98c4Fc4DE82430572A
curl -s  https://bridge-ai-os.com/tokenomics | grep -c 0xF22Bc18487764FEe106ca5Fb2EE27b11FDcB3756  # must be 0
```

All four must pass (200, ≥1, ≥1, 0) before proceeding.

---

## Gate B — Lineascan contract verification

**Blocking.** Linea will not approve an ecosystem listing pointing to unverified bytecode. As of 2026-04-14 the contract at `0x6daA8db214B7c7D95fB26d98c4Fc4DE82430572A` shows bytecode-only on Lineascan.

### Prerequisites

```bash
# In ./contracts directory
export LINEASCAN_API_KEY=<your_lineascan_api_key>   # get from https://lineascan.build/myapikey
export DEPLOYER_PRIVATE_KEY=<key_for_0xAC301f98...>  # not strictly needed for verify, but config reads it
```

### Verify commands

```bash
cd contracts

# 1. BRDG Token — constructor(address treasury)
npx hardhat verify --network linea \
  0x6Ee9Fb40b97139EEEc406c096393e0b53C89975f \
  0xAC301f984556c11ecf3818CaA6020d11c8616F64

# 2. TreasuryVault — constructor(address _brdg)
npx hardhat verify --network linea \
  0x6daA8db214B7c7D95fB26d98c4Fc4DE82430572A \
  0x6Ee9Fb40b97139EEEc406c096393e0b53C89975f

# 3. StakingVault — constructor(address _brdg)
npx hardhat verify --network linea \
  0x51eaaAAB3Fa6b62811ba8F4bcd674dc6D121A9bB \
  0x6Ee9Fb40b97139EEEc406c096393e0b53C89975f
```

**Verify success criteria:** each command ends with `Successfully verified contract ... on the block explorer.` and the Lineascan page shows a green "Contract" tab with readable Solidity source.

### If verify fails

- `Bytecode not match` → compiler settings mismatch. Check `solidity.version` and `optimizer.runs` in `hardhat.config.js` match what was used at deploy time (currently `0.8.20` / `runs: 200`).
- `Already verified` → skip that contract.
- `Invalid API Key` → regenerate at https://lineascan.build/myapikey.
- Rate limit → wait 60 seconds, retry.

---

## Submission form fields

Form URL: **https://linea.build/hub/apply** (or the current "Get Listed" / "Ecosystem application" entry on https://linea.build/ecosystem).

| Field | Value |
|---|---|
| Project name | Bridge AI OS |
| Token ticker | BRDG |
| One-line description | Autonomous agent economy on Linea — fixed-supply utility token backing an on-chain treasury with deflationary burn and perpetual liquidity reinvestment. |
| Website | https://bridge-ai-os.com |
| Tokenomics page | https://bridge-ai-os.com/tokenomics |
| Category | Infrastructure / DeFi / AI |
| Chain | Linea Mainnet (59144) |
| BRDG contract | `0x6Ee9Fb40b97139EEEc406c096393e0b53C89975f` |
| TreasuryVault contract | `0x6daA8db214B7c7D95fB26d98c4Fc4DE82430572A` |
| StakingVault contract | `0x51eaaAAB3Fa6b62811ba8F4bcd674dc6D121A9bB` |
| Liquidity venue | SyncSwap BRDG/ETH — `0x1873b75Fc9e85ef693B4Bcaa2a1e5c5Cef4c1F81` |
| Deployer | `0xAC301f984556c11ecf3818CaA6020d11c8616F64` |
| Max supply | 100,000,000 BRDG (hard cap, enforced on-chain) |
| Circulating at TGE | 10,000,000 BRDG (10%) |
| Burn mechanism | 1% per transfer, treasury + DEX pools exempt |
| Treasury split (on-chain) | Ops 40% / Liquidity 25% / Reserve 20% / Founders 15% — enforced in TreasuryVault.sol |
| Audit status | Not yet formally audited; contracts are minimal (~300 LOC), use OpenZeppelin v5 primitives, and will be verified on Lineascan before submission |
| Team | Empeleni Health Services Africa (Pty) Ltd t/a Bridge AI |
| Jurisdiction | South Africa |
| Contact | (your email) |
| Socials | (GitHub: bridgeaios/THE-BRIDGE-AI-OS-V0; X/Telegram if available) |

---

## Assets to prepare

- **Logo** 256×256 PNG on transparent background — `public/favicon.svg` can be rasterised if no dedicated logo exists
- **Banner** 1200×630 for OG/preview — check `public/tokenomics.html` OG tags for existing asset
- **Short demo video or GIF** (optional but strongly recommended) — 30–60s walkthrough of tokenomics page + treasury dashboard + brain status widget
- **Pitch deck / one-pager PDF** (optional)

---

## Pre-submission checklist

- [ ] Gate A: `bridge-ai-os.com/tokenomics` shows v2 addresses (run curl checks above)
- [ ] Gate A: zero occurrences of `0xF22Bc18...` or `0x5f054...` on the live site
- [ ] Gate B: BRDG verified on Lineascan (green "Contract" tab)
- [ ] Gate B: TreasuryVault verified on Lineascan
- [ ] Gate B: StakingVault verified on Lineascan
- [ ] DEX pool `0x1873b75F...` has non-zero BRDG + ETH liquidity visible on Lineascan
- [ ] Brain status widget visible bottom-left on public pages
- [ ] SSE `/events/stream` endpoints tolerate 100s idle behind Cloudflare (test with a 2-minute curl)
- [ ] Socials + contact email finalised
- [ ] Logo + banner assets ready

Only submit after **every** box is checked. A rejected submission takes weeks to reopen.
