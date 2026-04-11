/**
 * BRDG Price Oracle — reads live BRDG/ETH price from DEX pool reserves.
 *
 * Supports SyncSwap (Linea's primary DEX) classic pools.
 * Falls back to a configured static price if no pool exists yet.
 *
 * Usage:
 *   const oracle = require('./lib/price-oracle');
 *   const { brdgPerEth, ethPerBrdg, brdgUsd } = await oracle.getPrice();
 */
'use strict';

const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

// ── Configuration ────────────────────────────────────────────────────────────
const RPC_URL = process.env.BRIDGE_SIWE_RPC_URL || 'https://rpc.linea.build';

// Load deployment addresses
let DEPLOYMENT = {};
try {
  DEPLOYMENT = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'deployment.json'), 'utf8'));
} catch (_) {}

const BRDG_ADDRESS = DEPLOYMENT.contracts?.BRDG || '0x6Ee9Fb40b97139EEEc406c096393e0b53C89975f';
const WETH_ADDRESS = '0xe5D7C2a44FfDDf6b295A15c148167daaAf5Cf34f'; // WETH on Linea

// SyncSwap Classic Pool Factory on Linea
const SYNCSWAP_FACTORY = '0x37BAc764494c8db4e54BDE72f6965beA9fa0AC2d';

// ── ABI fragments ────────────────────────────────────────────────────────────
const FACTORY_ABI = ['function getPool(address, address) view returns (address)'];
const POOL_ABI = [
  'function getReserves() view returns (uint256, uint256)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
];
const ERC20_ABI = ['function decimals() view returns (uint8)'];

// ── Cache ────────────────────────────────────────────────────────────────────
let _provider = null;
let _poolAddress = null;
let _cachedPrice = null;
let _cacheTimestamp = 0;
const CACHE_TTL_MS = 30_000; // 30 seconds

function getProvider() {
  if (!_provider) _provider = new ethers.JsonRpcProvider(RPC_URL);
  return _provider;
}

/**
 * Find the BRDG/WETH pool address on SyncSwap.
 * Returns null if no pool exists yet.
 */
async function findPool() {
  if (_poolAddress) return _poolAddress;

  const provider = getProvider();
  const factory = new ethers.Contract(SYNCSWAP_FACTORY, FACTORY_ABI, provider);

  const poolAddr = await factory.getPool(BRDG_ADDRESS, WETH_ADDRESS);
  if (poolAddr === ethers.ZeroAddress) {
    return null; // Pool not created yet
  }

  _poolAddress = poolAddr;
  return poolAddr;
}

/**
 * Get live BRDG price from DEX pool reserves.
 *
 * Returns:
 *   { brdgPerEth, ethPerBrdg, brdgUsd, poolAddress, source, timestamp }
 *
 * If no pool exists, returns fallback price with source: 'fallback'.
 */
async function getPrice() {
  // Return cache if fresh
  if (_cachedPrice && Date.now() - _cacheTimestamp < CACHE_TTL_MS) {
    return _cachedPrice;
  }

  try {
    const poolAddr = await findPool();
    if (!poolAddr) {
      return getFallbackPrice('no-pool');
    }

    const provider = getProvider();
    const pool = new ethers.Contract(poolAddr, POOL_ABI, provider);

    const [reserves, token0] = await Promise.all([
      pool.getReserves(),
      pool.token0(),
    ]);

    const [reserve0, reserve1] = reserves;

    // Determine which reserve is BRDG and which is WETH
    const brdgIsToken0 = token0.toLowerCase() === BRDG_ADDRESS.toLowerCase();
    const brdgReserve = brdgIsToken0 ? reserve0 : reserve1;
    const ethReserve = brdgIsToken0 ? reserve1 : reserve0;

    if (brdgReserve === 0n || ethReserve === 0n) {
      return getFallbackPrice('empty-pool');
    }

    // Both BRDG and WETH are 18 decimals
    const brdgPerEth = Number(ethers.formatEther(brdgReserve)) / Number(ethers.formatEther(ethReserve));
    const ethPerBrdg = 1 / brdgPerEth;

    // ETH/USD price — fetch from on-chain oracle or use estimate
    const ethUsd = await getEthUsdPrice();
    const brdgUsd = ethPerBrdg * ethUsd;

    const result = {
      brdgPerEth: Math.round(brdgPerEth * 100) / 100,
      ethPerBrdg: parseFloat(ethPerBrdg.toFixed(8)),
      brdgUsd: parseFloat(brdgUsd.toFixed(6)),
      ethUsd,
      poolAddress: poolAddr,
      brdgReserve: ethers.formatEther(brdgReserve),
      ethReserve: ethers.formatEther(ethReserve),
      source: 'syncswap',
      timestamp: new Date().toISOString(),
    };

    _cachedPrice = result;
    _cacheTimestamp = Date.now();
    return result;

  } catch (error) {
    console.error('[PriceOracle] Error reading pool:', error.message);
    return getFallbackPrice('error');
  }
}

/**
 * Fallback price when no pool exists or pool read fails.
 * Uses the seed price from pool creation (1 ETH = 10,000 BRDG).
 */
function getFallbackPrice(reason) {
  const brdgPerEth = 10000;
  const ethPerBrdg = 0.0001;
  const ethUsd = 3600;
  return {
    brdgPerEth,
    ethPerBrdg,
    brdgUsd: ethPerBrdg * ethUsd,
    ethUsd,
    poolAddress: null,
    brdgReserve: '0',
    ethReserve: '0',
    source: 'fallback',
    fallbackReason: reason,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Get ETH/USD price. Tries Chainlink on Linea, falls back to static.
 */
async function getEthUsdPrice() {
  try {
    // Chainlink ETH/USD on Linea: 0x3c6Cd9Cc7c7a4c2Cf5a82734CD249D7D593354dA
    const CHAINLINK_ETH_USD = '0x3c6Cd9Cc7c7a4c2Cf5a82734CD249D7D593354dA';
    const CHAINLINK_ABI = ['function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)'];
    const provider = getProvider();
    const feed = new ethers.Contract(CHAINLINK_ETH_USD, CHAINLINK_ABI, provider);
    const [, answer] = await feed.latestRoundData();
    return Number(answer) / 1e8; // Chainlink uses 8 decimals
  } catch (_) {
    return 3600; // Fallback ETH/USD
  }
}

/**
 * Clear cache (for testing or after pool creation)
 */
function clearCache() {
  _cachedPrice = null;
  _cacheTimestamp = 0;
  _poolAddress = null;
}

module.exports = { getPrice, findPool, getEthUsdPrice, clearCache, BRDG_ADDRESS, WETH_ADDRESS };
