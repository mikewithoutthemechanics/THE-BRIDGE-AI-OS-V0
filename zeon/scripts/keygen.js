#!/usr/bin/env node
/*
  ZEON keygen — generate role-isolated EOAs.

  Generates three fully separate wallets:
    - sentinel  (hot-but-low-power; only calls rescue)
    - pauser    (warm; only calls pause/unpause)
    - deployer  (used once; can alternatively be an existing funded EOA you
                 already control, in which case delete from output file)

  Writes full secrets to a timestamped file under zeon/keys/ with the most
  restrictive permissions the OS allows. Prints ONLY addresses + file path
  to stdout. Operator workflow:

    node scripts/keygen.js
    cat zeon/keys/zeon-keys-<ts>.json       # read once, copy to /root/.env.zeon
    shred -u zeon/keys/zeon-keys-<ts>.json  # burn after read (Linux)
    # on Windows: del + empty recycle bin; prefer running on VPS instead

  The ColdSafe is NOT generated here — it must be a hardware wallet
  (Ledger/Trezor) or a Safe{Wallet} multisig. Paste its address into the
  receipt yourself; never generate a cold safe on a networked machine.
*/

'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const crypto = require('crypto');
const { Wallet } = require('ethers');

function genWallet() {
  // ethers v6: random mnemonic + derived key via secure PRNG.
  const w = Wallet.createRandom();
  // Defensive round-trip: parse the private key back and confirm the address.
  const rt = new Wallet(w.privateKey);
  if (rt.address !== w.address) {
    throw new Error('keygen round-trip mismatch — aborting');
  }
  return {
    address:    w.address,
    privateKey: w.privateKey,
    mnemonic:   w.mnemonic ? w.mnemonic.phrase : null,
  };
}

function main() {
  const outDir = path.join(__dirname, '..', 'keys');
  fs.mkdirSync(outDir, { recursive: true });

  const sentinel = genWallet();
  const pauser   = genWallet();
  const deployer = genWallet();

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const outFile = path.join(outDir, `zeon-keys-${ts}.json`);
  const payload = {
    generated_at: new Date().toISOString(),
    host: os.hostname(),
    notes: 'BURN AFTER READ. Copy values into /root/.env.zeon, then shred this file. Never commit, never share, never paste into chat.',
    sentinel,
    pauser,
    deployer,
    coldSafe_reminder: 'ColdSafe is NOT in this file. Generate it on a hardware wallet or Safe{Wallet} multisig and paste its address directly into /root/.env.zeon as ZEON_COLD_SAFE.',
  };

  // Write with 0o600 (owner r/w only). On Windows this is ignored but set anyway.
  fs.writeFileSync(outFile, JSON.stringify(payload, null, 2), { mode: 0o600 });
  try { fs.chmodSync(outFile, 0o600); } catch { /* windows */ }

  // Print ADDRESSES ONLY.
  const summary = {
    file: outFile,
    file_perms_hint: '0600 on unix; use file-system ACLs on Windows or do this on the VPS',
    addresses: {
      sentinel: sentinel.address,
      pauser:   pauser.address,
      deployer: deployer.address,
    },
    next: [
      `cat ${outFile}  # read once`,
      'Copy ZEON_SENTINEL_ADDR/KEY, ZEON_PAUSER_ADDR/KEY, ZEON_DEPLOYER_KEY into /root/.env.zeon',
      'Fund sentinel + pauser with ~0.001 ETH each on Linea; deployer with ~0.005 ETH',
      `shred -u ${outFile}  # or equivalent secure-delete on this OS`,
    ],
  };
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
}

main();
