/**
 * BRIDGE AI OS — AP2-v3 Response Contract
 *
 * Strict response envelope for all AP2-v3 agent interactions.
 * Every agent response MUST pass through these constructors to guarantee
 * wire-format consistency across the Bridge economy.
 */

'use strict';

const REQUIRED_SUCCESS_KEYS = ['status', 'agent', 'data', 'meta'];
const REQUIRED_DATA_KEYS = ['type', 'content', 'chain'];
const REQUIRED_META_KEYS = ['version', 'ts', 'latency_ms', 'cost', 'tokens', 'retries'];
const VALID_STATUSES = ['success', 'error', 'chunk'];
const VALID_DATA_TYPES = ['response', 'chain_result', 'tool_call', 'delegation', 'stream'];

/**
 * Build a success response envelope.
 *
 * @param {string} agent    — agent identifier
 * @param {object} data     — payload (content, type, chain)
 * @param {object} [meta]   — optional performance metadata
 * @returns {object} AP2-v3 success envelope
 */
function success(agent, data, meta = {}) {
  if (!agent) throw new Error('AP2-v3 contract: agent is required');
  if (!data) throw new Error('AP2-v3 contract: data is required');

  return {
    status: 'success',
    agent,
    data: {
      type: data.type || 'response',
      content: data.content || data,
      chain: data.chain || [],
    },
    meta: {
      version: 'ap2-v3',
      ts: new Date().toISOString(),
      latency_ms: meta.latency_ms || 0,
      cost: meta.cost || 0,
      tokens: meta.tokens || 0,
      retries: meta.retries || 0,
    },
  };
}

/**
 * Build an error response envelope.
 *
 * @param {string} agent    — agent identifier
 * @param {string} message  — human-readable error message
 * @param {string} code     — machine-readable error code (e.g. 'TIMEOUT', 'AUTH_FAILED')
 * @param {object} [meta]   — optional performance metadata
 * @returns {object} AP2-v3 error envelope
 */
function error(agent, message, code, meta = {}) {
  if (!agent) throw new Error('AP2-v3 contract: agent is required');
  if (!message) throw new Error('AP2-v3 contract: message is required');
  if (!code) throw new Error('AP2-v3 contract: code is required');

  return {
    status: 'error',
    agent,
    data: {
      type: 'error',
      content: message,
      code,
      chain: [],
    },
    meta: {
      version: 'ap2-v3',
      ts: new Date().toISOString(),
      latency_ms: meta.latency_ms || 0,
      cost: meta.cost || 0,
      tokens: meta.tokens || 0,
      retries: meta.retries || 0,
    },
  };
}

/**
 * Build a newline-delimited JSON chunk for streaming responses.
 *
 * @param {string} agent  — agent identifier
 * @param {string} chunk  — content fragment
 * @param {number} index  — zero-based chunk sequence number
 * @returns {string} NDJSON line
 */
function streamChunk(agent, chunk, index) {
  return JSON.stringify({
    status: 'chunk',
    agent,
    data: { content: chunk, index },
    meta: { version: 'ap2-v3', ts: new Date().toISOString() },
  }) + '\n';
}

/**
 * Validate that a response object conforms to the AP2-v3 contract.
 *
 * @param {object} response — object to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validate(response) {
  const errors = [];

  if (!response || typeof response !== 'object') {
    return { valid: false, errors: ['Response must be a non-null object'] };
  }

  // Top-level keys
  for (const key of REQUIRED_SUCCESS_KEYS) {
    if (!(key in response)) errors.push('Missing top-level key: ' + key);
  }

  // Status value
  if (response.status && !VALID_STATUSES.includes(response.status)) {
    errors.push('Invalid status: ' + response.status + '. Must be one of: ' + VALID_STATUSES.join(', '));
  }

  // Agent
  if (typeof response.agent !== 'string' || !response.agent) {
    errors.push('agent must be a non-empty string');
  }

  // Data sub-keys
  if (response.data && typeof response.data === 'object') {
    for (const key of REQUIRED_DATA_KEYS) {
      if (!(key in response.data)) errors.push('Missing data key: ' + key);
    }
    if (response.data.type && !VALID_DATA_TYPES.includes(response.data.type) && response.data.type !== 'error') {
      errors.push('Invalid data.type: ' + response.data.type + '. Must be one of: ' + VALID_DATA_TYPES.join(', ') + ', error');
    }
    if (!Array.isArray(response.data.chain)) {
      errors.push('data.chain must be an array');
    }
  }

  // Meta sub-keys
  if (response.meta && typeof response.meta === 'object') {
    for (const key of REQUIRED_META_KEYS) {
      if (!(key in response.meta)) errors.push('Missing meta key: ' + key);
    }
    if (response.meta.version && response.meta.version !== 'ap2-v3') {
      errors.push('meta.version must be "ap2-v3", got: ' + response.meta.version);
    }
    if (typeof response.meta.latency_ms !== 'number') {
      errors.push('meta.latency_ms must be a number');
    }
    if (typeof response.meta.cost !== 'number') {
      errors.push('meta.cost must be a number');
    }
    if (typeof response.meta.tokens !== 'number') {
      errors.push('meta.tokens must be a number');
    }
    if (typeof response.meta.retries !== 'number') {
      errors.push('meta.retries must be a number');
    }
  }

  return { valid: errors.length === 0, errors };
}

module.exports = {
  success,
  error,
  streamChunk,
  validate,
  VALID_STATUSES,
  VALID_DATA_TYPES,
};
