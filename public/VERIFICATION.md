# Bridge AI OS — Third-Party Verification Methodology

## Overview

Every metric displayed on the Bridge AI OS Revenue Dashboard is independently
verifiable. This document describes how an external auditor, investor, or
regulator can prove each metric without trusting the system operator.

## Trust Levels

| Level | Meaning | Who can verify |
|-------|---------|---------------|
| **Trustless (On-chain)** | Value read directly from a public blockchain | Anyone with an RPC endpoint |
| **Hash-chain** | Value derived from a tamper-evident chain of SHA-256 hashes | Anyone with API access |
| **Signed attestation** | Value signed with HMAC-SHA256; verifiable with operator key | Auditors with shared secret |

---

## 1. BRDG Token Supply

**Trust level:** Trustless (on-chain)

**Displayed value:** Total BRDG tokens in circulation

**How to verify:**
1. Go to https://lineascan.build/token/0x5f0541302bd4fC672018b07a35FA5f294A322947#readContract
2. Call `totalSupply()` — returns uint256 with 18 decimals
3. Divide result by 10^18 for human-readable BRDG amount
4. Or use any Linea RPC (https://rpc.linea.build):
   ```
   eth_call({to: "0x5f0541302bd4fC672018b07a35FA5f294A322947", data: "0x18160ddd"})
   ```

**API endpoint:** `GET /api/metrics/token`

---

## 2. BRDG Burned

**Trust level:** Trustless (on-chain)

**Displayed value:** Total BRDG burned via 1% transfer tax

**How to verify:**
1. Same contract on LineaScan → `totalBurned()` function
2. Function selector: `0xd89135cd`
3. Cross-reference with Transfer events to address(0)

---

## 3. Treasury Vault ETH Balance

**Trust level:** Trustless (on-chain)

**Displayed value:** ETH held in the TreasuryVault contract

**How to verify:**
1. Go to https://lineascan.build/address/0xDb8d8ca8A65d36eFbD5C84C145B58Ee62C872d88
2. The balance shown IS the vault ETH balance
3. Call `bucketBalances()` to see the 4-way split (ops/liquidity/reserve/founder)

---

## 4. Treasury BRDG Balance

**Trust level:** Trustless (on-chain)

**Displayed value:** BRDG tokens held by the treasury wallet

**How to verify:**
1. Call `balanceOf("0xAC301f984556c11ecf3818CaA6020d11c8616F64")` on BRDG contract
2. Or check: https://lineascan.build/token/0x5f0541302bd4fC672018b07a35FA5f294A322947?a=0xAC301f984556c11ecf3818CaA6020d11c8616F64

---

## 5. Fiat Treasury Balance (ZAR)

**Trust level:** Signed attestation

**Displayed value:** Off-chain fiat balance in South African Rand

**How to verify:**
1. Obtain `BRIDGE_VERIFY_SECRET` from the system operator via secure channel
2. Derive the attestation key:
   ```
   key = HMAC-SHA256(secret, "bridge-zero-trust:attestation")
   ```
3. Fetch `GET /api/metrics/treasury`
4. Extract the `offChain` attestation object
5. Reconstruct the canonical string:
   ```
   "treasury.fiat.balance|<value_json>|signed-internal|<reconciliationRef>|<timestamp>"
   ```
6. Compute `HMAC-SHA256(key, canonical)` and compare to `signature` field
7. Cross-reference with PayFast/Paystack payment processor records

---

## 6. Revenue (Month-to-Date)

**Trust level:** Hash-chain

**Displayed value:** Total revenue received this month

**How to verify:**
1. Fetch `GET /api/proofs/payments` — returns all payment proofs
2. For each proof, recompute the SHA-256 hash:
   ```
   SHA-256("transaction_id|amount|currency|source|timestamp|previous_hash")
   ```
3. Verify each `tx_hash` matches the recomputed hash
4. Verify each `previous_hash` matches the prior transaction's `tx_hash`
5. The chain must be continuous from the genesis (all-zero previous_hash)
6. Sum the amounts — this IS the verified revenue
7. Or use `GET /api/verify/chain` for automated chain integrity check

---

## 7. Individual Payment Verification

**Trust level:** Hash-chain + webhook signature

**How to verify a specific payment:**
1. Fetch `GET /api/verify/payment/<transaction_id>`
2. Response includes:
   - `txHash` — SHA-256 of canonical payment fields
   - `previousHash` — link to prior transaction
   - `proofSignature` — HMAC signature over the hash
   - `merkleInclusion` — Merkle proof if batch-anchored
3. Recompute the hash yourself and verify it matches
4. For PayFast payments: cross-reference with PayFast's IPN logs

---

## 8. API Response Integrity

**Trust level:** Signed attestation

Every API response from `/api/metrics/*` includes a `_proof` envelope:

```json
{
  "data": { ... },
  "_proof": {
    "signature": "hex HMAC-SHA256",
    "timestamp": 1712764800000,
    "keyId": "first 16 chars of key fingerprint",
    "algorithm": "HMAC-SHA256",
    "purpose": "api-response"
  }
}
```

**How to verify:**
1. Derive the response signing key:
   ```
   key = HMAC-SHA256(secret, "bridge-zero-trust:api-response")
   ```
2. Canonicalize the `data` object (sort keys, stringify, no whitespace)
3. Compute: `HMAC-SHA256(key, "<timestamp>.<canonical_json>")`
4. Compare to `_proof.signature`
5. Or POST the entire envelope to `/api/verify/response`

---

## 9. Merkle Anchoring (Optional On-chain Proof)

Payment proofs can be batch-anchored to the blockchain:

1. A Merkle root is computed over a batch of transaction hashes
2. The root is stored in the `merkle_anchors` table
3. Optionally submitted as an on-chain transaction
4. Any individual payment can produce a Merkle inclusion proof

**How to verify Merkle inclusion:**
1. Fetch `GET /api/verify/payment/<id>` — includes `merkleInclusion`
2. Walk the proof path: at each level, hash(left + right)
3. The final hash must equal the published Merkle root
4. If anchored on-chain: verify the root matches the chain transaction

---

## Contract Addresses

| Contract | Address | Explorer |
|----------|---------|----------|
| BRDG Token | `0x5f0541302bd4fC672018b07a35FA5f294A322947` | [LineaScan](https://lineascan.build/token/0x5f0541302bd4fC672018b07a35FA5f294A322947) |
| TreasuryVault | `0xDb8d8ca8A65d36eFbD5C84C145B58Ee62C872d88` | [LineaScan](https://lineascan.build/address/0xDb8d8ca8A65d36eFbD5C84C145B58Ee62C872d88) |
| Treasury Wallet | `0xAC301f984556c11ecf3818CaA6020d11c8616F64` | [LineaScan](https://lineascan.build/address/0xAC301f984556c11ecf3818CaA6020d11c8616F64) |

**Chain:** Linea Mainnet (chainId: 59144)
**RPC:** https://rpc.linea.build
**Source verification:** https://repo.sourcify.dev/contracts/full_match/59144/0x5f0541302bd4fC672018b07a35FA5f294A322947/

---

## API Reference

| Endpoint | Method | Returns |
|----------|--------|---------|
| `/api/metrics/token` | GET | On-chain token stats + verification links |
| `/api/metrics/treasury` | GET | Hybrid on-chain + signed fiat balance |
| `/api/metrics/revenue` | GET | Revenue derived from proof chain |
| `/api/metrics/vault` | GET | Vault bucket balances (on-chain) |
| `/api/verify/payment/:id` | GET | Individual payment proof + Merkle inclusion |
| `/api/verify/chain` | GET | Full chain integrity verification |
| `/api/verify/info` | GET | Public verification metadata + key IDs |
| `/api/verify/response` | POST | Verify a signed API response envelope |
| `/api/proofs/payments` | GET | All payment proofs (paginated) |
| `/api/proofs/merkle` | POST | Create Merkle anchor from unanchored proofs |
