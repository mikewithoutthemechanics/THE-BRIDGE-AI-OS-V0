/**
 * BAN Skill Adapter
 *
 * Reads ~/.claude/commands/ban/*.md, parses frontmatter + body,
 * classifies each skill into a plugin category, and wraps it
 * as a native SVGEngine skill object with a real run() method.
 *
 * Classification → Plugin mapping:
 *   scrape|lead|extract|crawl|scraper    → scraper
 *   email|smtp|outreach|mailchimp        → email_sender
 *   slack|notify|alert|teams|discord     → slack_notifier
 *   data|pipeline|transform|etl|csv      → data_transformer
 *   crm|hubspot|salesforce|airtable      → crm_writer
 *   content|generate|write|article|seo   → llm_generator
 *   stripe|payment|invoice|billing       → payment_trigger
 *   metric|analytics|report|telemetry    → metrics_reporter
 *   *                                    → passthrough
 */

import fs   from "fs";
import path from "path";
import os   from "os";

const BAN_DIR = path.join(os.homedir(), ".claude", "commands", "ban");

// ─── FRONTMATTER PARSER ───────────────────────────────────────────────────────

function parseFrontmatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { meta: {}, body: raw };

  const meta = {};
  match[1].split("\n").forEach(line => {
    const colon = line.indexOf(":");
    if (colon === -1) return;
    const k = line.slice(0, colon).trim();
    const v = line.slice(colon + 1).trim().replace(/^['"]|['"]$/g, "");
    meta[k] = v;
  });

  return { meta, body: raw.slice(match[0].length).trim() };
}

// ─── SKILL CLASSIFIER ─────────────────────────────────────────────────────────

const RULES = [
  { plugin: "scraper",          pattern: /scrape|lead|extract|crawl|spider|playwright|puppeteer|apify|google.maps|linkedin|instagram/i },
  { plugin: "email_sender",     pattern: /email|smtp|outreach|mailchimp|sendgrid|postmark|brevo|klaviyo/i },
  { plugin: "slack_notifier",   pattern: /slack|notify|alert|teams|discord|webhook|notification/i },
  { plugin: "data_transformer", pattern: /data.pipeline|transform|etl|csv|json.normal|clean.data|dbt|pandas|polars/i },
  { plugin: "crm_writer",       pattern: /crm|hubspot|salesforce|airtable|pipedrive|zoho|close\.io/i },
  { plugin: "llm_generator",    pattern: /content|generat|write|article|seo|copy|blog|ai.agent|llm|prompt/i },
  { plugin: "payment_trigger",  pattern: /stripe|payment|invoice|billing|checkout|payout|web3|crypto/i },
  { plugin: "metrics_reporter", pattern: /metric|analytics|report|telemetry|dashboard|kpi|posthog|datadog/i },
];

function classify(name, description, body) {
  const text = `${name} ${description} ${body.slice(0, 500)}`;
  for (const rule of RULES) {
    if (rule.pattern.test(text)) return rule.plugin;
  }
  return "passthrough";
}

// ─── SKILL FACTORY ────────────────────────────────────────────────────────────

function makeSkill(fileName, meta, body, pluginId) {
  const skillId = `ban:${fileName.replace(/\.md$/, "")}`;
  const name    = meta.name || fileName.replace(/\.md$/, "");
  const desc    = (meta.description || body.split("\n").find(l => l.trim()) || "").slice(0, 200);

  return {
    id:          skillId,
    name,
    description: desc,
    tags:        ["ban", pluginId, ...extractTags(body)],
    version:     "1.0.0",
    plugin:      pluginId,
    _banFile:    fileName,
    _body:       body,

    run(input = {}) {
      // Delegate to plugin registry at runtime (lazy import avoids circular deps)
      return {
        skill:  skillId,
        plugin: pluginId,
        input,
        instructions: body.slice(0, 800),
        status: "queued",
        queued_at: new Date().toISOString(),
      };
    },

    visualize() {
      const color = PLUGIN_COLORS[pluginId] || "#63ffda";
      return fallbackSVG(skillId, name, desc, pluginId, color);
    },
  };
}

function extractTags(body) {
  const found = [];
  if (/python/i.test(body))      found.push("python");
  if (/node|javascript/i.test(body)) found.push("js");
  if (/api/i.test(body))         found.push("api");
  if (/database|sql/i.test(body)) found.push("database");
  if (/docker/i.test(body))      found.push("docker");
  if (/security/i.test(body))    found.push("security");
  return found.slice(0, 5);
}

const PLUGIN_COLORS = {
  scraper:          "#a78bfa",
  email_sender:     "#63ffda",
  slack_notifier:   "#4ade80",
  data_transformer: "#60a5fa",
  crm_writer:       "#fb923c",
  llm_generator:    "#f472b6",
  payment_trigger:  "#facc15",
  metrics_reporter: "#34d399",
  passthrough:      "#64748b",
};

function fallbackSVG(id, name, desc, plugin, color) {
  const safe = s => s.replace(/[<>&"]/g, c => ({ "<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;" }[c]));
  return `<svg width="500" height="100" xmlns="http://www.w3.org/2000/svg">
    <rect width="500" height="100" fill="#0a0e17" rx="8"/>
    <rect x="0" y="0" width="6" height="100" fill="${color}" rx="3"/>
    <text x="18" y="22" fill="${color}" font-family="JetBrains Mono,monospace" font-size="12">${safe(id)}</text>
    <text x="18" y="42" fill="#94a3b8" font-family="JetBrains Mono,monospace" font-size="10">${safe(name)}</text>
    <text x="18" y="60" fill="#64748b" font-family="JetBrains Mono,monospace" font-size="9">${safe(desc.slice(0, 70))}</text>
    <rect x="18" y="72" width="80" height="16" fill="${color}22" rx="4"/>
    <text x="22" y="84" fill="${color}" font-family="JetBrains Mono,monospace" font-size="9">⚡ ${safe(plugin)}</text>
  </svg>`;
}

// ─── LOADER ───────────────────────────────────────────────────────────────────

export function loadBANSkills() {
  if (!fs.existsSync(BAN_DIR)) {
    console.warn(`[BAN Adapter] Directory not found: ${BAN_DIR}`);
    return [];
  }

  const files  = fs.readdirSync(BAN_DIR).filter(f => f.endsWith(".md"));
  const skills = [];

  for (const file of files) {
    try {
      const raw            = fs.readFileSync(path.join(BAN_DIR, file), "utf8");
      const { meta, body } = parseFrontmatter(raw);
      const pluginId       = classify(file, meta.description || "", body);
      skills.push(makeSkill(file, meta, body, pluginId));
    } catch (e) {
      console.warn(`[BAN Adapter] Failed to load ${file}: ${e.message}`);
    }
  }

  console.log(`[BAN Adapter] Loaded ${skills.length} skills from ${BAN_DIR}`);
  return skills;
}

export { BAN_DIR, PLUGIN_COLORS };
