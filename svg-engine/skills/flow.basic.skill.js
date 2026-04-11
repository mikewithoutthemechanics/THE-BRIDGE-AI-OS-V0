/**
 * flow.basic — foundational execution flow with animated signal propagation.
 * The canonical "hello world" of the SVG engine.
 */
import { node, edge, arrow, glowDef, signalDot, panel } from "../renderer/primitives.js";

export default {
  id:          "flow.basic",
  name:        "Basic Execution Flow",
  description: "Signal travels through sequential processing stages with live latency annotation.",
  tags:        ["flow", "core", "execution"],
  version:     "2.0.0",

  run(input = {}) {
    const latency = Math.floor(Math.random() * 50) + 10;
    return {
      steps: [
        { label: "INPUT",     meta: `t=${Date.now() % 1000}ms`, state: "active"   },
        { label: "VALIDATE",  meta: `ok=true`,                   state: "pass"    },
        { label: "PROCESS",   meta: `lat=${latency}ms`,          state: "active"  },
        { label: "TRANSFORM", meta: `state=ok`,                  state: "pass"    },
        { label: "OUTPUT",    meta: `emit=1`,                    state: "done"    },
      ],
    };
  },

  visualize(input = {}) {
    const { steps } = this.run(input);
    const W = 820, H = 160, pad = 30;
    const nodeW = 120, nodeH = 56, spacing = (W - pad * 2 - nodeW) / (steps.length - 1);

    let els = [glowDef("g-flow", "#63ffda")];

    steps.forEach((s, i) => {
      const x = pad + i * spacing;
      const cy = H / 2;
      const col = s.state === "done" ? "#a78bfa" : s.state === "pass" ? "#38bdf8" : "#63ffda";

      els.push(node(x, cy - nodeH / 2, nodeW, nodeH, s.label, s.meta, col));

      if (i < steps.length - 1) {
        const ex = x + nodeW, nx = x + spacing;
        els.push(edge(ex, cy, nx, cy, col));
        els.push(arrow(nx, cy, col));
      }
    });

    // Animated signal dot along the flow path
    const totalW = pad + (steps.length - 1) * spacing + nodeW;
    els.push(signalDot(`M${pad + nodeW / 2} ${H / 2} L${pad + (steps.length - 1) * spacing + nodeW / 2} ${H / 2}`, "3s", "#63ffda"));

    return panel(W, H, els.join("\n"), "EXECUTION FLOW — signal propagation");
  },

  steps: [
    { title: "Signal enters INPUT node",      detail: "External trigger with timestamp annotation." },
    { title: "VALIDATE checks schema",        detail: "Structural and semantic validation gate."    },
    { title: "PROCESS applies logic",         detail: "Core transformation with latency tracking."  },
    { title: "TRANSFORM normalises output",   detail: "Shape normalisation before emission."        },
    { title: "OUTPUT emits to consumers",     detail: "Downstream subscribers receive the signal."  },
  ],
};
