/**
 * validation.js — Comprehensive input validation middleware
 *
 * Exports:
 *   - Individual validator functions (validateRequest, validateId, etc.)
 *   - validate: object of named middleware for route-level use
 *     Usage: app.post('/endpoint', [validate.register], handler)
 */

'use strict';

function validatePresence(value, name) {
  if (value == null || value === '') {
    return `${name} is required`;
  }
  return null;
}

function validateString(value, name, min = 1, max = 255) {
  if (typeof value !== 'string') return `${name} must be a string`;
  if (value.length < min) return `${name} must be at least ${min} characters`;
  if (value.length > max) return `${name} must be at most ${max} characters`;
  return null;
}

function validateNumber(value, name) {
  if (typeof value !== 'number' || isNaN(value)) return `${name} must be a number`;
  return null;
}

function validatePositiveNumber(value, name) {
  if (typeof value !== 'number' || isNaN(value) || value <= 0) return `${name} must be a positive number`;
  return null;
}

function validateEmail(value, name) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return `${name} must be a valid email address`;
  return null;
}

function validatePhone(value, name) {
  if (!/^[\+\d\-\s\(\)]{10,20}$/.test(value)) return `${name} must be a valid phone number`;
  return null;
}

function validateArray(value, name) {
  if (!Array.isArray(value)) return `${name} must be an array`;
  return null;
}

function validateObject(value, name) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return `${name} must be an object`;
  return null;
}

function validateId(value, name = 'ID') {
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) return `${name} contains invalid characters`;
  return null;
}

function validateUrl(value, name) {
  try { new URL(value); return null; } catch { return `${name} must be a valid URL`; }
}

function validateDate(value, name) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${name} must be in YYYY-MM-DD format`;
  return null;
}

function validateBoolean(value, name) {
  if (typeof value !== 'boolean' && !['true', 'false'].includes(String(value).toLowerCase())) {
    return `${name} must be a boolean or true/false string`;
  }
  return null;
}

function validateRequest(schema) {
  return (req, res, next) => {
    const errors = [];
    for (const [field, rules] of Object.entries(schema)) {
      const value = req.body[field] !== undefined ? req.body[field] : req.query[field];
      if (rules.required && (value == null || value === '')) { errors.push(`${field} is required`); continue; }
      if (value == null || value === '') continue;
      if (rules.type === 'string') { const e = validateString(value, field, rules.min, rules.max); if (e) errors.push(e); }
      else if (rules.type === 'number') { const e = validateNumber(value, field); if (e) errors.push(e); }
      else if (rules.type === 'positive') { const e = validatePositiveNumber(value, field); if (e) errors.push(e); }
      else if (rules.type === 'email') { const e = validateEmail(value, field); if (e) errors.push(e); }
      else if (rules.type === 'phone') { const e = validatePhone(value, field); if (e) errors.push(e); }
      else if (rules.type === 'array') { const e = validateArray(value, field); if (e) errors.push(e); }
      else if (rules.type === 'object') { const e = validateObject(value, field); if (e) errors.push(e); }
      if (rules.validate) { const e = rules.validate(value, req); if (e) errors.push(e); }
    }
    if (errors.length > 0) return res.status(400).json({ error: 'Validation failed', details: errors });
    next();
  };
}

const pass = (_req, _res, next) => next();

const validate = {
  registrySecurity: pass,
  registryFederation: pass,
  registryJobs: pass,
  registryMarket: pass,
  registryBridgeOS: pass,
  registrySystem: pass,
  registryTreasury: pass,

  secretsList: pass,
  createSecret: validateRequest({
    key_name: { type: 'string', required: true, min: 1, max: 255 },
    key_value: { type: 'string', required: true, min: 1, max: 4096 },
    service: { type: 'string', required: false, max: 100 }
  }),
  secretsWebhook: validateRequest({
    event: { type: 'string', required: false, max: 100 },
    secret: { type: 'string', required: false, max: 512 }
  }),

  getCredits: pass,
  addCredits: validateRequest({
    user_id: { type: 'string', required: true, min: 1, max: 255, validate: validateId },
    amount: { type: 'positive', required: true }
  }),
  economyExecute: validateRequest({
    action: { type: 'string', required: true, min: 1, max: 100 },
    agentId: { type: 'string', required: true, min: 1, max: 255, validate: validateId }
  }),

  subscriptionSummary: pass,
  revenueSummary: pass,
  economyIntelligence: pass,
  ledger: pass,

  mailStatus: pass,
  mailPing: pass,

  emailList: (req, res, next) => {
    const d = req.params.domain;
    if (!d || !/^[a-zA-Z0-9._-]+$/.test(d) || d.length > 253) {
      return res.status(400).json({ error: 'Invalid domain parameter' });
    }
    next();
  },
  emailCreate: validateRequest({
    address: { type: 'string', required: true, min: 3, max: 255, validate: validateEmail },
    domain: { type: 'string', required: false, max: 253 }
  }),
  emailDelete: validateRequest({
    address: { type: 'string', required: true, min: 3, max: 255, validate: validateEmail }
  }),
  emailForwarder: validateRequest({
    from: { type: 'string', required: true, min: 3, max: 255, validate: validateEmail },
    to: { type: 'string', required: true, min: 3, max: 255, validate: validateEmail }
  }),
  emailSetupBridgeProfiles: pass,

  treasuryRails: pass,
  revenueStatus: pass,

  swarmAgents: pass,
  swarmHealth: pass,
  analyticsSummary: pass,
  tools: pass,
  skills: pass,
  missionBoard: pass,
  projects: pass,

  marketplaceTasks: pass,
  marketplaceDex: pass,
  marketplaceWallet: pass,
  marketplaceStats: pass,

  intelligenceOpportunities: pass,

  register: validateRequest({
    email: { type: 'email', required: true },
    password: { type: 'string', required: true, min: 8, max: 128 },
    name: { type: 'string', required: false, max: 255 }
  }),
  login: validateRequest({
    email: { type: 'email', required: true },
    password: { type: 'string', required: true, min: 1, max: 128 }
  }),
  googleAuth: validateRequest({
    token: { type: 'string', required: true, min: 1, max: 4096 }
  }),
  authMe: pass,

  pageVisit: validateRequest({
    page: { type: 'string', required: true, min: 1, max: 500 }
  }),
  conversation: validateRequest({
    message: { type: 'string', required: true, min: 1, max: 10000 }
  }),
  userJourney: pass,

  nurtureQueue: pass,
  nurtureAdvance: validateRequest({
    leadId: { type: 'string', required: true, min: 1, max: 255, validate: validateId }
  }),
  nurtureFunnel: pass,
  nurtureLeads: pass,

  createApiKey: validateRequest({
    name: { type: 'string', required: true, min: 1, max: 255 },
    credits: { type: 'positive', required: false }
  }),
  apiKeyUsage: pass,
  validateApiKey: pass,
  apiKeyTopup: validateRequest({
    key: { type: 'string', required: true, min: 1, max: 255 },
    credits: { type: 'positive', required: true }
  }),

  telegramWebhook: validateRequest({
    update_id: { type: 'number', required: false }
  }),
  telegramSetWebhook: validateRequest({
    url: { type: 'string', required: true, min: 1, max: 2048, validate: validateUrl }
  }),

  registryKernel: pass,
  registryNetwork: pass,

  agents: pass,
  agentsExecutePaid: validateRequest({
    agentId: { type: 'string', required: true, min: 1, max: 255, validate: validateId },
    layer: { type: 'string', required: true, min: 1, max: 10 },
    task: { type: 'string', required: false, max: 10000 }
  }),
  agentsPricing: pass,
  agentsDispatch: validateRequest({
    agent: { type: 'string', required: false, max: 255 },
    task: { type: 'string', required: false, max: 10000 },
    priority: { type: 'string', required: false, max: 20 }
  }),

  contracts: pass,
  status: pass,
  full: pass,
  economics: pass,

  notionInit: pass,
  notionSync: pass,
  notionStats: pass,

  treasury: pass,

  referralClaim: validateRequest({
    code: { type: 'string', required: true, min: 1, max: 255, validate: validateId },
    wallet: { type: 'string', required: false, max: 255 }
  }),

  referralCreate: validateRequest({
    user_id: { type: 'string', required: true, min: 1, max: 255 }
  }),

  leadgenAutoProspect: validateRequest({
    industry: { type: 'string', required: false, max: 100 },
    region: { type: 'string', required: false, max: 100 },
    count: { type: 'positive', required: false }
  }),
  leadgenAutoNurture: pass,
  leadgenAutoClose: validateRequest({
    lead_id: { type: 'string', required: true, min: 1, max: 255, validate: validateId },
    offer: { type: 'string', required: false, max: 500 }
  }),

  mailTest: validateRequest({
    to: { type: 'email', required: false }
  }),
  mailSend: validateRequest({
    to: { type: 'string', required: true, min: 1, max: 2048 },
    subject: { type: 'string', required: true, min: 1, max: 500 },
    html: { type: 'string', required: false, max: 1000000 },
    text: { type: 'string', required: false, max: 1000000 },
    from: { type: 'string', required: false, max: 255 },
    replyTo: { type: 'string', required: false, max: 255 }
  }),

  wordpressStatus: pass,
  wordpressData: pass,
  wordpressPreview: pass,
  wordpressSync: pass,
  wordpressSyncSite: (req, res, next) => {
    const s = req.params.site;
    if (!s || !/^[a-zA-Z0-9._-]+$/.test(s) || s.length > 100) {
      return res.status(400).json({ error: 'Invalid site parameter' });
    }
    next();
  },
  wordpressUsersSite: (req, res, next) => {
    const s = req.params.site;
    if (!s || !/^[a-zA-Z0-9._-]+$/.test(s) || s.length > 100) {
      return res.status(400).json({ error: 'Invalid site parameter' });
    }
    next();
  },
  wordpressProfilesSite: (req, res, next) => {
    const s = req.params.site;
    if (!s || !/^[a-zA-Z0-9._-]+$/.test(s) || s.length > 100) {
      return res.status(400).json({ error: 'Invalid site parameter' });
    }
    next();
  },
  wordpressPostsSite: (req, res, next) => {
    const s = req.params.site;
    if (!s || !/^[a-zA-Z0-9._-]+$/.test(s) || s.length > 100) {
      return res.status(400).json({ error: 'Invalid site parameter' });
    }
    next();
  },
  wordpressPostsUpdate: (req, res, next) => {
    const s = req.params.site;
    const id = req.params.id;
    const errors = [];
    if (!s || !/^[a-zA-Z0-9._-]+$/.test(s) || s.length > 100) errors.push('Invalid site parameter');
    if (!id || !/^[a-zA-Z0-9_-]+$/.test(id) || id.length > 100) errors.push('Invalid id parameter');
    if (errors.length > 0) return res.status(400).json({ error: 'Validation failed', details: errors });
    next();
  },
  wordpressSyncPostSite: (req, res, next) => {
    const s = req.params.site;
    if (!s || !/^[a-zA-Z0-9._-]+$/.test(s) || s.length > 100) {
      return res.status(400).json({ error: 'Invalid site parameter' });
    }
    next();
  },

  authWpLogin: pass,
  authWpPlugin: pass,

  tvm: pass,
  tvmSummary: pass,
  tvmRecommendations: pass,
  tvmTopic: (req, res, next) => {
    const t = req.params.topic;
    if (!t || !/^[a-zA-Z0-9_-]+$/.test(t) || t.length > 200) {
      return res.status(400).json({ error: 'Invalid topic parameter' });
    }
    next();
  },
  tvmTopicUpdate: (req, res, next) => {
    const t = req.params.topic;
    if (!t || !/^[a-zA-Z0-9_-]+$/.test(t) || t.length > 200) {
      return res.status(400).json({ error: 'Invalid topic parameter' });
    }
    next();
  },
  tvmTopicApprove: (req, res, next) => {
    const t = req.params.topic;
    if (!t || !/^[a-zA-Z0-9_-]+$/.test(t) || t.length > 200) {
      return res.status(400).json({ error: 'Invalid topic parameter' });
    }
    next();
  },
  tvmTopicReject: (req, res, next) => {
    const t = req.params.topic;
    if (!t || !/^[a-zA-Z0-9_-]+$/.test(t) || t.length > 200) {
      return res.status(400).json({ error: 'Invalid topic parameter' });
    }
    next();
  },
  tvmTopicPropose: (req, res, next) => {
    const t = req.params.topic;
    if (!t || !/^[a-zA-Z0-9_-]+$/.test(t) || t.length > 200) {
      return res.status(400).json({ error: 'Invalid topic parameter' });
    }
    next();
  },

  apiHealth: pass,

  twinEnvKeys: pass,

  adminKeys: validateRequest({
    keys: { type: 'object', required: true }
  }),

  ubiClaim: validateRequest({
    address: { type: 'string', required: true, min: 1, max: 255 }
  }),

  userSettingsGet: pass,
  userSettingsPut: pass,

  liveReport: pass,
  twins: pass,
  twinsLeaderboard: pass,
  sdgMetrics: pass,
  reputationTop: pass,

  replicationStatus: pass,
  replicationNodes: pass,

  demandPump: validateRequest({
    target_backlog: { type: 'positive', required: false },
    max_create: { type: 'positive', required: false }
  }),

  sensorsMouse: pass,

  intelligenceDashboard: pass,
  intelligenceModel: pass,
  intelligenceRoute: pass,

  governanceDashboard: pass,
  governanceProposalsGet: pass,
  governanceProposalsPost: validateRequest({
    title: { type: 'string', required: true, min: 1, max: 500 },
    description: { type: 'string', required: false, max: 5000 }
  }),
  governanceVote: validateRequest({
    proposal: { type: 'string', required: true, min: 1, max: 255 },
    vote: { type: 'string', required: true, min: 1, max: 20 }
  }),
  governanceLeaderboard: pass,
  governancePolicies: pass,

  pricing: pass,
  crmContacts: pass,
  invoices: pass,
  marketingFunnel: pass,
  complianceStatus: pass,
  ehsaDashboard: pass,

  founderTaxGet: pass,
  founderTaxPost: validateRequest({
    rate: { type: 'positive', required: true }
  }),
  founderBalance: pass,

  marketplaceSkills: pass,
  marketplacePortfolio: pass,

  secretsDelete: (req, res, next) => {
    const k = req.params.key;
    if (!k || !/^[A-Z_][A-Z0-9_]*$/.test(k) || k.length > 255) {
      return res.status(400).json({ error: 'Invalid key parameter' });
    }
    next();
  },

  shareContext: (req, res, next) => {
    const id = req.params.id;
    if (!id || !/^[a-zA-Z0-9_-]+$/.test(id) || id.length > 255) {
      return res.status(400).json({ error: 'Invalid share ID' });
    }
    next();
  },
  shareHistory: (req, res, next) => {
    const id = req.params.id;
    if (!id || !/^[a-zA-Z0-9_-]+$/.test(id) || id.length > 255) {
      return res.status(400).json({ error: 'Invalid share ID' });
    }
    next();
  },
  shareMetadata: (req, res, next) => {
    const id = req.params.id;
    if (!id || !/^[a-zA-Z0-9_-]+$/.test(id) || id.length > 255) {
      return res.status(400).json({ error: 'Invalid share ID' });
    }
    next();
  },

  logs: pass,

  apiIndex: pass
};

module.exports = {
  validateRequest,
  validateId,
  validateEmail,
  validatePhone,
  validateUrl,
  validateDate,
  validateBoolean,
  validatePositiveNumber,
  validateArray,
  validateObject,
  validateString,
  validateNumber,
  validatePresence,
  validate
};
