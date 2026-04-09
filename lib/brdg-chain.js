/**
 * BRDG On-Chain Data — reads live state from Linea mainnet.
 * Used by brain.js treasury endpoints to show real on-chain balances.
 */
'use strict';

const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

// ── Contract addresses (from deployment) ────────────────────────────────────
let DEPLOYMENT = {};
try {
  DEPLOYMENT = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'deployment.json'), 'utf8'));
} catch (_) {}

const BRDG_ADDRESS = DEPLOYMENT.contracts?.BRDG || '0x5f0541302bd4fC672018b07a35FA5f294A322947';
const VAULT_ADDRESS = DEPLOYMENT.contracts?.TreasuryVault || '0xDb8d8ca8A65d36eFbD5C84C145B58Ee62C872d88';
const TREASURY_OWNER = DEPLOYMENT.treasury || '0xAC301f984556c11ecf3818CaA6020d11c8616F64';
const CHAIN_ID = DEPLOYMENT.chainId || 59144;

// ── ABI fragments (only what we need for reads) ─────────────────────────────
const BRDG_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function totalBurned() view returns (uint256)',
  'function MAX_SUPPLY() view returns (uint256)',
  'function BURN_BPS() view returns (uint256)',
  'function burnExempt(address) view returns (bool)',
];

const VAULT_ABI = [
  'function ethBuckets() view returns (uint256 ops, uint256 liquidity, uint256 reserve, uint256 founder)',
  'function brdgBuckets() view returns (uint256 ops, uint256 liquidity, uint256 reserve, uint256 founder)',
  'function totalEthDeposited() view returns (uint256)',
  'function totalBrdgDeposited() view returns (uint256)',
  'function bucketBalances() view returns (uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256)',
];

// ── Provider + Contract instances ───────────────────────────────────────────
// Provider is shared via treasury.js singleton to avoid duplicate RPC connections
let _brdg = null;
let _vault = null;

function getProvider() {
  return require('./treasury').getProvider();
}

function getBrdg() {
  if (!_brdg) _brdg = new ethers.Contract(BRDG_ADDRESS, BRDG_ABI, getProvider());
  return _brdg;
}

function getVault() {
  if (!_vault) _vault = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, getProvider());
  return _vault;
}

// ── Cache (avoid hammering RPC on every request) ────────────────────────────
let _cache = { data: null, ts: 0 };
const CACHE_TTL_MS = 30_000; // 30 seconds

// ── Public API ──────────────────────────────────────────────────────────────

/** Full BRDG token stats from chain */
async function getTokenStats() {
  const now = Date.now();
  if (_cache.data && now - _cache.ts < CACHE_TTL_MS) return _cache.data;

  const brdg = getBrdg();
  const provider = getProvider();

  const [totalSupply, totalBurned, maxSupply, burnBps, ownerBalance, vaultEthBalance] = await Promise.all([
    brdg.totalSupply(),
    brdg.totalBurned(),
    brdg.MAX_SUPPLY(),
    brdg.BURN_BPS(),
    brdg.balanceOf(TREASURY_OWNER),
    provider.getBalance(VAULT_ADDRESS),
  ]);

  const data = {
    token: {
      address: BRDG_ADDRESS,
      name: 'Bridge AI',
      symbol: 'BRDG',
      chain: 'linea',
      chainId: CHAIN_ID,
      totalSupply: ethers.formatEther(totalSupply),
      totalBurned: ethers.formatEther(totalBurned),
      maxSupply: ethers.formatEther(maxSupply),
      circulatingSupply: ethers.formatEther(totalSupply), // all minted = circulating for now
      burnRate: Number(burnBps) / 100 + '%',
    },
    treasury: {
      owner: TREASURY_OWNER,
      brdgBalance: ethers.formatEther(ownerBalance),
      vault: {
        address: VAULT_ADDRESS,
        ethBalance: ethers.formatEther(vaultEthBalance),
      },
    },
    lineascan: `https://lineascan.build/token/${BRDG_ADDRESS}`,
    sourcify: `https://repo.sourcify.dev/contracts/full_match/${CHAIN_ID}/${BRDG_ADDRESS}/`,
    ts: now,
  };

  _cache = { data, ts: now };
  return data;
}

/** Get vault bucket balances */
async function getVaultBuckets() {
  try {
    const vault = getVault();
    const [opsEth, liqEth, resEth, fndEth, opsBrdg, liqBrdg, resBrdg, fndBrdg] = await vault.bucketBalances();
    return {
      eth: {
        ops: ethers.formatEther(opsEth),
        liquidity: ethers.formatEther(liqEth),
        reserve: ethers.formatEther(resEth),
        founder: ethers.formatEther(fndEth),
      },
      brdg: {
        ops: ethers.formatEther(opsBrdg),
        liquidity: ethers.formatEther(liqBrdg),
        reserve: ethers.formatEther(resBrdg),
        founder: ethers.formatEther(fndBrdg),
      },
    };
  } catch (e) {
    return { error: e.message };
  }
}

module.exports = {
  getTokenStats,
  getVaultBuckets,
  BRDG_ADDRESS,
  VAULT_ADDRESS,
  TREASURY_OWNER,
};
