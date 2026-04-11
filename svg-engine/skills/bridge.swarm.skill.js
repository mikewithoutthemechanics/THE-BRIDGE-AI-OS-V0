/**
 * bridge.swarm — Swarm Health Index: queue latency, utilization, profitability, failure rate.
 */
import { gauge, progressBar, glowDef, scanLine, pulse, panel, ticker, label, THEME } from "../renderer/primitives.js";

export default {
  id:          "bridge.swarm",
  name:        "Swarm Health Monitor",
  description: "Real-time swarm health index: queue latency, worker utilization, profitability, fault rate.",
  tags:        ["swarm", "health", "infrastructure", "bridge"],
  version:     "1.0.0",

  run(input = {}) {
    const latency     = parseFloat((Math.random() * 120).toFixed(1));
    const utilization = parseFloat((0.4 + Math.random() * 0.5).toFixed(2));
    const profit      = parseFloat((0.001 + Math.random() * 0.008).toFixed(4));
    const failRate    = parseFloat((Math.random() * 0.05).toFixed(4));
    // health = (1 - latency/500) * utilization * (1 - failRate) * (profit / 0.01)
    const health = Math.min(1, ((1 - latency / 500) * utilization * (1 - failRate) * (profit / 0.005)));
    return { latency, utilization, profit, failRate, health: parseFloat(health.toFixed(3)) };
  },

  visualize(input = {}) {
    const d = this.run(input);
    const W = 780, H = 220;

    const healthColor = d.health > 0.7 ? THEME.green : d.health > 0.4 ? THEME.orange : THEME.pink;
    const defs = glowDef("g-swarm", healthColor);

    // Main health gauge
    const mainGauge = gauge(120, 110, 70, d.health, "HEALTH", healthColor);
    const pulsing   = pulse(120, 110, 70, healthColor, "3s");

    // Sub-gauges
    const g1 = gauge(300, 110, 44, 1 - d.latency / 500, "LATENCY",     THEME.blue);
    const g2 = gauge(410, 110, 44, d.utilization,        "UTILIZATION", THEME.cyan);
    const g3 = gauge(520, 110, 44, 1 - d.failRate * 20,  "FAULT FREE",  THEME.green);
    const g4 = gauge(630, 110, 44, d.profit / 0.01,      "PROFIT",      THEME.purple);

    // Stats bar
    const statsY = 185;
    const stats = [
      `${d.latency}ms`, `${Math.round(d.utilization*100)}%`, `${(d.profit*100).toFixed(2)}%`, `${(d.failRate*100).toFixed(2)}%`
    ].map((v, i) => {
      const lbl = ["LATENCY", "UTILIZATION", "PROFIT", "FAULT"][i];
      const x = 290 + i * 120;
      return `<text x="${x}" y="${statsY}" fill="${THEME.muted}" font-family="${THEME.font}" font-size="8">${lbl}</text>
              <text x="${x}" y="${statsY + 14}" fill="${THEME.cyan}" font-family="${THEME.font}" font-size="12" font-weight="700">${v}</text>`;
    }).join("\n");

    // Score display
    const score = `<text x="120" y="185" text-anchor="middle" fill="${healthColor}" font-family="${THEME.font}" font-size="11">${Math.round(d.health * 100)} / 100</text>`;

    return panel(W, H,
      [defs, pulsing, mainGauge, g1, g2, g3, g4, stats, score].join("\n"),
      `SWARM HEALTH — composite score from ${['latency','utilization','profitability','fault_rate'].join(' · ')}`
    );
  },

  steps: [
    { title: "Metric Collection",  detail: "Sample queue latency, worker utilization, profit margins, and fault rates" },
    { title: "Health Composite",   detail: "Calculate weighted health index: (1-latency/500) * utilization * (1-failRate) * (profit/0.005)" },
    { title: "Gauge Rendering",    detail: "Render arc gauges for each metric plus composite health" },
    { title: "Threshold Alerting", detail: "Color-code health: green >70%, orange >40%, pink/critical below" },
    { title: "Status Broadcast",   detail: "Emit swarm health to all connected dashboards via SSE" },
  ],
};
