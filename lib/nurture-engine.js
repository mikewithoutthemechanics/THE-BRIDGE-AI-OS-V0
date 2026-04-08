/**
 * BRIDGE AI OS — Nurture Engine
 *
 * Automated lead nurturing logic: evaluates users, generates personalized
 * prompts for the LLM, and auto-advances funnel stages based on signals.
 */

'use strict';

// ── Score-to-Stage Thresholds ───────────────────────────────────────────────
const THRESHOLDS = {
  visitor:     { min: 0,  max: 20 },
  lead:        { min: 21, max: 40 },
  qualified:   { min: 41, max: 60 },
  opportunity: { min: 61, max: 80 },
  customer:    { min: 81, max: Infinity },
};

const STAGE_ORDER = ['visitor', 'lead', 'qualified', 'opportunity', 'customer', 'advocate'];

// ── evaluateUser ────────────────────────────────────────────────────────────
// Returns { stage_recommendation, actions, score_delta }
function evaluateUser(user) {
  if (!user) return { stage_recommendation: 'visitor', actions: [], score_delta: 0 };

  const score = user.lead_score || 0;
  let pages = [];
  try { pages = JSON.parse(user.pages_visited || '[]'); } catch (_) {}
  const convos = user.conversations || 0;
  let painPoints = [];
  try { painPoints = JSON.parse(user.pain_points || '[]'); } catch (_) {}

  const actions = [];
  let scoreDelta = 0;
  let recommended = 'visitor';

  // Determine recommended stage from score
  if (score >= THRESHOLDS.customer.min) {
    recommended = 'customer';
  } else if (score >= THRESHOLDS.opportunity.min) {
    recommended = 'opportunity';
  } else if (score >= THRESHOLDS.qualified.min) {
    recommended = 'qualified';
  } else if (score >= THRESHOLDS.lead.min) {
    recommended = 'lead';
  }

  // Behavioral signals that can bump the score
  if (pages.length >= 3 && convos >= 1 && recommended === 'visitor') {
    recommended = 'lead';
    scoreDelta += 10;
    actions.push('capture_email');
  }

  if (painPoints.length > 0 && recommended === 'lead') {
    recommended = 'qualified';
    scoreDelta += 10;
    actions.push('present_solutions');
  }

  const pricingPages = pages.filter(p => p.includes('checkout') || p.includes('pricing'));
  if (pricingPages.length > 0 && (recommended === 'lead' || recommended === 'qualified')) {
    recommended = 'opportunity';
    scoreDelta += 15;
    actions.push('recommend_plan');
  }

  if (user.plan && user.plan !== 'visitor') {
    recommended = 'customer';
    actions.push('onboard_customer');
  }

  // Suggest welcome hints for visitors
  if (recommended === 'visitor') {
    actions.push('show_welcome_hints');
  }

  return {
    stage_recommendation: recommended,
    actions,
    score_delta: scoreDelta,
  };
}

// ── getPersonalizedPrompt ───────────────────────────────────────────────────
// Returns a system prompt addon based on funnel stage
function getPersonalizedPrompt(user) {
  if (!user) return 'This is a new visitor. Be welcoming. Ask what brings them here.';

  const stage = user.funnel_stage || 'visitor';
  const score = user.lead_score || 0;
  let pages = [];
  try { pages = JSON.parse(user.pages_visited || '[]'); } catch (_) {}
  let painPoints = [];
  try { painPoints = JSON.parse(user.pain_points || '[]'); } catch (_) {}
  const plan = user.plan || 'visitor';
  const name = user.name || 'this user';

  switch (stage) {
    case 'visitor':
      return 'This is a new visitor. Be welcoming. Ask what brings them here.';

    case 'lead':
      return `This user has shown interest. They visited [${pages.join(', ')}]. Ask about their business challenges.`;

    case 'qualified':
      return `This is a qualified lead (score: ${score}). They mentioned [${painPoints.join(', ')}]. Present relevant solutions.`;

    case 'opportunity':
      return `This user is close to converting. They asked about pricing. Recommend a specific plan and offer to set it up.`;

    case 'customer':
      return `This is an existing customer on the ${plan} plan. Help them get more value. Suggest upgrades if appropriate.`;

    case 'advocate':
      return `This is an advocate customer (${name}) on the ${plan} plan. They love the product. Ask them for referrals and offer affiliate program.`;

    default:
      return 'This is a new visitor. Be welcoming. Ask what brings them here.';
  }
}

// ── autoAdvance ─────────────────────────────────────────────────────────────
// Checks if user should be promoted to next stage based on signals.
// Returns { advanced: bool, newStage: string|null }
function autoAdvance(user) {
  if (!user) return { advanced: false, newStage: null };

  const evaluation = evaluateUser(user);
  const currentIdx = STAGE_ORDER.indexOf(user.funnel_stage || 'visitor');
  const recommendedIdx = STAGE_ORDER.indexOf(evaluation.stage_recommendation);

  // Only advance forward, never regress
  if (recommendedIdx > currentIdx) {
    return {
      advanced: true,
      newStage: evaluation.stage_recommendation,
      score_delta: evaluation.score_delta,
      actions: evaluation.actions,
    };
  }

  return { advanced: false, newStage: null, score_delta: evaluation.score_delta, actions: evaluation.actions };
}

// ── Exports ─────────────────────────────────────────────────────────────────
module.exports = {
  evaluateUser,
  getPersonalizedPrompt,
  autoAdvance,
  THRESHOLDS,
  STAGE_ORDER,
};
