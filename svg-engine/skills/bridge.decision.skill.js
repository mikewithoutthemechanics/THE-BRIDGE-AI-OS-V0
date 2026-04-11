/**
 * bridge.decision — Twin decision engine: environment → goal → constraint → ethical filter → action/silence.
 */
import { node, edge, arrow, glowDef, progressBar, signalDot, pulse, panel, badge, label, THEME } from "../renderer/primitives.js";

export default {
  id:          "bridge.decision",
  name:        "Twin Decision Engine",
  description: "Deterministic decision pipeline: environment scan → ethical filter → action or silence.",
  tags:        ["decision", "ethics", "cognitive", "bridge", "silence"],
  version:     "1.0.0",

  run(input = {}) {
    const confidence  = parseFloat((0.3 + Math.random() * 0.7).toFixed(2));
    const ethical     = parseFloat((Math.random() * 0.6).toFixed(2));
    const silence     = ethical > 0.7 || confidence < 0.3;
    const latency_ms  = Math.floor(Math.random() * 90) + 5;
    return {
      confidence, ethical_score: ethical, silence, latency_ms,
      reason: silence ? (ethical > 0.7 ? "ethical_conflict" : "confidence_below_floor") : "action",
      action: silence ? null : "execute_task",
      seed:   Math.floor(Math.random() * 999999),
    };
  },

  visualize(input = {}) {
    const d = this.run(input);
    const W = 900, H = 200;

    const defs = glowDef("g-dec", THEME.cyan);

    const stages = [
      { label: "ENV SCAN",   meta: "perception",            x: 40,  color: THEME.blue   },
      { label: "GOAL VEC",   meta: "goal alignment",        x: 190, color: THEME.cyan   },
      { label: "CANDIDATES", meta: "options generated",     x: 340, color: THEME.cyan   },
      { label: "ETHICS",     meta: `score=${d.ethical_score}`, x: 490, color: d.ethical_score > 0.7 ? THEME.pink : THEME.green },
      { label: "CONFIDENCE", meta: `${d.confidence}`,       x: 640, color: d.confidence < 0.3 ? THEME.orange : THEME.cyan   },
      { label: d.silence ? "SILENCE" : "ACTION", meta: d.silence ? d.reason : d.action || "execute", x: 790, color: d.silence ? THEME.pink : THEME.green },
    ];

    const nodeH = 60, nodeW = 110, nodeY = 60;

    const nodes = stages.map(s =>
      node(s.x, nodeY, nodeW, nodeH, s.label, s.meta, s.color)
    ).join("\n");

    const edges = stages.slice(0, -1).map((s, i) => {
      const nextX = stages[i + 1].x;
      const midY  = nodeY + nodeH / 2;
      // Dashed before ethical check, solid after
      const dashed = i < 2;
      return [
        edge(s.x + nodeW, midY, nextX, midY, stages[i + 1].color, dashed),
        arrow(nextX, midY, stages[i + 1].color),
      ].join("\n");
    }).join("\n");

    // Signal path
    const pathStr = `M${stages[0].x + nodeW / 2} ${nodeY + nodeH / 2} L${stages[stages.length - 1].x + nodeW / 2} ${nodeY + nodeH / 2}`;
    const signal  = signalDot(pathStr, "4s", d.silence ? THEME.pink : THEME.cyan);

    // Metadata strip
    const metaY = 155;
    const metaItems = [
      `seed: ${d.seed}`,
      `latency: ${d.latency_ms}ms`,
      `confidence: ${d.confidence}`,
      `ethical: ${d.ethical_score}`,
      `outcome: ${d.silence ? "SILENCE" : "ACTION"}`,
    ].map((m, i) => badge(30 + i * 172, metaY, m, i === 4 ? (d.silence ? THEME.pink : THEME.green) : THEME.muted)).join("\n");

    // Silence pulse
    const silencePulse = d.silence
      ? pulse(stages[5].x + 55, nodeY + nodeH / 2, 30, THEME.pink, "1.5s")
      : pulse(stages[5].x + 55, nodeY + nodeH / 2, 30, THEME.green, "2.5s");

    return panel(W, H,
      [defs, nodes, edges, signal, metaItems, silencePulse].join("\n"),
      `DECISION ENGINE — deterministic | seed=${d.seed} | outcome=${d.silence ? "SILENCE" : "ACTION"}`
    );
  },

  steps: [
    { title: "Environment scan",      detail: "Perception layer reads current context."                  },
    { title: "Goal vector alignment", detail: "Action candidates scored against mission vector."         },
    { title: "Ethical conflict gate", detail: "score > 0.7 → silence. Authority override → silence."   },
    { title: "Confidence floor",      detail: "confidence < 0.3 → force silence. Not null — strategic." },
    { title: "Action or Silence",     detail: "Silence is a first-class outcome, not an error."          },
  ],
};
