const credits = require('./credits');
const pricing = require('../lib/agent-pricing');

async function chargeForExecution(userId, layer) {
  const cost = pricing[layer] || pricing.L1;
  await credits.deductCredits(userId, cost);
  return cost;
}

async function ensureFunds(userId, amount) {
  const balance = await credits.getCredits(userId);
  if (balance < amount) {
    return { ok: false, redirect: '/checkout?ref=TOPUP_' + Date.now() + '&amount=' + amount + '&client=Credit+Topup&email=' };
  }
  return { ok: true, balance };
}

module.exports = { chargeForExecution, ensureFunds };
