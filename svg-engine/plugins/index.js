/**
 * Plugin Registry
 *
 * Maps plugin IDs to executor functions.
 * Each plugin has: execute(input, skillContext) → Promise<result>
 *
 * Plugins are lightweight by default — they log + return structured output.
 * Replace stub bodies with real integrations (Playwright, nodemailer, etc.)
 */

import fs   from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── SCRAPER ─────────────────────────────────────────────────────────────────

async function scraper(input, ctx) {
  const { url, query, limit = 10 } = input;

  if (!url && !query) {
    return { ok: false, error: "scraper requires url or query", plugin: "scraper" };
  }

  // Use native fetch (Node 20+)
  if (url) {
    try {
      const res  = await fetch(url, { headers: { "User-Agent": "BridgeBot/1.0" }, signal: AbortSignal.timeout(8000) });
      const html = await res.text();
      // Extract text content (basic)
      const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 2000);
      return { ok: true, plugin: "scraper", url, chars: text.length, preview: text.slice(0, 300), skill: ctx?.id };
    } catch (e) {
      return { ok: false, plugin: "scraper", error: e.message, url };
    }
  }

  // Search query → return structured stub (replace with Playwright/SerpAPI)
  return {
    ok:     true,
    plugin: "scraper",
    query,
    results: Array.from({ length: Math.min(limit, 5) }, (_, i) => ({
      rank:    i + 1,
      title:   `Result ${i + 1} for: ${query}`,
      url:     `https://example.com/result-${i + 1}`,
      snippet: `Relevant content about ${query}...`,
    })),
    note: "Replace stub with Playwright/SerpAPI for real data",
  };
}

// ─── EMAIL SENDER ─────────────────────────────────────────────────────────────

async function email_sender(input, ctx) {
  const { to, subject, body, from = "agent@bridge.ai" } = input;

  if (!to || !subject) {
    return { ok: false, error: "email_sender requires to + subject", plugin: "email_sender" };
  }

  // Log to outbox file (replace with nodemailer / SendGrid API)
  const outboxPath = path.resolve(__dirname, "../data/outbox.jsonl");
  const entry = JSON.stringify({
    ts: new Date().toISOString(), from, to, subject,
    body: (body || "").slice(0, 500),
    skill: ctx?.id,
    status: "queued",
  });

  fs.appendFileSync(outboxPath, entry + "\n");

  return {
    ok:     true,
    plugin: "email_sender",
    queued: true,
    to, subject,
    outbox: outboxPath,
    note:   "Configure SMTP_HOST/SMTP_USER/SMTP_PASS env vars to send real emails",
  };
}

// ─── SLACK NOTIFIER ───────────────────────────────────────────────────────────

async function slack_notifier(input, ctx) {
  const { message, channel = "#general", webhook } = input;
  const hook = webhook || process.env.SLACK_WEBHOOK_URL;

  if (!message) return { ok: false, error: "slack_notifier requires message", plugin: "slack_notifier" };

  if (hook) {
    try {
      const res = await fetch(hook, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ text: `[${ctx?.id || "xyerm"}] ${message}`, channel }),
        signal:  AbortSignal.timeout(5000),
      });
      return { ok: res.ok, plugin: "slack_notifier", channel, sent: res.ok };
    } catch (e) {
      return { ok: false, plugin: "slack_notifier", error: e.message };
    }
  }

  // Log only if no webhook configured
  const logPath = path.resolve(__dirname, "../data/notifications.jsonl");
  fs.appendFileSync(logPath, JSON.stringify({ ts: new Date().toISOString(), channel, message, skill: ctx?.id }) + "\n");
  return { ok: true, plugin: "slack_notifier", logged: true, note: "Set SLACK_WEBHOOK_URL to send real notifications" };
}

// ─── DATA TRANSFORMER ─────────────────────────────────────────────────────────

async function data_transformer(input, ctx) {
  const { data, operation = "normalize", schema } = input;

  if (!data) return { ok: false, error: "data_transformer requires data", plugin: "data_transformer" };

  let result;

  if (operation === "normalize") {
    // Flatten + deduplicate
    const rows   = Array.isArray(data) ? data : [data];
    const unique = [...new Map(rows.map(r => [JSON.stringify(r), r])).values()];
    result = { rows: unique, count: unique.length, deduped: rows.length - unique.length };
  } else if (operation === "csv") {
    const rows = Array.isArray(data) ? data : [data];
    const keys = Object.keys(rows[0] || {});
    const csv  = [keys.join(","), ...rows.map(r => keys.map(k => JSON.stringify(r[k] ?? "")).join(","))].join("\n");
    result = { csv, rows: rows.length, columns: keys };
  } else if (operation === "filter") {
    const rows  = Array.isArray(data) ? data : [data];
    const field = input.field, value = input.value;
    result = { rows: rows.filter(r => r[field] === value) };
  } else {
    result = { data, operation: "passthrough" };
  }

  return { ok: true, plugin: "data_transformer", operation, ...result, skill: ctx?.id };
}

// ─── CRM WRITER ───────────────────────────────────────────────────────────────

async function crm_writer(input, ctx) {
  const { collection = "leads" } = input;
  // Accept explicit record, or fall back to entire input (minus collection key)
  const { collection: _c, ...rest } = input;
  const record = input.record || (Object.keys(rest).length ? rest : null);
  if (!record) return { ok: false, error: "crm_writer requires record", plugin: "crm_writer" };

  const dbPath = path.resolve(__dirname, `../data/${collection}.jsonl`);
  const entry  = JSON.stringify({ ...record, _id: Date.now(), _ts: new Date().toISOString(), _skill: ctx?.id });
  fs.appendFileSync(dbPath, entry + "\n");

  // Count records
  const lines = fs.readFileSync(dbPath, "utf8").split("\n").filter(Boolean).length;
  return { ok: true, plugin: "crm_writer", collection, id: JSON.parse(entry)._id, total: lines };
}

// ─── LLM GENERATOR ───────────────────────────────────────────────────────────

async function llm_generator(input, ctx) {
  const { prompt, system, model = "claude-haiku-4-5-20251001", max_tokens = 500 } = input;

  if (!prompt) return { ok: false, error: "llm_generator requires prompt", plugin: "llm_generator" };

  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (apiKey) {
    try {
      const res  = await fetch("https://api.anthropic.com/v1/messages", {
        method:  "POST",
        headers: {
          "x-api-key":         apiKey,
          "anthropic-version": "2023-06-01",
          "content-type":      "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens,
          system: system || "You are a helpful AI assistant in the Bridge system.",
          messages: [{ role: "user", content: prompt }],
        }),
        signal: AbortSignal.timeout(30000),
      });
      const json = await res.json();
      const text = json.content?.[0]?.text || "";
      return { ok: true, plugin: "llm_generator", model, text, tokens: json.usage, skill: ctx?.id };
    } catch (e) {
      return { ok: false, plugin: "llm_generator", error: e.message };
    }
  }

  // Stub output if no API key
  return {
    ok:     true,
    plugin: "llm_generator",
    text:   `[Generated content for: ${prompt.slice(0, 100)}]`,
    note:   "Set ANTHROPIC_API_KEY to enable real LLM generation",
    skill:  ctx?.id,
  };
}

// ─── PAYMENT TRIGGER ─────────────────────────────────────────────────────────

async function payment_trigger(input, ctx) {
  const { amount, currency = "usd", description, to } = input;
  if (!amount) return { ok: false, error: "payment_trigger requires amount", plugin: "payment_trigger" };

  const logPath = path.resolve(__dirname, "../data/payments.jsonl");
  const entry   = JSON.stringify({
    ts: new Date().toISOString(), amount, currency, description, to,
    status: "pending", skill: ctx?.id,
  });
  fs.appendFileSync(logPath, entry + "\n");

  return {
    ok:     true,
    plugin: "payment_trigger",
    queued: true,
    amount, currency,
    note:   "Set STRIPE_SECRET_KEY to process real payments",
  };
}

// ─── METRICS REPORTER ─────────────────────────────────────────────────────────

async function metrics_reporter(input, ctx) {
  const { event, properties = {} } = input;
  if (!event) return { ok: false, error: "metrics_reporter requires event", plugin: "metrics_reporter" };

  const logPath = path.resolve(__dirname, "../data/metrics.jsonl");
  const entry   = JSON.stringify({ ts: new Date().toISOString(), event, properties, skill: ctx?.id });
  fs.appendFileSync(logPath, entry + "\n");

  // Count total events
  const total = fs.readFileSync(logPath, "utf8").split("\n").filter(Boolean).length;
  return { ok: true, plugin: "metrics_reporter", event, total_events: total };
}

// ─── PASSTHROUGH ─────────────────────────────────────────────────────────────

async function passthrough(input, ctx) {
  return { ok: true, plugin: "passthrough", input, skill: ctx?.id, note: "No plugin matched — returning input as-is" };
}

// ─── REGISTRY ─────────────────────────────────────────────────────────────────

export const PLUGINS = {
  scraper,
  email_sender,
  slack_notifier,
  data_transformer,
  crm_writer,
  llm_generator,
  payment_trigger,
  metrics_reporter,
  passthrough,
};

export async function runPlugin(pluginId, input, skillContext) {
  const fn = PLUGINS[pluginId] || PLUGINS.passthrough;
  try {
    return await fn(input, skillContext);
  } catch (e) {
    return { ok: false, plugin: pluginId, error: e.message };
  }
}
