const pricing = require('../lib/agent-pricing');

function calculateROI(task) {
  const revenue = parseFloat(task.reward) || 0;
  const cost = pricing[task.layer] || pricing.L1;
  const roi = revenue - cost;
  return { revenue, cost, roi, profitable: roi > 0 };
}

module.exports = { calculateROI };
