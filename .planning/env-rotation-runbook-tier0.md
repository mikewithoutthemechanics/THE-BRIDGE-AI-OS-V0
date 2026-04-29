# Tier-0 Rotation Runbook

Per-var rotation procedure for the 12 nuclear vars. Follows the [scripts/rotate-supabase.sh](../scripts/rotate-supabase.sh) pattern: silent stdin, shape check, chmod-600 canonical file, fingerprint to `.claude/state/prime-ops.json`.

**Canonical secret storage:** `/c/aoe-unified-final/.env.*` (one file per secret, `chmod 600`, gitignored).
**Propagation:** after each rotation, restart affected PM2 services (see per-var section).
**Fingerprinting:** never write the full value anywhere other than the `.env.*` file. Record only `prefix[0:12]` + `length` in state.

---

## Pre-flight checklist (every rotation)

```bash
# 1. confirm no rotation currently in progress
jq '.tier0_rotations[-1]' c:/aoe-unified-final-main/.claude/state/prime-ops.json 2>/dev/null

# 2. confirm active PM2 processes
ssh root@bridge-ai-os.com 'pm2 jlist | jq -r ".[].name"'

# 3. export ISO timestamp for record
export ROTATE_AT="$(date -u '+%Y-%m-%dT%H:%MZ')"
```

---

## 1. `BRIDGE_INTERNAL_SECRET`

**Leak impact:** total authz bypass in `_require_auth`. Any caller with this secret is treated as internal service.

- **Generate:** `openssl rand -hex 48` (96 hex chars = 384 bits)
- **Store:** `/c/aoe-unified-final/.env.bridge-internal` (chmod 600)
- **Consumers:** `gateway.js`, `middleware/auth.js`, `auth.js`, `brain.js`
- **Propagation:** restart `pm2 restart gateway brain auth` on VPS
- **Validation:** `curl -H "x-bridge-internal: $NEW" https://bridge-ai-os.com/api/_internal/healthz` → 200
- **Rollback:** keep old value in `.env.bridge-internal.prev` for 1 epoch (10 min) in case PM2 rollout fails mid-flight

## 2. `JWT_SECRET` / `JWT_REFRESH_SECRET`

**Leak impact:** attacker can mint arbitrary session tokens.

- **Generate:** `openssl rand -base64 64` per secret
- **Store:** `/c/aoe-unified-final/.env.jwt` (both vars)
- **Consumers:** `auth.js`, `middleware/auth.js`, `lib/wp-auth.js`
- **Propagation:** PM2 restart + **expect all users logged out**. Schedule in low-traffic window.
- **Validation:** login flow end-to-end; verify old JWT returns 401
- **Paired rotation:** rotate `BRIDGE_SIWE_JWT_SECRET` in the same window (shared with KeyForge entropy)

## 3. `BRIDGE_SIWE_JWT_SECRET`

**Leak impact:** KeyForge entropy root — attacker can derive any kf2.* token.

- **Generate:** `openssl rand -hex 64`
- **Store:** `/c/aoe-unified-final/.env.siwe-jwt`
- **Consumers:** `api/siwe.js`, Python-side `app/services/keyforge.py:89-98`
- **Propagation:** PM2 restart Node services + **restart BridgeLiveWall Python backend** (keyforge re-seeds HKDF at boot)
- **Validation:** issue a kf2.* token post-rotation, verify it validates
- **KeyForge epoch:** next `KEYFORGE_EPOCH_SEC` tick ( default 600s) — old tokens die at that boundary

## 4. `SECRETS_MASTER_KEY`

**Leak impact:** decrypts the config-intelligence vault (`engine/config-intelligence/secrets.js`).

- **Generate:** `openssl rand -hex 32`
- **Store:** `/c/aoe-unified-final/.env.secrets-master`
- **Consumers:** `engine/config-intelligence/secrets.js` only
- **Propagation:** re-encrypt vault entries BEFORE replacing the master key (script in `engine/config-intelligence/`)
- **Validation:** read-one roundtrip on any vaulted entry
- **CRITICAL ORDER:** decrypt-all → rotate-key → re-encrypt-all, atomic or you lose the vault

## 5. `TREASURY_PRIVATE_KEY`

**Leak impact:** drains the BRDG treasury wallet on-chain.

- **Generate:** `npx hardhat run --network linea scripts/generate-wallet.js` (emits address + key)
- **Store:** `/c/aoe-unified-final/.env.treasury` (chmod 600 **critical**)
- **On-chain action:** transfer existing treasury to new address **before** rotating env var
- **Consumers:** `lib/eth-treasury.js`, `lib/brdg-distributor.js`, `scripts/create-dex-pool.js`
- **Propagation:** PM2 restart economy services; update `BRDG_CONTRACT_ADDRESS` if contract ownership transferred
- **Validation:** read new treasury balance via RPC; match on-chain transfer amount
- **NOT a routine rotation** — only on compromise. Requires on-chain gas.

## 6. `DEPLOYER_PRIVATE_KEY`

**Leak impact:** can deploy malicious contract upgrades if contracts are upgradeable.

- **Generate:** same as treasury
- **Store:** `/c/aoe-unified-final/.env.deployer`
- **Consumers:** `hardhat.config.js`, `contracts/hardhat.config.js`, deployment scripts only — never at runtime
- **Propagation:** none (deploy-time only)
- **Validation:** next deploy dry-run (`npx hardhat compile && npx hardhat run --network hardhat`)
- **Hygiene:** if contracts are non-upgradeable, leak is reputational only

## 7. `TVM_SECRET`

**Leak impact:** forge TVM token validations.

- **Generate:** `openssl rand -hex 32`
- **Store:** `/c/aoe-unified-final/.env.tvm`
- **Consumers:** `lib/tvm.js`
- **Propagation:** PM2 restart only the service that imports tvm.js (check with `grep -l "require.*tvm" /root/aoe-unified-final`)
- **Validation:** issue + verify one TVM token roundtrip

## 8. `TOTP_ENCRYPTION_KEY`

**Leak impact:** decrypts all stored MFA seeds — full 2FA bypass fleet-wide.

- **Generate:** `openssl rand -hex 32`
- **Store:** `/c/aoe-unified-final/.env.totp-enc`
- **Consumers:** `lib/user-identity.js`
- **Propagation:** **re-encrypt all TOTP secrets in DB before swap** (same atomic pattern as SECRETS_MASTER_KEY)
- **Validation:** any user's 2FA login works post-rotation
- **User impact:** zero if re-encryption succeeds; total 2FA outage if it fails — run in maintenance window

## 9. `AGENT_SALT`

**Leak impact:** attacker can predict agent identity derivations, impersonate agents in registry.

- **Generate:** `openssl rand -hex 32`
- **Store:** `/c/aoe-unified-final/.env.agent-salt`
- **Consumers:** `lib/agent-registry-routes.js`, `lib/agent-commands.js`
- **Propagation:** PM2 restart + **all existing agent IDs become invalid** — requires agent re-registration
- **Validation:** new agent registration succeeds; old agent ID returns 404
- **Cadence:** only on confirmed leak — rotation has user impact

## 10. `BRIDGE_ADMIN_SECRET`

**Leak impact:** admin-tier bypass in access-control middleware.

- **Generate:** `openssl rand -hex 48`
- **Store:** `/c/aoe-unified-final/.env.bridge-admin`
- **Consumers:** `middleware/access-control.js`
- **Propagation:** PM2 restart + admin dashboard users re-login
- **Validation:** `curl -H "x-bridge-admin: $NEW" https://admin.bridge-ai-os.com/api/admin/ping` → 200; old value → 401

## 11. `BRIDGE_VERIFY_SECRET`

**Leak impact:** forge webhook signatures accepted by gateway.

- **Generate:** `openssl rand -hex 32`
- **Store:** `/c/aoe-unified-final/.env.bridge-verify`
- **Consumers:** `gateway.js` (webhook sig verification)
- **Propagation:** PM2 restart + **update webhook senders** (WP, Vercel cron) with the new secret BEFORE rotating — otherwise webhooks start failing
- **Validation:** send a test webhook with new HMAC; expect 200

## 12. `SIWE_SECRET`

**Leak impact:** forge sign-in-with-ethereum sessions.

- **Generate:** `openssl rand -hex 48`
- **Store:** `/c/aoe-unified-final/.env.siwe`
- **Consumers:** `api/siwe.js`
- **Propagation:** PM2 restart + SIWE users re-sign-in
- **Validation:** complete a SIWE login flow end-to-end

---

## Post-rotation record

After any Tier-0 rotation, append to `.claude/state/prime-ops.json`:

```bash
jq --arg var "$VAR_NAME" \
   --arg fp "${NEW:0:12}" \
   --arg len "${#NEW}" \
   --arg at "$ROTATE_AT" \
   '.tier0_rotations += [{var: $var, fingerprint: $fp, length: ($len|tonumber), rotated_at: $at}]' \
   c:/aoe-unified-final-main/.claude/state/prime-ops.json > /tmp/prime-ops.json.tmp \
  && mv /tmp/prime-ops.json.tmp c:/aoe-unified-final-main/.claude/state/prime-ops.json
```

## Emergency mass-rotation

If you suspect a full `.env` compromise, rotate in this order (dependency-aware):

1. `SECRETS_MASTER_KEY` (must be first — re-encrypt vault)
2. `TOTP_ENCRYPTION_KEY` (re-encrypt user MFA)
3. `BRIDGE_SIWE_JWT_SECRET` + `JWT_SECRET` + `SIWE_SECRET` (identity core — users re-login)
4. `BRIDGE_INTERNAL_SECRET` + `BRIDGE_ADMIN_SECRET` + `BRIDGE_VERIFY_SECRET` (auth bypasses)
5. `TVM_SECRET` + `AGENT_SALT`
6. `TREASURY_PRIVATE_KEY` (on-chain transfer + key swap — schedule gas)
7. `DEPLOYER_PRIVATE_KEY` (deploy-time only — lowest urgency)

Then restart the full PM2 stack: `pm2 restart all`.
