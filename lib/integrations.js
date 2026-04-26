/**
 * BRIDGE AI OS — Integration Engine
 *
 * Stateless, retry-safe dispatch layer for pushing outputs into external systems.
 * Supports: Slack, GitHub, Notion, Zapier webhooks, generic REST, MCP, CLR.
 *
 * Design principles:
 *  - Every integration is a pure function: (output, config) → result
 *  - No persistent connections; each call is independent (serverless-safe)
 *  - All failures are thrown with structured error objects (caller handles retry)
 *  - Timeout enforced per call (default 15s)
 *
 * Usage:
 *   const { runIntegration } = require('./lib/integrations');
 *   const result = await runIntegration('slack', outputRow, { webhook: '...' });
 */

'use strict';

const TIMEOUT_MS = parseInt(process.env.INTEGRATION_TIMEOUT_MS || '15000', 10);

// ── Timeout wrapper ──────────────────────────────────────────────────────────

function withTimeout(promise, ms = TIMEOUT_MS, label = 'integration') {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

// ── Slack ────────────────────────────────────────────────────────────────────

async function runSlack(output, config) {
  const { webhookUrl } = config;
  if (!webhookUrl) throw new Error('Slack: webhookUrl required');

  const text = [
    `*${output.title || 'Bridge AI Output'}*`,
    `Project: \`${output.project_id}\` | Format: \`${output.format}\``,
    output.format === 'markdown' && typeof output.payload === 'string'
      ? output.payload.slice(0, 2000)
      : `\`\`\`${JSON.stringify(output.payload, null, 2).slice(0, 1500)}\`\`\``,
  ].join('\n');

  const res = await withTimeout(
    fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    }),
    TIMEOUT_MS,
    'Slack'
  );

  if (!res.ok) throw new Error(`Slack delivery failed: ${res.status} ${await res.text()}`);
  return { ok: true, target: 'slack', status: res.status };
}

// ── GitHub ───────────────────────────────────────────────────────────────────

async function runGitHub(output, config) {
  const { token, owner, repo, action = 'issue' } = config;
  if (!token || !owner || !repo) throw new Error('GitHub: token, owner, repo required');

  const baseUrl = `https://api.github.com/repos/${owner}/${repo}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  if (action === 'issue') {
    const body = typeof output.payload === 'string'
      ? output.payload
      : `## ${output.title}\n\n\`\`\`json\n${JSON.stringify(output.payload, null, 2)}\n\`\`\``;

    const res = await withTimeout(
      fetch(`${baseUrl}/issues`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ title: output.title || 'Bridge AI Output', body }),
      }),
      TIMEOUT_MS, 'GitHub'
    );
    if (!res.ok) throw new Error(`GitHub issue create failed: ${res.status}`);
    const data = await res.json();
    return { ok: true, target: 'github', action, url: data.html_url };
  }

  if (action === 'dispatch') {
    const { eventType = 'bridge-output', clientPayload = {} } = config;
    const res = await withTimeout(
      fetch(`${baseUrl}/dispatches`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          event_type: eventType,
          client_payload: { ...clientPayload, output_id: output.id, payload: output.payload },
        }),
      }),
      TIMEOUT_MS, 'GitHub dispatch'
    );
    if (!res.ok) throw new Error(`GitHub dispatch failed: ${res.status}`);
    return { ok: true, target: 'github', action: 'dispatch' };
  }

  throw new Error(`GitHub: unsupported action "${action}"`);
}

// ── Notion ───────────────────────────────────────────────────────────────────

async function runNotion(output, config) {
  const { token, databaseId } = config;
  if (!token || !databaseId) throw new Error('Notion: token and databaseId required');

  // Build Notion page properties
  const content = typeof output.payload === 'string'
    ? output.payload
    : JSON.stringify(output.payload, null, 2);

  const body = {
    parent: { database_id: databaseId },
    properties: {
      Name: { title: [{ text: { content: output.title || 'Bridge AI Output' } }] },
      Status: { select: { name: 'Done' } },
      Format: { select: { name: output.format } },
      'Project ID': { rich_text: [{ text: { content: output.project_id } }] },
    },
    children: [
      {
        object: 'block',
        type: 'code',
        code: {
          rich_text: [{ text: { content: content.slice(0, 2000) } }],
          language: output.format === 'json' ? 'json' : 'markdown',
        },
      },
    ],
  };

  const res = await withTimeout(
    fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }),
    TIMEOUT_MS, 'Notion'
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Notion create page failed: ${res.status} ${err.message || ''}`);
  }
  const page = await res.json();
  return { ok: true, target: 'notion', url: page.url };
}

// ── Zapier / Generic Webhook ─────────────────────────────────────────────────

async function runWebhook(output, config) {
  const { url, method = 'POST', headers: extraHeaders = {}, wrapKey = null } = config;
  if (!url) throw new Error('Webhook: url required');

  const payload = wrapKey
    ? { [wrapKey]: output.payload, _meta: { outputId: output.id, projectId: output.project_id, format: output.format } }
    : output.payload;

  const res = await withTimeout(
    fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...extraHeaders },
      body: JSON.stringify(payload),
    }),
    TIMEOUT_MS, 'Webhook'
  );

  if (!res.ok) throw new Error(`Webhook delivery failed: ${res.status} ${await res.text()}`);
  const responseBody = await res.text();
  return { ok: true, target: 'webhook', status: res.status, response: responseBody.slice(0, 500) };
}

// ── MCP (Model Context Protocol) ────────────────────────────────────────────

async function runMCP(output, config) {
  const { endpoint, apiKey, contextType = 'document' } = config;
  if (!endpoint) throw new Error('MCP: endpoint required');

  const mcpPayload = {
    jsonrpc: '2.0',
    id: output.id,
    method: 'tools/call',
    params: {
      name: 'ingest_output',
      arguments: {
        type: contextType,
        content: output.payload,
        metadata: {
          outputId: output.id,
          projectId: output.project_id,
          format: output.format,
          title: output.title,
        },
      },
    },
  };

  const res = await withTimeout(
    fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify(mcpPayload),
    }),
    TIMEOUT_MS, 'MCP'
  );

  if (!res.ok) throw new Error(`MCP call failed: ${res.status}`);
  const data = await res.json();
  return { ok: true, target: 'mcp', result: data.result };
}

// ── CLR (Composable Logic Runtime) ───────────────────────────────────────────

async function runCLR(output, config) {
  const { endpoint, runtimeId, apiKey, triggerEvent = 'output.ready' } = config;
  if (!endpoint || !runtimeId) throw new Error('CLR: endpoint and runtimeId required');

  const clrPayload = {
    runtimeId,
    event: triggerEvent,
    payload: {
      outputId: output.id,
      projectId: output.project_id,
      format: output.format,
      type: output.type,
      data: output.payload,
    },
    ts: Date.now(),
  };

  const res = await withTimeout(
    fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'X-CLR-API-Key': apiKey } : {}),
      },
      body: JSON.stringify(clrPayload),
    }),
    TIMEOUT_MS, 'CLR'
  );

  if (!res.ok) throw new Error(`CLR trigger failed: ${res.status}`);
  const data = await res.json().catch(() => ({}));
  return { ok: true, target: 'clr', runtimeId, executionId: data.executionId };
}

// ── Dispatcher ───────────────────────────────────────────────────────────────

const RUNNERS = {
  slack:   runSlack,
  github:  runGitHub,
  notion:  runNotion,
  webhook: runWebhook,
  zapier:  runWebhook,   // Zapier = generic webhook
  mcp:     runMCP,
  clr:     runCLR,
};

/**
 * Run an integration for a given output.
 *
 * @param {string} target - 'slack' | 'github' | 'notion' | 'webhook' | 'zapier' | 'mcp' | 'clr'
 * @param {object} output - output row from Supabase
 * @param {object} config - integration-specific config (tokens, URLs, etc.)
 * @returns {object} { ok, target, ...result }
 * @throws on failure (caller should call markFailed)
 */
async function runIntegration(target, output, config = {}) {
  const runner = RUNNERS[target];
  if (!runner) throw new Error(`Unknown integration target: "${target}". Supported: ${Object.keys(RUNNERS).join(', ')}`);
  return runner(output, config);
}

/**
 * List supported integration targets and their required config keys.
 */
function listTargets() {
  return {
    slack:   { required: ['webhookUrl'], description: 'Post output to a Slack channel via Incoming Webhook' },
    github:  { required: ['token', 'owner', 'repo'], optional: ['action', 'eventType'], description: 'Create GitHub issue or trigger repository dispatch' },
    notion:  { required: ['token', 'databaseId'], description: 'Create a Notion database page' },
    webhook: { required: ['url'], optional: ['method', 'headers', 'wrapKey'], description: 'POST to any HTTP endpoint (Zapier, Make, custom)' },
    zapier:  { required: ['url'], description: 'Trigger a Zapier webhook zap' },
    mcp:     { required: ['endpoint'], optional: ['apiKey', 'contextType'], description: 'Ingest into an MCP-compatible runtime' },
    clr:     { required: ['endpoint', 'runtimeId'], optional: ['apiKey', 'triggerEvent'], description: 'Trigger a Composable Logic Runtime' },
  };
}

module.exports = {
  runIntegration,
  listTargets,
  // Exported for unit testing individual runners
  runSlack,
  runGitHub,
  runNotion,
  runWebhook,
  runMCP,
  runCLR,
};
