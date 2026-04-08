/**
 * BRIDGE AI OS — Dynamic BRDG/ZAR Exchange Rate
 *
 * Base rate: 1 ZAR = 10 BRDG
 * Adjusted by:
 *   - Treasury health: >50k = BRDG cheaper; <20k = BRDG more expensive
 *   - Demand: >50 tx/hour = slight rate increase
 *
 * Rate is cached for 60 seconds to avoid recalculation on every call.
 */

'use strict';

const BASE_RATE = 10; // 1 ZAR = 10 BRDG
const CACHE_TTL_MS = 60_000; // 60 seconds

let cachedRate = null;
let cacheTimestamp = 0;

// External hooks — set these to pull live data
let _getTreasuryBalance = () => 35000; // default mid-range
let _getRecentTxCount = () => 30;      // default moderate demand

/**
 * Allow other modules to inject live data sources.
 */
function setDataSources({ getTreasuryBalance, getRecentTxCount } = {}) {
  if (getTreasuryBalance) _getTreasuryBalance = getTreasuryBalance;
  if (getRecentTxCount) _getRecentTxCount = getRecentTxCount;
}

/**
 * Compute the dynamic BRDG/ZAR rate.
 * Returns how many BRDG you get per 1 ZAR.
 */
function getBrdgRate() {
  const now = Date.now();
  if (cachedRate !== null && (now - cacheTimestamp) < CACHE_TTL_MS) {
    return cachedRate;
  }

  let rate = BASE_RATE;

  // Treasury health adjustment
  let treasuryBalance;
  try { treasuryBalance = _getTreasuryBalance(); } catch (_) { treasuryBalance = 35000; }

  if (treasuryBalance > 50000) {
    // Healthy treasury — BRDG is cheaper (more per ZAR)
    const excess = Math.min(treasuryBalance - 50000, 100000);
    rate += (excess / 100000) * 3; // up to +3 BRDG per ZAR
  } else if (treasuryBalance < 20000) {
    // Low treasury — BRDG is more expensive (fewer per ZAR)
    const deficit = Math.min(20000 - treasuryBalance, 20000);
    rate -= (deficit / 20000) * 4; // down to -4 BRDG per ZAR
    rate = Math.max(rate, 2); // floor: never below 2 BRDG/ZAR
  }

  // Demand adjustment
  let txCount;
  try { txCount = _getRecentTxCount(); } catch (_) { txCount = 30; }

  if (txCount > 50) {
    const excess = Math.min(txCount - 50, 200);
    rate += (excess / 200) * 2; // up to +2 BRDG per ZAR under high demand
  }

  // Round to 2 decimals
  rate = Math.round(rate * 100) / 100;

  cachedRate = {
    rate,
    base_rate: BASE_RATE,
    treasury_balance: treasuryBalance,
    tx_count_hourly: txCount,
    cached_at: now,
    expires_at: now + CACHE_TTL_MS,
  };
  cacheTimestamp = now;

  return cachedRate;
}

/**
 * Convert ZAR to BRDG using the dynamic rate.
 */
function convertZarToBrdg(zarAmount) {
  const { rate } = getBrdgRate();
  const brdg = zarAmount * rate;
  return {
    zar: zarAmount,
    brdg: Math.round(brdg * 100) / 100,
    rate,
  };
}

/**
 * Convert BRDG to ZAR using the dynamic rate.
 */
function convertBrdgToZar(brdgAmount) {
  const { rate } = getBrdgRate();
  const zar = brdgAmount / rate;
  return {
    brdg: brdgAmount,
    zar: Math.round(zar * 100) / 100,
    rate,
  };
}

/**
 * Clear the rate cache (useful for testing or forced refresh).
 */
function clearCache() {
  cachedRate = null;
  cacheTimestamp = 0;
}

module.exports = {
  getBrdgRate,
  convertZarToBrdg,
  convertBrdgToZar,
  setDataSources,
  clearCache,
};
