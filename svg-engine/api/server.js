/**
 * BRIDGE SVG SKILL ENGINE v3.0 — API Server (port 7070)
 *
 * Routes (original):
 *   GET  /                -> service info
 *   GET  /health          -> health check
 *   GET  /skills          -> list all skills (native + BAN)
 *   GET  /skills/:id      -> skill definition
 *   GET  /run/:id         -> execute skill
 *   GET  /teach/:id       -> SVG visualization
 *   GET  /tutorial/:id    -> full tutorial object
 *   GET  /graph           -> system-wide skill graph SVG
 *   GET  /telemetry       -> engine telemetry
 *   POST /register        -> inline-register a skill
 *
 * Routes (v3 additions — BAN + Workflow):
 *   GET  /ban/skills      -> list BAN skills (filterable by ?plugin= &q=)
 *   GET  /workflows       -> list all workflows
 *   GET  /workflows/active        -> active runs
 *   POST /workflows/:id/run       -> execute workflow
 *   GET  /workflows/:id/runs      -> run history
 *   GET  /plugins                 -> list plugin executors
 *   POST /plugins/:name/run       -> call a plugin directly
 *   GET  /events                  -> SSE real-time event stream
 */
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { SVGEngine }      from "../core/engine.js";
import { loadBANSkills }  from "../core/ban-adapter.js";
import { WorkflowEngine } from "../core/workflow-engine.js";
import { PLUGINS, runPlugin } from "../plugins/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT      = parseInt(process.env.SVG_ENGINE_PORT || "7070", 10);
const API_BASE  = process.env.BRIDGE_API_BASE || "http://localhost:8000";

const app      = express();
const engine   = new SVGEngine({ skillPath: path.resolve(__dirname, "../skills"), apiBase: API_BASE });
const wfEngine = new WorkflowEngine(engine);

app.use(cors({ origin: "*" }));
app.use(express.json());
app.use(express.static(path.resolve(__dirname, "../public")));

// ─── BOOT ────────────────────────────────────────────────────────────────────

await engine.load();

// Wire plugin executor into the engine so BAN skills can delegate
engine.setPluginRunner(runPlugin);

// Register all BAN skills into the SVGEngine
const banSkills = loadBANSkills();
banSkills.forEach(s => engine.register(s));
console.log(`[Server] Registered ${banSkills.length} BAN skills (total: ${engine.list().length})`);

// Load workflow definitions
await wfEngine.loadAll();

// SSE clients set
const sseClients = new Set();
["workflow.start","step.start","step.done","step.error","workflow.done"].forEach(event => {
  wfEngine.on(event, data => {
    const msg = `data: ${JSON.stringify({ event, data })}\n\n`;
    sseClients.forEach(res => { try { res.write(msg); } catch {} });
  });
});

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────

app.use((req, res, next) => {
  res.setHeader("X-SVG-Engine", "bridge/3.0");
  next();
});

// ─── CORE ROUTES ─────────────────────────────────────────────────────────────

app.get("/", (req, res) => {
  const banCount = engine.list().filter(s => s.id?.startsWith("ban:")).length;
  res.json({
    service:   "Bridge SVG Skill Engine",
    version:   "3.0.0",
    port:      PORT,
    skills: {
      total:   engine.list().length,
      native:  engine.list().length - banCount,
      ban:     banCount,
    },
    workflows: wfEngine.list().length,
    endpoints: {
      health:      "/health",
      skills:      "/skills",
      execute:     "/run/:id",
      visualize:   "/teach/:id",
      tutorial:    "/tutorial/:id",
      graph:       "/graph",
      telemetry:   "/telemetry",
      register:    "POST /register",
      ban_skills:  "/ban/skills",
      workflows:   "/workflows",
      run_wf:      "POST /workflows/:id/run",
      wf_runs:     "/workflows/:id/runs",
      active_runs: "/workflows/active",
      plugins:     "/plugins",
      plugin_run:  "POST /plugins/:name/run",
      events:      "/events (SSE)",
    },
    api_base: API_BASE,
  });
});

app.get("/health", (req, res) => {
  res.json({
    ok:       true,
    status:   "ok",
    service:  "bridge-svg-engine",
    version:  "3.0.0",
    port:     PORT,
    skills:   engine.list().length,
    workflows: wfEngine.list().length,
  });
});

app.get("/skills", (req, res) => {
  const tag = req.query.tag;
  let list = engine.list();
  if (tag) list = list.filter(s => s.tags.includes(tag));
  res.json({ ok: true, skills: list, count: list.length });
});

app.get("/skills/:id", (req, res) => {
  try {
    const skill = engine.list().find(s => s.id === req.params.id);
    if (!skill) return res.status(404).json({ ok: false, error: `Skill "${req.params.id}" not found` });
    res.json({ ok: true, skill });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/run/:id(*)", async (req, res) => {
  try {
    const result = await engine.execute(req.params.id, req.query);
    res.json(result);
  } catch (e) {
    res.status(e.message.includes("not found") ? 404 : 500).json({ ok: false, error: e.message });
  }
});

// Execute ALL skills and return summary (populates graph heat map)
app.get("/run-all", async (req, res) => {
  const results = [];
  for (const skill of engine.list()) {
    try {
      const r = await engine.execute(skill.id, req.query);
      results.push({ id: skill.id, ok: r.ok, latency_ms: r.latency_ms });
    } catch (e) {
      results.push({ id: skill.id, ok: false, error: e.message });
    }
  }
  res.json({ ok: true, executed: results.length, results, telemetry: engine.telemetry() });
});

// Teach ALL skills — generate SVGs for every skill (populates SVG build counter)
app.get("/teach-all", (req, res) => {
  const results = [];
  for (const skill of engine.list()) {
    try {
      engine.teach(skill.id, req.query);
      results.push({ id: skill.id, ok: true });
    } catch (e) {
      results.push({ id: skill.id, ok: false, error: e.message });
    }
  }
  res.json({ ok: true, svg_builds: results.length, results, telemetry: engine.telemetry() });
});

app.get("/teach/:id(*)", (req, res) => {
  try {
    const svg = engine.teach(req.params.id, req.query);
    res.setHeader("Content-Type", "image/svg+xml");
    res.setHeader("Cache-Control", "no-store");
    res.send(svg);
  } catch (e) {
    res.status(e.message.includes("not found") ? 404 : 500).json({ ok: false, error: e.message });
  }
});

app.get("/tutorial/:id(*)", (req, res) => {
  try {
    const tut = engine.tutorial(req.params.id, req.query);
    res.json({ ok: true, tutorial: tut });
  } catch (e) {
    res.status(e.message.includes("not found") ? 404 : 500).json({ ok: false, error: e.message });
  }
});

app.get("/graph", (req, res) => {
  const filter = req.query.filter || undefined;
  const limit  = parseInt(req.query.limit || "60", 10);
  res.setHeader("Content-Type", "image/svg+xml");
  res.send(engine.graph({ filter, limit }));
});

app.get("/telemetry", (req, res) => {
  res.json({ ok: true, telemetry: engine.telemetry() });
});

app.post("/register", (req, res) => {
  try {
    const skill = req.body;
    if (!skill?.id || typeof skill.run !== "function") {
      return res.status(400).json({ ok: false, error: "skill.id and skill.run() required" });
    }
    engine.register(skill);
    res.json({ ok: true, registered: skill.id });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── BAN SKILL ROUTES ─────────────────────────────────────────────────────────

app.get("/ban/skills", (req, res) => {
  const { plugin, q } = req.query;
  let list = engine.list().filter(s => s.id?.startsWith("ban:"));
  if (plugin) list = list.filter(s => s.tags.includes(plugin));
  if (q)      list = list.filter(s => s.id.includes(q) || s.description.toLowerCase().includes(q.toLowerCase()));
  res.json({ ok: true, skills: list, count: list.length });
});

// ─── WORKFLOW ROUTES ──────────────────────────────────────────────────────────

app.get("/workflows", (req, res) => {
  res.json({ ok: true, workflows: wfEngine.list(), count: wfEngine.list().length });
});

app.get("/workflows/active", (req, res) => {
  res.json({ ok: true, active: wfEngine.getActiveRuns() });
});

app.post("/workflows/:id/run", async (req, res) => {
  try {
    const run = await wfEngine.execute(req.params.id, req.body || {});
    res.json({ ok: true, run });
  } catch (e) {
    res.status(e.message.includes("not found") ? 404 : 500).json({ ok: false, error: e.message });
  }
});

app.get("/workflows/:id/runs", (req, res) => {
  const runs = wfEngine.getRuns(req.params.id, parseInt(req.query.limit || "20"));
  res.json({ ok: true, workflow: req.params.id, runs, count: runs.length });
});

// ─── PLUGIN ROUTES ────────────────────────────────────────────────────────────

app.get("/plugins", (req, res) => {
  res.json({ ok: true, plugins: Object.keys(PLUGINS) });
});

app.post("/plugins/:name/run", async (req, res) => {
  try {
    const result = await runPlugin(req.params.name, req.body || {}, { id: req.params.name });
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── SSE EVENTS ───────────────────────────────────────────────────────────────

app.get("/events", (req, res) => {
  res.setHeader("Content-Type",  "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection",    "keep-alive");
  res.flushHeaders();
  res.write(`data: ${JSON.stringify({ event: "connected", ts: new Date().toISOString() })}\n\n`);
  sseClients.add(res);
  req.on("close", () => sseClients.delete(res));
});

// ─── 404 ─────────────────────────────────────────────────────────────────────

app.use((req, res) => {
  res.status(404).json({ ok: false, error: `Route not found: ${req.method} ${req.path}` });
});

// ─── REGISTRY SELF-REGISTRATION ───────────────────────────────────────────────

async function registerWithBridgeApi() {
  try {
    const banCount = engine.list().filter(s => s.id?.startsWith("ban:")).length;
    await fetch(`${API_BASE}/api/projects/register`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id:           "svg-engine",
        label:        "SVG Skill Engine v3",
        type:         "service",
        baseUrl:      `http://localhost:${PORT}`,
        health:       "/health",
        port:         PORT,
        status:       "online",
        capabilities: ["skills", "ban-skills", "workflows", "svg-rendering", "tutorials", "graph", "sse-events"],
        meta: { ban_skills: banCount, workflows: wfEngine.list().length },
      }),
    });
    console.log("[SVG Engine] Registered with Bridge API project registry");
  } catch (e) {
    console.warn(`[SVG Engine] Registry registration skipped: ${e.message}`);
  }
}

// ─── START ────────────────────────────────────────────────────────────────────

app.listen(PORT, async () => {
  const banCount = engine.list().filter(s => s.id?.startsWith("ban:")).length;
  console.log(`[SVG Engine v3] Running on http://localhost:${PORT}`);
  console.log(`[SVG Engine v3] Skills: ${engine.list().length} total (${banCount} BAN + ${engine.list().length - banCount} native)`);
  console.log(`[SVG Engine v3] Workflows: ${wfEngine.list().length} loaded`);
  console.log(`[SVG Engine v3] Bridge API: ${API_BASE}`);
  await registerWithBridgeApi();
});
