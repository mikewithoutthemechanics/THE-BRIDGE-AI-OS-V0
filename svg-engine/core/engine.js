/**
 * BRIDGE SVG SKILL ENGINE — Core Orchestrator
 *
 * Perception → Discovery → Adoption → Execution → Teaching → Expression
 *
 * Skill contract (locked interface):
 *   { id, name, description, tags[], version, run(input)→data, visualize(input)→SVGString }
 *
 * Discovery sources:
 *   1. Filesystem scan  (*.skill.js)
 *   2. Remote registry  (Bridge API /api/skills/definitions)
 *   3. Inline registration (engine.register())
 */
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class SVGEngine {
  constructor({ skillPath, apiBase = "http://localhost:8000", cacheMs = 30000 } = {}) {
    this.skillPath = skillPath || path.resolve(__dirname, "../skills");
    this.apiBase   = apiBase;
    this.cacheMs   = cacheMs;
    this.skills    = new Map();          // id → skill object
    this._execLog  = [];                  // execution telemetry
    this._teachLog = [];
  }

  // ─── DISCOVER ────────────────────────────────────────────────────────────────

  discoverLocal() {
    if (!fs.existsSync(this.skillPath)) return [];
    return fs.readdirSync(this.skillPath)
      .filter(f => f.endsWith(".skill.js"))
      .map(f => pathToFileURL(path.join(this.skillPath, f)).href);
  }

  async discoverRemote() {
    try {
      const res = await fetch(`${this.apiBase}/api/skills/definitions`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return [];
      const json = await res.json();
      return (json.definitions || []).map(d => ({ ...d, _remote: true }));
    } catch {
      return [];
    }
  }

  // ─── ADOPT ───────────────────────────────────────────────────────────────────

  async load() {
    const localFiles   = this.discoverLocal();
    const remoteSkills = await this.discoverRemote();

    // Load local file skills
    for (const fileUrl of localFiles) {
      try {
        const mod   = await import(fileUrl);
        const skill = mod.default || mod.skill;
        if (skill?.id) {
          this.skills.set(skill.id, { ...skill, _source: "local", _loadedAt: Date.now() });
        }
      } catch (e) {
        console.warn(`[SVGEngine] Failed to load skill ${fileUrl}:`, e.message);
      }
    }

    // Register remote skeleton skills (local implementations take precedence)
    for (const def of remoteSkills) {
      if (!this.skills.has(def.id)) {
        this.skills.set(def.id, { ...def, _source: "remote", _loadedAt: Date.now() });
      }
    }

    console.log(`[SVGEngine] Loaded ${this.skills.size} skills: [${[...this.skills.keys()].join(", ")}]`);
    return this;
  }

  register(skill) {
    if (!skill?.id) throw new Error("skill.id required");
    this.skills.set(skill.id, { ...skill, _source: "inline", _loadedAt: Date.now() });
    return this;
  }

  // ─── EXECUTE ─────────────────────────────────────────────────────────────────

  /**
   * Set the plugin executor so BAN skills can delegate to real plugins.
   * Called once at boot: engine.setPluginRunner(runPlugin)
   */
  setPluginRunner(fn) { this._runPlugin = fn; }

  async execute(skillId, input = {}) {
    const skill = this._require(skillId);
    const t0    = Date.now();

    let data;
    if (skill.plugin && this._runPlugin) {
      // BAN skill → delegate to the real plugin executor
      data = await this._runPlugin(skill.plugin, input, skill);
    } else {
      data = typeof skill.run === "function" ? skill.run(input) : { note: "No run() method" };
    }

    const ms = Date.now() - t0;
    this._execLog.push({ id: skillId, ms, ts: t0 });
    if (this._execLog.length > 500) this._execLog.shift();
    return { ok: true, skill: skillId, data, latency_ms: ms, ts: t0 };
  }

  // ─── TEACH ───────────────────────────────────────────────────────────────────

  teach(skillId, input = {}) {
    const skill = this._require(skillId);
    const t0    = Date.now();
    const svg   = skill.visualize
      ? skill.visualize(input)
      : this._fallbackSVG(skill);
    this._teachLog.push({ id: skillId, ts: t0 });
    return svg;
  }

  tutorial(skillId, input = {}) {
    const skill = this._require(skillId);
    const svg   = this.teach(skillId, input);
    return {
      id:          skillId,
      name:        skill.name || skillId,
      description: skill.description || "",
      tags:        skill.tags || [],
      version:     skill.version || "1.0.0",
      svg,
      steps:       skill.steps || [],
      source:      skill._source,
      generated:   new Date().toISOString(),
    };
  }

  // ─── GRAPH ───────────────────────────────────────────────────────────────────

  graph({ filter, limit = 60 } = {}) {
    let skills = [...this.skills.values()];
    if (filter) skills = skills.filter(s => s.tags?.includes(filter) || s.plugin === filter || s.id.includes(filter));

    // Prioritize: executed skills first, then native, then BAN by plugin variety
    const execSet = new Set(this._execLog.map(e => e.id));
    skills.sort((a, b) => {
      const aExec = execSet.has(a.id) ? 1 : 0;
      const bExec = execSet.has(b.id) ? 1 : 0;
      if (bExec !== aExec) return bExec - aExec;
      const aNative = a._source === "local" ? 1 : 0;
      const bNative = b._source === "local" ? 1 : 0;
      return bNative - aNative;
    });

    if (skills.length > limit) skills = skills.slice(0, limit);
    return buildGraphSVG(skills, this._execLog, this._teachLog);
  }

  // ─── INTROSPECTION ───────────────────────────────────────────────────────────

  list() {
    return [...this.skills.entries()].map(([id, s]) => ({
      id,
      name:        s.name || id,
      description: s.description || "",
      tags:        s.tags || [],
      version:     s.version || "1.0.0",
      source:      s._source,
    }));
  }

  telemetry() {
    const recent = this._execLog.slice(-100);
    const latencies = recent.map(e => e.ms);
    const p50 = latencies.length ? sorted(latencies)[Math.floor(latencies.length * 0.5)] : 0;
    const p95 = latencies.length ? sorted(latencies)[Math.floor(latencies.length * 0.95)] : 0;
    return { total_executions: this._execLog.length, svg_builds: this._teachLog.length, p50_ms: p50, p95_ms: p95, skills_loaded: this.skills.size };
  }

  // ─── PRIVATE ─────────────────────────────────────────────────────────────────

  _require(id) {
    const skill = this.skills.get(id);
    if (!skill) throw new Error(`Skill not found: "${id}". Available: [${[...this.skills.keys()].join(", ")}]`);
    return skill;
  }

  _fallbackSVG(skill) {
    return `<svg width="400" height="80" xmlns="http://www.w3.org/2000/svg">
      <rect width="400" height="80" fill="#0a0e17" rx="8"/>
      <text x="20" y="30" fill="#63ffda" font-family="JetBrains Mono,monospace" font-size="13">${skill.id}</text>
      <text x="20" y="52" fill="#64748b" font-family="JetBrains Mono,monospace" font-size="11">${skill.description || "No visualization defined"}</text>
    </svg>`;
  }
}

// ─── SKILL DEPENDENCY GRAPH SVG ───────────────────────────────────────────────

const PLUGIN_COLORS = {
  scraper: "#a78bfa", email_sender: "#63ffda", slack_notifier: "#4ade80",
  data_transformer: "#60a5fa", crm_writer: "#fb923c", llm_generator: "#f472b6",
  payment_trigger: "#facc15", metrics_reporter: "#34d399", passthrough: "#64748b",
};

function buildGraphSVG(skills, execLog, teachLog) {
  const W = 1100, H = 700, cx = W / 2, cy = H / 2 + 20;
  const r = Math.min(cx, cy) - 140;
  const n = skills.length;
  const totalExec = execLog.length;
  const totalSVG  = (teachLog || []).length;

  // Execution heat per skill
  const execCounts = {};
  execLog.forEach(e => { execCounts[e.id] = (execCounts[e.id] || 0) + 1; });

  // Plugin distribution
  const pluginDist = {};
  skills.forEach(s => {
    const p = s.plugin || (s._source === "local" ? "native" : "other");
    pluginDist[p] = (pluginDist[p] || 0) + 1;
  });

  const nodes = skills.map((s, i) => {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2;
    const plugin = s.plugin || "native";
    return {
      ...s, plugin,
      x: Math.round(cx + r * Math.cos(angle)),
      y: Math.round(cy + r * Math.sin(angle)),
      count: execCounts[s.id] || 0,
      color: PLUGIN_COLORS[plugin] || "#63ffda",
    };
  });

  // Tag-based edges
  const tagEdges = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const shared = (nodes[i].tags || []).filter(t => (nodes[j].tags || []).includes(t));
      if (shared.length) tagEdges.push({ a: nodes[i], b: nodes[j], shared });
    }
  }

  // Defs: glow filter + pulse animation
  const defs = `<defs>
    <filter id="glow"><feGaussianBlur stdDeviation="3" result="g"/>
      <feMerge><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <radialGradient id="hotGrad" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#a78bfa" stop-opacity="0.4"/>
      <stop offset="100%" stop-color="#a78bfa" stop-opacity="0"/>
    </radialGradient>
  </defs>`;

  const edges = tagEdges.map(e =>
    `<line x1="${e.a.x}" y1="${e.a.y}" x2="${e.b.x}" y2="${e.b.y}" stroke="rgba(99,255,218,0.12)" stroke-width="1"/>`
  ).join("\n");

  const nodeSVGs = nodes.map(nd => {
    const heat  = Math.min(1, nd.count / 10);
    const rad   = 16 + Math.min(nd.count * 2, 20);
    const label = nd.id.replace("ban:", "");
    const pulse = nd.count > 0
      ? `<circle cx="${nd.x}" cy="${nd.y}" r="${rad + 8}" fill="none" stroke="${nd.color}" stroke-width="0.5" opacity="0.6">
           <animate attributeName="r" from="${rad}" to="${rad + 14}" dur="2s" repeatCount="indefinite"/>
           <animate attributeName="opacity" from="0.6" to="0" dur="2s" repeatCount="indefinite"/>
         </circle>` : "";
    return `<g>
      ${pulse}
      <circle cx="${nd.x}" cy="${nd.y}" r="${rad}" fill="rgba(${nd.color === "#63ffda" ? "99,255,218" : "167,139,250"},0.06)" stroke="${nd.color}" stroke-width="${1 + heat}" ${nd.count > 3 ? 'filter="url(#glow)"' : ""}/>
      <circle cx="${nd.x}" cy="${nd.y}" r="5" fill="${nd.color}"/>
      <text x="${nd.x}" y="${nd.y - rad - 6}" text-anchor="middle" fill="${nd.color}" font-family="JetBrains Mono,monospace" font-size="9">${label.length > 20 ? label.slice(0, 18) + ".." : label}</text>
      ${nd.count > 0 ? `<text x="${nd.x}" y="${nd.y + rad + 14}" text-anchor="middle" fill="#94a3b8" font-family="monospace" font-size="9">${nd.count}x</text>` : ""}
    </g>`;
  }).join("\n");

  // Stats bar (top)
  const statsBar = `
    <rect x="20" y="12" width="260" height="28" fill="#111827" rx="6" stroke="rgba(99,255,218,0.15)"/>
    <text x="32" y="31" fill="#63ffda" font-family="JetBrains Mono,monospace" font-size="11">⚡ ${totalExec} exec</text>
    <text x="130" y="31" fill="#a78bfa" font-family="JetBrains Mono,monospace" font-size="11">◆ ${totalSVG} SVG builds</text>
    <text x="250" y="31" fill="#4ade80" font-family="JetBrains Mono,monospace" font-size="11">● ${n} skills</text>
  `;

  // Plugin legend (bottom)
  const legendEntries = Object.entries(pluginDist);
  const legend = legendEntries.map(([plugin, count], i) => {
    const lx = 24 + (i % 5) * 210;
    const ly = H - 48 + Math.floor(i / 5) * 18;
    const col = PLUGIN_COLORS[plugin] || "#63ffda";
    return `<circle cx="${lx}" cy="${ly}" r="4" fill="${col}"/>
      <text x="${lx + 10}" y="${ly + 4}" fill="#94a3b8" font-family="JetBrains Mono,monospace" font-size="9">${plugin} (${count})</text>`;
  }).join("\n");

  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${W}" height="${H}" fill="#060810" rx="12"/>
    ${defs}
    <text x="${cx}" y="30" text-anchor="middle" fill="#63ffda" font-family="JetBrains Mono,monospace" font-size="14" font-weight="bold">BRIDGE SKILL GRAPH — ${n} skills · ${Object.keys(pluginDist).length} plugin types</text>
    ${statsBar}
    ${edges}
    ${nodeSVGs}
    <line x1="20" y1="${H - 60}" x2="${W - 20}" y2="${H - 60}" stroke="rgba(99,255,218,0.1)"/>
    ${legend}
  </svg>`;
}

function sorted(arr) { return [...arr].sort((a, b) => a - b); }
