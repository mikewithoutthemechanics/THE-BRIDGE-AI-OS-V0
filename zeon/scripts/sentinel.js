#!/usr/bin/env node
/*
  ZEON Sentinel — Linea mempool watcher + rescue broadcaster.

  Watches pending transactions targeting any watched-token contract. If it
  detects transferFrom(hot, *, *) for a hot wallet we guard, it broadcasts
  rescueFullBalance(token, hot) at (hostile_gas * GAS_BUMP_PCT / 100) to
  outbid the attacker in sequencer ordering.

  Env (read from /root/.env.zeon or --env-file):
    LINEA_RPC_URL        wss:// preferred for mempool subscribe; falls back to polling
    LINEA_CHAIN_ID       default 59144
    ZEON_GUARDIAN_ADDR   deployed ZeonGuardian contract
    ZEON_SENTINEL_KEY    private key (0x...) — holds ~0.001 ETH for gas
    ZEON_HOT_WALLETS     comma-separated hot wallet addresses to watch
    ZEON_WATCHED_TOKENS  comma-separated token addresses (BRDG, USDT, ...)
    GAS_BUMP_PCT         default 120 (20% over hostile)
    GAS_BUMP_MAX_GWEI    absolute ceiling, default 500
    RESCUE_COOLDOWN_MS   default 10000 — don't re-rescue same hot inside window
    POLL_INTERVAL_MS     default 1500 — used only if ws mempool unavailable

  Stays running under pm2. Logs structured JSON lines to stdout.
*/

'use strict';

const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

const GUARDIAN_ABI = [
  'function rescueFullBalance(address token, address hot) returns (uint256)',
  'function rescuePullFrom(address token, address hot, uint256 amount) returns (bool)',
  'function watchedToken(address) view returns (bool)',
  'function paused() view returns (bool)',
  'function sentinel() view returns (address)',
  'event Rescued(address indexed token, address indexed hot, address indexed coldSafe, uint256 amount, address sentinel)',
];

const ERC20_ABI = [
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
];

// transferFrom(address,address,uint256) selector — the ONE signature we hunt.
const TRANSFER_FROM_SELECTOR = '0x23b872dd';
const TRANSFER_FROM_IFACE = new ethers.Interface(ERC20_ABI);

function log(level, msg, extra = {}) {
  process.stdout.write(JSON.stringify({ t: new Date().toISOString(), level, msg, ...extra }) + '\n');
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v) { log('fatal', 'missing env', { name }); process.exit(1); }
  return v;
}

function parseList(csv) {
  return (csv || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}

async function main() {
  const rpcUrl = requireEnv('LINEA_RPC_URL');
  const guardianAddr = ethers.getAddress(requireEnv('ZEON_GUARDIAN_ADDR'));
  const sentinelKey = requireEnv('ZEON_SENTINEL_KEY');
  const hotWallets = parseList(requireEnv('ZEON_HOT_WALLETS'));
  const watchedTokens = parseList(requireEnv('ZEON_WATCHED_TOKENS'));
  const gasBumpPct = parseInt(process.env.GAS_BUMP_PCT || '120', 10);
  const gasBumpMaxGwei = parseInt(process.env.GAS_BUMP_MAX_GWEI || '500', 10);
  const cooldownMs = parseInt(process.env.RESCUE_COOLDOWN_MS || '10000', 10);
  const pollMs = parseInt(process.env.POLL_INTERVAL_MS || '1500', 10);

  const provider = rpcUrl.startsWith('ws')
    ? new ethers.WebSocketProvider(rpcUrl)
    : new ethers.JsonRpcProvider(rpcUrl);

  const wallet = new ethers.Wallet(sentinelKey, provider);
  const guardian = new ethers.Contract(guardianAddr, GUARDIAN_ABI, wallet);

  const onchainSentinel = await guardian.sentinel();
  if (onchainSentinel.toLowerCase() !== wallet.address.toLowerCase()) {
    log('fatal', 'sentinel key mismatch', { expected: onchainSentinel, have: wallet.address });
    process.exit(1);
  }

  log('boot', 'ZEON sentinel online', {
    guardian: guardianAddr,
    sentinel: wallet.address,
    hotWallets,
    watchedTokens,
    gasBumpPct,
    gasBumpMaxGwei,
    cooldownMs,
  });

  const lastRescueByHot = new Map(); // hot -> ts

  // Core decision: given a pending tx, does it look hostile? If so, rescue.
  async function evaluate(tx) {
    if (!tx || !tx.to || !tx.data || tx.data.length < 10) return;
    const to = tx.to.toLowerCase();
    if (!watchedTokens.includes(to)) return;
    if (!tx.data.toLowerCase().startsWith(TRANSFER_FROM_SELECTOR)) return;

    let decoded;
    try {
      decoded = TRANSFER_FROM_IFACE.decodeFunctionData('transferFrom', tx.data);
    } catch (e) {
      return;
    }
    const fromAddr = decoded[0].toLowerCase();
    if (!hotWallets.includes(fromAddr)) return;

    // Attacker's tx could be from any EOA; the critical fact is it's pulling
    // FROM a watched hot wallet. Rescue unconditionally — if it's us (the
    // legitimate sweep pathway), we'd use a different code path and this
    // sentinel wouldn't see it as pending first.
    const nowMs = Date.now();
    const lastTs = lastRescueByHot.get(fromAddr) || 0;
    if (nowMs - lastTs < cooldownMs) {
      log('skip', 'cooldown', { hot: fromAddr });
      return;
    }
    lastRescueByHot.set(fromAddr, nowMs);

    const hostileGasGwei = tx.gasPrice
      ? Number(ethers.formatUnits(tx.gasPrice, 'gwei'))
      : (tx.maxFeePerGas ? Number(ethers.formatUnits(tx.maxFeePerGas, 'gwei')) : 0);

    const bumpedGwei = Math.min(Math.ceil(hostileGasGwei * gasBumpPct / 100) || 1, gasBumpMaxGwei);
    const gasPrice = ethers.parseUnits(String(bumpedGwei), 'gwei');

    log('hostile_detected', 'broadcasting rescue', {
      victim: fromAddr,
      token: to,
      attackerTxHash: tx.hash,
      hostileGasGwei,
      bumpedGwei,
    });

    try {
      const rescueTx = await guardian.rescueFullBalance(to, fromAddr, {
        gasPrice,
        gasLimit: 250000n,
      });
      log('rescue_sent', 'tx dispatched', { rescueHash: rescueTx.hash, bumpedGwei });
      const rc = await rescueTx.wait();
      log('rescue_mined', 'rescued', { rescueHash: rc.hash, status: rc.status, gasUsed: rc.gasUsed.toString() });
    } catch (err) {
      log('rescue_failed', err.shortMessage || err.message || String(err), { attackerTxHash: tx.hash });
    }
  }

  // Prefer ws pending subscription on chains that support it.
  let usingSubscribe = false;
  if (provider._websocket || provider.websocket) {
    try {
      provider.on('pending', async (hash) => {
        try {
          const tx = await provider.getTransaction(hash);
          await evaluate(tx);
        } catch { /* ignore missing tx */ }
      });
      usingSubscribe = true;
      log('subscribe', 'ws pending subscription active');
    } catch (e) {
      log('warn', 'ws pending failed, falling back to poll', { err: String(e) });
    }
  }

  if (!usingSubscribe) {
    // Fallback: poll txpool_content (Geth) or eth_getBlockByNumber('pending').
    // On Linea public RPC, txpool_content is typically disabled, so we poll
    // the pending block's transactions instead. This is coarser (one batch
    // per poll) but still wins when the sequencer hasn't sealed yet.
    let seen = new Set();
    const loop = async () => {
      try {
        const block = await provider.send('eth_getBlockByNumber', ['pending', true]);
        if (block && block.transactions) {
          for (const tx of block.transactions) {
            if (seen.has(tx.hash)) continue;
            seen.add(tx.hash);
            await evaluate({
              hash: tx.hash,
              to: tx.to,
              data: tx.input,
              gasPrice: tx.gasPrice ? BigInt(tx.gasPrice) : null,
              maxFeePerGas: tx.maxFeePerGas ? BigInt(tx.maxFeePerGas) : null,
            });
          }
          if (seen.size > 5000) { seen = new Set(); }
        }
      } catch (e) {
        log('poll_err', String(e));
      }
    };
    setInterval(() => { loop().catch(e => log('poll_outer_err', String(e))); }, pollMs);
    log('poll', 'pending-block poll active', { pollMs });
  }

  // Graceful shutdown.
  const shutdown = () => { log('shutdown', 'signal received'); process.exit(0); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(e => { log('fatal', e.stack || String(e)); process.exit(1); });
