/**
 * Workflow Engine
 *
 * Loads workflow JSON definitions and executes them step-by-step.
 * Each step can be:
 *   { type: "skill",   name: "ban:foo",     input: {} }
 *   { type: "plugin",  name: "scraper",     input: {} }
 *   { type: "branch",  condition: "...",    then: [...], else: [...] }
 *   { type: "parallel", steps: [...] }
 *
 * Emits real-time events: workflow.start, step.start, step.done, step.error, workflow.done
 *
 * Usage:
 *   const wf = new WorkflowEngine(svgEngine);
 *   await wf.loadAll();
 *   const run = await wf.execute("lead_generation", { query: "SaaS startups NYC" });
 */

import fs            from "fs";
import path          from "path";
import { EventEmitter } from "events";
import { fileURLToPath } from "url";
import { runPlugin } from "../plugins/index.js";

const __dirname   = path.dirname(fileURLToPath(import.meta.url));
const WORKFLOW_DIR = path.resolve(__dirname, "../workflows");
const DATA_DIR     = path.resolve(__dirname, "../data");

// ─── RUN STORE ───────────────────────────────────────────────────────────────

const RUN_LOG_PATH = path.join(DATA_DIR, "runs.jsonl");

function appendRunLog(entry) {
  fs.appendFileSync(RUN_LOG_PATH, JSON.stringify(entry) + "\n");
}

function loadRuns(workflowId, limit = 20) {
  if (!fs.existsSync(RUN_LOG_PATH)) return [];
  return fs.readFileSync(RUN_LOG_PATH, "utf8")
    .split("\n").filter(Boolean)
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(r => r && (!workflowId || r.workflow === workflowId))
    .slice(-limit);
}

// ─── WORKFLOW ENGINE ──────────────────────────────────────────────────────────

export class WorkflowEngine extends EventEmitter {
  constructor(svgEngine) {
    super();
    this.svgEngine  = svgEngine;
    this.workflows  = new Map();   // id → definition
    this.activeRuns = new Map();   // runId → { workflow, status, results }
  }

  // ─── LOAD ─────────────────────────────────────────────────────────────────

  async loadAll() {
    if (!fs.existsSync(WORKFLOW_DIR)) {
      fs.mkdirSync(WORKFLOW_DIR, { recursive: true });
    }
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    const files = fs.readdirSync(WORKFLOW_DIR).filter(f => f.endsWith(".json"));
    for (const file of files) {
      try {
        const wf = JSON.parse(fs.readFileSync(path.join(WORKFLOW_DIR, file), "utf8"));
        if (wf.id) {
          this.workflows.set(wf.id, wf);
          console.log(`[WorkflowEngine] Loaded workflow: ${wf.id} (${wf.steps?.length || 0} steps)`);
        }
      } catch (e) {
        console.warn(`[WorkflowEngine] Failed to load ${file}: ${e.message}`);
      }
    }

    console.log(`[WorkflowEngine] ${this.workflows.size} workflows loaded`);
    return this;
  }

  register(workflow) {
    if (!workflow?.id) throw new Error("workflow.id required");
    this.workflows.set(workflow.id, workflow);
    return this;
  }

  list() {
    return [...this.workflows.values()].map(w => ({
      id:          w.id,
      name:        w.name || w.id,
      description: w.description || "",
      steps:       (w.steps || []).length,
      tags:        w.tags || [],
    }));
  }

  // ─── EXECUTE ──────────────────────────────────────────────────────────────

  async execute(workflowId, input = {}) {
    const wf = this.workflows.get(workflowId);
    if (!wf) throw new Error(`Workflow not found: "${workflowId}"`);

    const runId = `${workflowId}-${Date.now()}`;
    const run   = {
      runId,
      workflow:   workflowId,
      input,
      status:     "running",
      started_at: new Date().toISOString(),
      steps:      [],
    };

    this.activeRuns.set(runId, run);
    this.emit("workflow.start", { runId, workflow: workflowId, input });

    let context = { ...input };  // accumulate step outputs

    try {
      for (let i = 0; i < (wf.steps || []).length; i++) {
        const step = wf.steps[i];
        const stepResult = await this._executeStep(step, context, runId, i);
        run.steps.push(stepResult);

        if (!stepResult.ok && step.required !== false) {
          run.status = "failed";
          run.error  = `Step ${i} (${step.name || step.type}) failed: ${stepResult.error}`;
          break;
        }

        // Merge step output into context for next steps
        if (stepResult.output) {
          context = { ...context, ...stepResult.output, _prev: stepResult.output };
        }
      }

      if (run.status === "running") run.status = "completed";
    } catch (e) {
      run.status = "failed";
      run.error  = e.message;
    }

    run.completed_at = new Date().toISOString();
    run.duration_ms  = Date.now() - new Date(run.started_at).getTime();

    appendRunLog(run);
    this.activeRuns.delete(runId);
    this.emit("workflow.done", run);

    return run;
  }

  async _executeStep(step, context, runId, index) {
    const stepId = `${runId}-step-${index}`;
    const started_at = new Date().toISOString();

    this.emit("step.start", { stepId, step, context });

    try {
      let output;

      if (step.type === "skill") {
        output = await this._runSkillStep(step, context);
      } else if (step.type === "plugin") {
        output = await runPlugin(step.name, { ...context, ...step.input }, { id: step.name });
      } else if (step.type === "parallel") {
        output = await this._runParallel(step.steps, context);
      } else if (step.type === "branch") {
        output = await this._runBranch(step, context);
      } else if (step.type === "transform") {
        output = await runPlugin("data_transformer", { data: context._prev || context, operation: step.operation || "normalize", ...step.input }, {});
      } else if (step.type === "notify") {
        output = await runPlugin("slack_notifier", { message: this._interpolate(step.message || "Step complete", context), ...step.input }, {});
      } else if (step.type === "llm") {
        output = await runPlugin("llm_generator", { prompt: this._interpolate(step.prompt || "", context), ...step.input }, {});
      } else {
        output = { ok: true, type: step.type, note: "Unknown step type — skipped" };
      }

      const result = {
        stepId, index, type: step.type, name: step.name || step.type,
        ok: output?.ok !== false, started_at,
        completed_at: new Date().toISOString(),
        output,
      };

      this.emit("step.done", result);
      return result;

    } catch (e) {
      const result = {
        stepId, index, type: step.type, name: step.name || step.type,
        ok: false, error: e.message, started_at,
        completed_at: new Date().toISOString(),
      };
      this.emit("step.error", result);
      return result;
    }
  }

  async _runSkillStep(step, context) {
    const skillId = step.name;

    // Check if skill exists in SVGEngine
    const skill = this.svgEngine?.skills?.get(skillId);

    if (skill?.plugin) {
      // BAN skill → route to plugin
      const mergedInput = { ...context, ...step.input };
      return await runPlugin(skill.plugin, mergedInput, skill);
    }

    if (skill?.run) {
      // Native SVGEngine skill
      const mergedInput = { ...context, ...step.input };
      const result = skill.run(mergedInput);
      return { ok: true, ...result };
    }

    return { ok: false, error: `Skill "${skillId}" not found in engine` };
  }

  async _runParallel(steps, context) {
    const results = await Promise.allSettled(
      steps.map(s => this._executeStep(s, context, "parallel", 0))
    );
    return {
      ok:      true,
      parallel: true,
      results: results.map((r, i) => ({ step: steps[i]?.name, ...(r.status === "fulfilled" ? r.value : { ok: false, error: r.reason?.message }) })),
    };
  }

  async _runBranch(step, context) {
    const val = context[step.condition?.field];
    const met = step.condition?.op === "exists" ? !!val
      : step.condition?.op === "gt"     ? val >  step.condition.value
      : step.condition?.op === "lt"     ? val <  step.condition.value
      : step.condition?.op === "eq"     ? val === step.condition.value
      : !!val;

    const branch = met ? step.then : step.else;
    if (!branch) return { ok: true, branch: met ? "then" : "else", skipped: true };

    const results = [];
    let ctx = { ...context };
    for (let i = 0; i < branch.length; i++) {
      const r = await this._executeStep(branch[i], ctx, "branch", i);
      results.push(r);
      if (r.output) ctx = { ...ctx, ...r.output };
    }
    return { ok: true, branch: met ? "then" : "else", results };
  }

  _interpolate(template, context) {
    return template.replace(/\{\{(\w+)\}\}/g, (_, k) => context[k] ?? `{{${k}}}`);
  }

  // ─── QUERY ────────────────────────────────────────────────────────────────

  getRuns(workflowId, limit = 20) {
    return loadRuns(workflowId, limit);
  }

  getActiveRuns() {
    return [...this.activeRuns.values()].map(r => ({
      runId:    r.runId,
      workflow: r.workflow,
      status:   r.status,
      steps:    r.steps.length,
      started:  r.started_at,
    }));
  }
}
