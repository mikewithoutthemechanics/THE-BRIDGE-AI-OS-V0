#!/usr/bin/env node
/*
  Deploy ZeonGuardian to Linea and wire it up end-to-end.

  Steps:
    1. Load env (LINEA_RPC_URL, deployer key, sentinel/pauser/coldSafe addrs,
       watched-token list, and the HOT WALLET key so we can submit the
       one-time MAX approval from the hot side).
    2. Deploy ZeonGuardian(sentinel, pauser, coldSafe).
    3. setWatchedToken(token, true) for each watched token (owner call).
    4. From each hot wallet, approve(guardian, MAX_UINT256) on each watched
       token. (If multiple hot wallets are guarded, pass comma-separated
       ZEON_HOT_WALLET_KEYS in the same order as ZEON_HOT_WALLETS.)
    5. Emit a zeon-deployment-<timestamp>.json receipt file.

  IMPORTANT: only this script needs the hot wallet's private key — and only
  for the one-time approval. After that, delete the key from .env.zeon. The
  hot wallet's day-to-day signing happens elsewhere (core-gateway, etc.); it
  does not stay in ZEON env.

  Usage:
    node scripts/deploy-modular-vault.js
    node scripts/deploy-modular-vault.js --dry  # estimate gas, don't send
*/

'use strict';

const fs = require('fs');
const path = require('path');
const solc = require('solc');
const { ethers } = require('ethers');

const dry = process.argv.includes('--dry');

function req(name) {
  const v = process.env[name];
  if (!v) throw new Error(`missing env: ${name}`);
  return v;
}
function opt(name, dflt) { return process.env[name] || dflt; }
function parseList(csv) {
  return (csv || '').split(',').map(s => s.trim()).filter(Boolean);
}

function log(o) { process.stdout.write(JSON.stringify({ t: new Date().toISOString(), ...o }) + '\n'); }

function compile() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'contracts', 'ZeonGuardian.sol'), 'utf8');
  const input = {
    language: 'Solidity',
    sources: { 'ZeonGuardian.sol': { content: src } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
    },
  };
  const out = JSON.parse(solc.compile(JSON.stringify(input)));
  if (out.errors) {
    const fatal = out.errors.filter(e => e.severity === 'error');
    if (fatal.length) {
      fatal.forEach(e => log({ solc_error: e.formattedMessage }));
      throw new Error('solc errors');
    }
    out.errors.forEach(e => log({ solc_warn: e.formattedMessage }));
  }
  const c = out.contracts['ZeonGuardian.sol']['ZeonGuardian'];
  return { abi: c.abi, bytecode: '0x' + c.evm.bytecode.object };
}

async function main() {
  const rpc = req('LINEA_RPC_URL');
  const deployerKey = req('ZEON_DEPLOYER_KEY');
  const sentinelAddr = ethers.getAddress(req('ZEON_SENTINEL_ADDR'));
  const pauserAddr = ethers.getAddress(req('ZEON_PAUSER_ADDR'));
  const coldSafeAddr = ethers.getAddress(req('ZEON_COLD_SAFE'));
  const watchedTokens = parseList(req('ZEON_WATCHED_TOKENS')).map(ethers.getAddress);
  const hotWallets = parseList(req('ZEON_HOT_WALLETS')).map(ethers.getAddress);
  const hotKeys = parseList(opt('ZEON_HOT_WALLET_KEYS', ''));
  const approveMax = opt('ZEON_APPROVE_ON_DEPLOY', '1') === '1';

  if (approveMax && hotKeys.length !== hotWallets.length) {
    throw new Error(`hot key count (${hotKeys.length}) != hot wallet count (${hotWallets.length}); or set ZEON_APPROVE_ON_DEPLOY=0 to skip`);
  }

  const provider = new ethers.JsonRpcProvider(rpc);
  const deployer = new ethers.Wallet(deployerKey, provider);

  log({ step: 'compile' });
  const { abi, bytecode } = compile();

  log({ step: 'deploy', by: deployer.address, sentinel: sentinelAddr, pauser: pauserAddr, coldSafe: coldSafeAddr, dry });

  const factory = new ethers.ContractFactory(abi, bytecode, deployer);
  const deployTxData = factory.interface.encodeDeploy([sentinelAddr, pauserAddr, coldSafeAddr]);

  if (dry) {
    const gas = await provider.estimateGas({ from: deployer.address, data: bytecode + deployTxData.slice(2) });
    const feeData = await provider.getFeeData();
    log({ dry: true, gasEstimate: gas.toString(), gasPriceGwei: feeData.gasPrice ? ethers.formatUnits(feeData.gasPrice, 'gwei') : null });
    return;
  }

  const guardian = await factory.deploy(sentinelAddr, pauserAddr, coldSafeAddr);
  const dep = await guardian.deploymentTransaction().wait();
  const guardianAddr = await guardian.getAddress();
  log({ deployed: guardianAddr, tx: dep.hash, block: dep.blockNumber, gasUsed: dep.gasUsed.toString() });

  // Register watched tokens.
  for (const token of watchedTokens) {
    const tx = await guardian.setWatchedToken(token, true);
    const rc = await tx.wait();
    log({ step: 'setWatchedToken', token, tx: rc.hash });
  }

  // One-time MAX approval from each hot wallet.
  const erc20Abi = ['function approve(address spender, uint256 amount) returns (bool)'];
  const MAX = ethers.MaxUint256;
  const approvals = [];
  if (approveMax) {
    for (let i = 0; i < hotWallets.length; i++) {
      const hot = hotWallets[i];
      const hotWallet = new ethers.Wallet(hotKeys[i], provider);
      if (hotWallet.address.toLowerCase() !== hot.toLowerCase()) {
        throw new Error(`hot key ${i} address mismatch: key=${hotWallet.address} expected=${hot}`);
      }
      for (const token of watchedTokens) {
        const erc20 = new ethers.Contract(token, erc20Abi, hotWallet);
        const tx = await erc20.approve(guardianAddr, MAX);
        const rc = await tx.wait();
        log({ step: 'approve', hot, token, tx: rc.hash });
        approvals.push({ hot, token, tx: rc.hash });
      }
    }
  }

  const receipt = {
    network: 'linea',
    chainId: parseInt(opt('LINEA_CHAIN_ID', '59144'), 10),
    deployedAt: new Date().toISOString(),
    guardian: guardianAddr,
    deployer: deployer.address,
    sentinel: sentinelAddr,
    pauser: pauserAddr,
    coldSafe: coldSafeAddr,
    watchedTokens,
    hotWallets,
    approvals,
    deployTx: dep.hash,
  };
  const outFile = path.join(__dirname, '..', 'logs', `zeon-deployment-${Date.now()}.json`);
  fs.writeFileSync(outFile, JSON.stringify(receipt, null, 2));
  log({ step: 'done', receipt: outFile });
  log({ summary: receipt });
}

main().catch(e => { log({ fatal: e.shortMessage || e.message || String(e) }); process.exit(1); });
