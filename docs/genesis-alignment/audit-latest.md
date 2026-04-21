# BRDG Genesis Alignment Audit

Generated: 2026-04-21T21:20:18.907Z
Network: linea (chainId 59144) @ block 30324144

**Verdict: FAIL** — 35/36 checks passed (1 hard fails, 0 soft fails).

## Checks

| Severity | Pass | Check | Actual | Expected |
|---|---|---|---|---|
| hard | yes | network.chainId matches config | `59144` | `59144` |
| hard | yes | BRDG has bytecode | `2962 bytes` | `> 0 bytes` |
| hard | yes | TreasuryVault has bytecode | `4711 bytes` | `> 0 bytes` |
| hard | yes | StakingVault has bytecode | `3761 bytes` | `> 0 bytes` |
| hard | yes | DEXPool has bytecode | `16769 bytes` | `> 0 bytes` |
| hard | yes | BRDG.symbol | `BRDG` | `BRDG` |
| hard | yes | BRDG.decimals | `18` | `18` |
| hard | yes | BRDG.MAX_SUPPLY == genesis maxSupplyBRDG | `100000000000000000000000000` | `100000000000000000000000000` |
| hard | yes | BRDG.BURN_BPS == genesis taskFeeBurnBps | `100` | `100` |
| hard | yes | BRDG.owner == PROTOCOL_SAFE | `0xac301f984556c11ecf3818caa6020d11c8616f64` | `0xac301f984556c11ecf3818caa6020d11c8616f64` |
| hard | yes | TreasuryVault.brdg == BRDG | `0x6ee9fb40b97139eeec406c096393e0b53c89975f` | `0x6ee9fb40b97139eeec406c096393e0b53c89975f` |
| hard | yes | TreasuryVault.OPS_BPS | `4000` | `4000` |
| hard | yes | TreasuryVault.LIQ_BPS | `2500` | `2500` |
| hard | yes | TreasuryVault.RESERVE_BPS | `2000` | `2000` |
| hard | yes | TreasuryVault.FOUNDER_BPS | `1500` | `1500` |
| hard | yes | BRDG.burnExempt(TreasuryVault) == true | `true` | `true` |
| hard | yes | TreasuryVault.owner == PROTOCOL_SAFE | `0xac301f984556c11ecf3818caa6020d11c8616f64` | `0xac301f984556c11ecf3818caa6020d11c8616f64` |
| hard | yes | TreasuryVault.brdgBuckets total == balanceOf(TreasuryVault) (classify() ran) | `10000000.0 BRDG tracked of 10000000.0 held` | `buckets total == balance` |
| hard | yes | TreasuryVault.balance >= genesis initialTreasuryMintBRDG (10M) | `10000000.0 BRDG` | `>= 10000000 BRDG` |
| soft | yes | Legacy TreasuryVault v1 stuck balance matches documented reserve | `10000000.0 BRDG` | `10000000 BRDG (permanently stuck)` |
| hard | yes | StakingVault.brdg == BRDG | `0x6ee9fb40b97139eeec406c096393e0b53c89975f` | `0x6ee9fb40b97139eeec406c096393e0b53c89975f` |
| hard | yes | BRDG.burnExempt(StakingVault) == true | `true` | `true` |
| hard | yes | StakingVault.balance >= genesis initialStakingPoolBRDG (5M) | `5000000.0 BRDG` | `>= 5000000 BRDG` |
| hard | yes | StakingVault.owner == PROTOCOL_SAFE | `0xac301f984556c11ecf3818caa6020d11c8616f64` | `0xac301f984556c11ecf3818caa6020d11c8616f64` |
| hard | yes | FounderVesting has bytecode | `2539 bytes` | `> 0 bytes` |
| hard | yes | BRDG.burnExempt(FounderVesting) == true | `true` | `true` |
| hard | yes | CommunityDistributor has bytecode | `2539 bytes` | `> 0 bytes` |
| hard | yes | BRDG.burnExempt(CommunityDistributor) == true | `true` | `true` |
| hard | yes | TreasuryOpsTimelock has bytecode | `2539 bytes` | `> 0 bytes` |
| hard | yes | BRDG.burnExempt(TreasuryOpsTimelock) == true | `true` | `true` |
| hard | yes | ReserveLock has bytecode | `2382 bytes` | `> 0 bytes` |
| hard | yes | BRDG.burnExempt(ReserveLock) == true | `true` | `true` |
| soft | yes | Deployer EOA drained (balance == 0 after migration) | `0.0 BRDG` | `0 BRDG` |
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
  "generatedAt": "2026-04-21T21:20:18.907Z",
  "balances": {
    "deployerEOA": {
      "address": "0xAC301f984556c11ecf3818CaA6020d11c8616F64",
      "brdg": "0.0",
      "brdgRaw": "0"
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
      "totalSupply": "70005001.0",
      "totalSupplyRaw": "70005001000000000000000000",
      "maxSupply": "100000000.0",
      "maxSupplyRaw": "100000000000000000000000000",
      "burnBps": 100,
      "totalBurned": "0.0",
      "owner": "0xAC301f984556c11ecf3818CaA6020d11c8616F64"
    },
    "TreasuryVault": {
      "address": "0x76C2171D5f100c0871aDe67d848E5B516E9d346E",
      "codeSize": 4711,
      "owner": "0xAC301f984556c11ecf3818CaA6020d11c8616F64",
      "brdg": "0x6Ee9Fb40b97139EEEc406c096393e0b53C89975f",
      "splitBps": {
        "ops": 4000,
        "liquidity": 2500,
        "reserve": 2000,
        "founder": 1500
      },
      "buckets": {
        "ops": "4000000.0",
        "liquidity": "2500000.0",
        "reserve": "2000000.0",
        "founder": "1500000.0"
      },
      "brdgBalance": "10000000.0",
      "burnExempt": true
    },
    "StakingVault": {
      "address": "0x51eaaAAB3Fa6b62811ba8F4bcd674dc6D121A9bB",
      "codeSize": 3761,
      "owner": "0xAC301f984556c11ecf3818CaA6020d11c8616F64",
      "brdg": "0x6Ee9Fb40b97139EEEc406c096393e0b53C89975f",
      "brdgBalance": "5000000.0",
      "brdgBalanceRaw": "5000000000000000000000000",
      "burnExempt": true
    },
    "DEXPool": {
      "address": "0x1873b75Fc9e85ef693B4Bcaa2a1e5C5Cef4c1F81",
      "codeSize": 16769
    },
    "TreasuryVault_legacy_v1": {
      "address": "0x6daA8db214B7c7D95fB26d98c4Fc4DE82430572A",
      "brdgBalance": "10000000.0"
    },
    "FounderVesting": {
      "address": "0x57FfFCEaE127149dbDaf48431D934362FE8485b7",
      "codeSize": 2539,
      "beneficiary": "0xAC301f984556c11ecf3818CaA6020d11c8616F64",
      "start": 1776805662,
      "startIso": "2026-04-21T21:07:42.000Z",
      "duration": 124416000,
      "brdgBalance": "10000000.0",
      "burnExempt": true
    },
    "CommunityDistributor": {
      "address": "0xdadEB2a9562B251AA33644896D5b6B22104a0f3C",
      "codeSize": 2539,
      "beneficiary": "0xAC301f984556c11ecf3818CaA6020d11c8616F64",
      "start": 1776805662,
      "startIso": "2026-04-21T21:07:42.000Z",
      "duration": 95904000,
      "brdgBalance": "15000000.0",
      "burnExempt": true
    },
    "TreasuryOpsTimelock": {
      "address": "0x763b504Aff3cF181dfF712E2bc07b6f68f2777F9",
      "codeSize": 2539,
      "beneficiary": "0x6daA8db214B7c7D95fB26d98c4Fc4DE82430572A",
      "start": 1776805662,
      "startIso": "2026-04-21T21:07:42.000Z",
      "duration": 101088000,
      "brdgBalance": "15000000.0",
      "burnExempt": true
    },
    "ReserveLock": {
      "address": "0xF173122C8FeBF48219404fDb34462560d29A2E6a",
      "codeSize": 2382,
      "beneficiary": "0xAC301f984556c11ecf3818CaA6020d11c8616F64",
      "start": 1807909662,
      "startIso": "2027-04-16T21:07:42.000Z",
      "duration": 0,
      "brdgBalance": "5000000.0",
      "burnExempt": true
    }
  },
  "blockNumber": 30324144
}
```
