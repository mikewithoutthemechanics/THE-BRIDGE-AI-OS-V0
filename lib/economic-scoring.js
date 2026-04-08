// =============================================================================
// BRIDGE AI OS — Economic Scoring Engine
// Scores agent options by conversion probability, commission, LTV, and trust.
// Used by the agent execution layer to rank and route recommendations.
// =============================================================================
'use strict';

// ── Trust score — based on past performance and user ratings ─────────────────
function trustScore(option) {
  const successRate = option.successRate || 0.8;
  const userRating = option.userRating || 0.9;
  return Math.min(1, Math.max(0, successRate * userRating));
}

// ── Core economic score ──────────────────────────────────────────────────────
function economicScore(option, user = {}) {
  const conversionRate = option.conversionRate || 0.5;
  const commission = option.commission || 0.1;
  const ltvMultiplier = user.ltvMultiplier || 1.0;
  const trust = trustScore(option);
  return conversionRate * commission * ltvMultiplier * trust;
}

// ── Dynamic commission based on category, margin, and intent certainty ───────
function calculateCommission(option) {
  const baseCommission = option.commission || 0.1;
  const categoryMultiplier = {
    saas: 1.5,
    fintech: 1.3,
    ecommerce: 1.0,
    services: 0.8,
    consulting: 1.2,
  }[option.category] || 1.0;
  const marginBonus = Math.min(0.5, (option.margin || 0.2) * 0.5);
  const intentCertainty = option.intentCertainty || 0.7;
  return baseCommission * categoryMultiplier * (1 + marginBonus) * intentCertainty;
}

// ── Predict conversion based on funnel stage and engagement signals ──────────
function predictConversion(user = {}) {
  const stageWeights = {
    awareness: 0.05,
    interest: 0.15,
    consideration: 0.35,
    intent: 0.55,
    evaluation: 0.70,
    purchase: 0.90,
  };
  const stageScore = stageWeights[user.funnelStage] || 0.1;
  const engagementBonus = Math.min(0.3,
    ((user.pagesVisited || 0) * 0.01) +
    ((user.conversations || 0) * 0.05) +
    ((user.leadScore || 0) * 0.002)
  );
  return Math.min(1, stageScore + engagementBonus);
}

// ── Best option — score all options and return the highest ───────────────────
function bestOption(options, user = {}) {
  if (!options || options.length === 0) return null;
  let best = null;
  let bestScore = -1;
  for (const option of options) {
    const score = economicScore(option, user);
    if (score > bestScore) {
      bestScore = score;
      best = { ...option, _score: score };
    }
  }
  return best;
}

// ── Route to highest-yield affiliate network ─────────────────────────────────
function routeAffiliate(product) {
  const networks = [
    { id: 'direct', yield: product.directCommission || 0 },
    { id: 'affiliate_a', yield: (product.affiliateRates || {}).a || 0 },
    { id: 'affiliate_b', yield: (product.affiliateRates || {}).b || 0 },
    { id: 'marketplace', yield: (product.marketplaceRate || 0) * 0.9 },
  ];
  networks.sort((a, b) => b.yield - a.yield);
  return networks[0];
}

module.exports = {
  economicScore,
  trustScore,
  calculateCommission,
  predictConversion,
  bestOption,
  routeAffiliate,
};
