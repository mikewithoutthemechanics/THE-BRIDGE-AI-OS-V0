# BRDG Genesis Alignment Audit

Generated: 2026-04-21T20:29:20.863Z
Network: linea (chainId 59144) @ block 30323684

**Verdict: FAIL** — 18/27 checks passed (3 hard fails, 6 soft fails).

## Checks

| Severity | Pass | Check | Actual | Expected |
|---|---|---|---|---|
| hard | yes | network.chainId matches config | `59144` | `59144` |
| hard | yes | BRDG has bytecode | `2962 bytes` | `> 0 bytes` |
| hard | yes | TreasuryVault has bytecode | `3790 bytes` | `> 0 bytes` |
| hard | yes | StakingVault has bytecode | `3761 bytes` | `> 0 bytes` |
| hard | yes | DEXPool has bytecode | `16769 bytes` | `> 0 bytes` |
| hard | yes | BRDG.symbol | `BRDG` | `BRDG` |
| hard | yes | BRDG.decimals | `18` | `18` |
| hard | yes | BRDG.MAX_SUPPLY == genesis maxSupplyBRDG | `100000000000000000000000000` | `100000000000000000000000000` |
| hard | yes | BRDG.BURN_BPS == genesis taskFeeBurnBps | `100` | `100` |
| soft | NO | BRDG.owner is not yet PROTOCOL_SAFE (safe unset in config) | `0xAC301f984556c11ecf3818CaA6020d11c8616F64` | `a Gnosis Safe address` |
| hard | yes | TreasuryVault.brdg == BRDG | `0x6ee9fb40b97139eeec406c096393e0b53c89975f` | `0x6ee9fb40b97139eeec406c096393e0b53c89975f` |
| hard | yes | TreasuryVault.OPS_BPS | `4000` | `4000` |
| hard | yes | TreasuryVault.LIQ_BPS | `2500` | `2500` |
| hard | yes | TreasuryVault.RESERVE_BPS | `2000` | `2000` |
| hard | yes | TreasuryVault.FOUNDER_BPS | `1500` | `1500` |
| hard | NO | BRDG.burnExempt(TreasuryVault) == true | `false` | `true` |
| hard | yes | StakingVault.brdg == BRDG | `0x6ee9fb40b97139eeec406c096393e0b53c89975f` | `0x6ee9fb40b97139eeec406c096393e0b53c89975f` |
| hard | yes | BRDG.burnExempt(StakingVault) == true | `true` | `true` |
| hard | NO | StakingVault.balance >= genesis initialStakingPoolBRDG (5M) | `500000.0 BRDG` | `>= 5000000 BRDG` |
| soft | NO | FounderVesting deployed | `null` | `deployed address` |
| soft | NO | CommunityDistributor deployed | `null` | `deployed address` |
| soft | NO | TreasuryOpsTimelock deployed | `null` | `deployed address` |
| soft | NO | ReserveLock deployed | `null` | `deployed address` |
| soft | NO | Deployer EOA drained (balance == 0 after migration) | `9494999.0 BRDG` | `0 BRDG` |
| hard | NO | SyncSwap pool has >= genesis initialLiquidity.brdg (10000) | `0.0 BRDG` | `>= 10000 BRDG` |
| soft | yes | Legacy/superseded 0x5f0541302bd4fC672018b07a35FA5f294A322947 holds 0 BRDG | `0.0 BRDG` | `0 BRDG` |
| soft | yes | Legacy/superseded 0xDb8d8ca8A65d36eFbD5C84C145B58Ee62C872d88 holds 0 BRDG | `0.0 BRDG` | `0 BRDG` |

## Snapshot

```json
{
  "network": {
    "name": "linea",
    "chainId": 59144,
    "rpc": "https://rpc.linea.build",
    "explorer": "https://lineascan.build",
    "provenance": "AUTO"
  },
  "generatedAt": "2026-04-21T20:29:20.863Z",
  "balances": {
    "deployerEOA": {
      "address": "0xAC301f984556c11ecf3818CaA6020d11c8616F64",
      "brdg": "9494999.0",
      "brdgRaw": "9494999000000000000000000"
    },
    "dexPool": {
      "address": "0x1873b75Fc9e85ef693B4Bcaa2a1e5C5Cef4c1F81",
      "brdg": "0.0"
    }
  },
  "contracts": {
    "BRDG": {
      "address": "0x6Ee9Fb40b97139EEEc406c096393e0b53C89975f",
      "codeSize": 2962,
      "name": "Bridge AI",
      "symbol": "BRDG",
      "decimals": 18,
      "totalSupply": "10000000.0",
      "totalSupplyRaw": "10000000000000000000000000",
      "maxSupply": "100000000.0",
      "maxSupplyRaw": "100000000000000000000000000",
      "burnBps": 100,
      "totalBurned": "0.0",
      "owner": "0xAC301f984556c11ecf3818CaA6020d11c8616F64"
    },
    "TreasuryVault": {
      "address": "0x6daA8db214B7c7D95fB26d98c4Fc4DE82430572A",
      "codeSize": 3790,
      "owner": "0xAC301f984556c11ecf3818CaA6020d11c8616F64",
      "brdg": "0x6Ee9Fb40b97139EEEc406c096393e0b53C89975f",
      "splitBps": {
        "ops": 4000,
        "liquidity": 2500,
        "reserve": 2000,
        "founder": 1500
      },
      "buckets": {
        "ops": "0.0",
        "liquidity": "0.0",
        "reserve": "0.0",
        "founder": "0.0"
      },
      "brdgBalance": "0.0",
      "burnExempt": false
    },
    "StakingVault": {
      "address": "0x51eaaAAB3Fa6b62811ba8F4bcd674dc6D121A9bB",
      "codeSize": 3761,
      "owner": "0xAC301f984556c11ecf3818CaA6020d11c8616F64",
      "brdg": "0x6Ee9Fb40b97139EEEc406c096393e0b53C89975f",
      "brdgBalance": "500000.0",
      "brdgBalanceRaw": "500000000000000000000000",
      "burnExempt": true
    },
    "DEXPool": {
      "address": "0x1873b75Fc9e85ef693B4Bcaa2a1e5C5Cef4c1F81",
      "codeSize": 16769
    }
  },
  "blockNumber": 30323684
}
```
