#!/usr/bin/env node
/*
  ZEON Pauser — emergency freeze/unfreeze CLI.

  Usage:
    node scripts/pauser.js pause
    node scripts/pauser.js unpause
    node scripts/pauser.js status

  Uses ZEON_PAUSER_KEY — a completely separate key from the sentinel. Rationale:
    * sentinel key is the hottest (broadcasts constantly). If it leaks, we
      want a DIFFERENT key with authority to freeze rescues while we rotate.
    * owner key is cold (hardware); we don't want to pull it out for every
      incident.

  Pauser authority is narrow: can only flip paused on/off. It cannot redirect
  funds, change coldSafe, or rotate other roles.
*/

'use strict';

const { ethers } = require('ethers');

const GUARDIAN_ABI = [
  'function pause()',
  'function unpause()',
  'function paused() view returns (bool)',
  'function pauser() view returns (address)',
];

function req(name) {
  const v = process.env[name];
  if (!v) { console.error(JSON.stringify({ fatal: 'missing env', name })); process.exit(1); }
  return v;
}

function log(o) { process.stdout.write(JSON.stringify({ t: new Date().toISOString(), ...o }) + '\n'); }

async function main() {
  const action = (process.argv[2] || '').toLowerCase();
  if (!['pause', 'unpause', 'status'].includes(action)) {
    console.error('usage: pauser.js <pause|unpause|status>');
    process.exit(2);
  }

  const rpc = req('LINEA_RPC_URL');
  const guardianAddr = ethers.getAddress(req('ZEON_GUARDIAN_ADDR'));
  const provider = rpc.startsWith('ws')
    ? new ethers.WebSocketProvider(rpc)
    : new ethers.JsonRpcProvider(rpc);

  if (action === 'status') {
    const read = new ethers.Contract(guardianAddr, GUARDIAN_ABI, provider);
    const [paused, pauser] = await Promise.all([read.paused(), read.pauser()]);
    log({ action: 'status', paused, pauser });
    process.exit(0);
  }

  const pauserKey = req('ZEON_PAUSER_KEY');
  const wallet = new ethers.Wallet(pauserKey, provider);
  const guardian = new ethers.Contract(guardianAddr, GUARDIAN_ABI, wallet);

  const expected = await guardian.pauser();
  if (expected.toLowerCase() !== wallet.address.toLowerCase()) {
    log({ fatal: 'pauser key mismatch', expected, have: wallet.address });
    process.exit(1);
  }

  const wasPaused = await guardian.paused();
  if (action === 'pause' && wasPaused) { log({ noop: 'already paused' }); process.exit(0); }
  if (action === 'unpause' && !wasPaused) { log({ noop: 'already unpaused' }); process.exit(0); }

  log({ action, broadcasting: true, by: wallet.address });
  const tx = await (action === 'pause' ? guardian.pause() : guardian.unpause());
  log({ action, tx: tx.hash });
  const rc = await tx.wait();
  log({ action, mined: rc.hash, status: rc.status });
}

main().catch(e => { log({ fatal: e.shortMessage || e.message || String(e) }); process.exit(1); });
