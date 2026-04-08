/**
 * BRIDGE AI OS — AP2 Service Catalog
 *
 * Exposes agent skills as AP2 Service Offers with pricing.
 * External agents discover available services through this catalog.
 */

'use strict';

const { getAgentRegistry, agentWallet } = require('./ap2-identity');

// Pricing tiers by agent type (BRDG per service call)
const PRICING = {
  orchestrator: { brdg: 10, usd: 0.50 },
  skill:        { brdg: 5,  usd: 0.25 },
  business:     { brdg: 15, usd: 0.75 },
  prime:        { brdg: 50, usd: 2.50 },
  twin:         { brdg: 50, usd: 2.50 },
  bossbot:      { brdg: 15, usd: 0.75 },
  ban_node:     { brdg: 5,  usd: 0.25 },
};

// Category mapping by agent type
const CATEGORIES = {
  orchestrator: 'infrastructure',
  skill:        'ai_skill',
  business:     'business_service',
  prime:        'premium',
  twin:         'premium',
  bossbot:      'trading',
  ban_node:     'execution',
};

/**
 * Build a service offer from an agent and one of its skills.
 */
function buildServiceOffer(agent, skillName, index) {
  const pricing = PRICING[agent.type] || PRICING.skill;
  const category = CATEGORIES[agent.type] || 'general';

  return {
    service_id: `svc_${agent.id}_${skillName}`,
    agent_id: agent.id,
    name: `${agent.name} — ${skillName.replace(/_/g, ' ')}`,
    description: `${skillName.replace(/_/g, ' ')} provided by ${agent.name} (${agent.type})`,
    price_brdg: pricing.brdg,
    price_usd: pricing.usd,
    category,
    availability: agent.status === 'active' ? 'available' : 'unavailable',
    payment_address: agent.wallet || agentWallet(agent.id),
    protocol_version: 'ap2-v1',
  };
}

/**
 * Get the full AP2 service catalog — all agent skills as service offers.
 * @returns {{ services: object[], total: number, categories: string[], updated_at: string }}
 */
function getServiceCatalog() {
  const registry = getAgentRegistry();
  const services = [];

  registry.forEach(agent => {
    if (!Array.isArray(agent.skills)) return;
    agent.skills.forEach((skill, i) => {
      services.push(buildServiceOffer(agent, skill, i));
    });
  });

  const categories = [...new Set(services.map(s => s.category))];

  return {
    services,
    total: services.length,
    categories,
    pricing_tiers: PRICING,
    updated_at: new Date().toISOString(),
  };
}

/**
 * Find a specific service by service_id.
 */
function getService(serviceId) {
  const { services } = getServiceCatalog();
  return services.find(s => s.service_id === serviceId) || null;
}

/**
 * Find services by agent ID.
 */
function getServicesByAgent(agentId) {
  const { services } = getServiceCatalog();
  return services.filter(s => s.agent_id === agentId);
}

/**
 * Find services by category.
 */
function getServicesByCategory(category) {
  const { services } = getServiceCatalog();
  return services.filter(s => s.category === category);
}

module.exports = {
  getServiceCatalog,
  getService,
  getServicesByAgent,
  getServicesByCategory,
  PRICING,
};
