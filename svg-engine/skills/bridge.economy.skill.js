/**
 * bridge.economy — Economic engine: circuit breaker, exposure, entropy, treasury flow.
 * Visualizes the full economic loop: task → execution → revenue → treasury.
 */
import { node, edge, arrow, glowDef, progressBar, gauge, signalDot, pulse, panel, badge, ticker, label, THEME } from "../renderer/primitives.js";

export default {
  id:          "bridge.economy",
  name:        "Bridge Economic Engine",
  description: "Live economic loop: marketplace → execution → revenue → treasury → UBI.",
  tags:        ["economy", "treasury", "marketplace", "ubi", "bridge"],
  version:     "1.2.0",

  run(input = {}) {
    return {
      circuit_breaker: false,
      global_exposure:  Math.floor(Math.random() * 800),
      exposure_ceiling: 10000,
      trade_count:      Math.floor(Math.random() * 45),
      trade_freq_limit: 50,
      entropy:          parseFloat((Math.random() * 0.4).toFixed(3)),
      treasury_balance: parseFloat((1000 + Math.random() * 4000).toFixed(2)),
      ubi_distributed:  parseFloat((Math.random() * 200).toFixed(2)),
      revenue_today:    parseFloat((Math.random() * 500).toFixed(2)),
    };
  },

  visualize(input = {}) {
    const d = this.run(input);
    const W = 900, H = 300;

    const exposurePct  = d.global_exposure / d.exposure_ceiling;
    const tradePct     = d.trade_count / d.trade_freq_limit;
    const entropyPct   = d.entropy;
    const cbColor      = d.circuit_breaker ? THEME.pink : THEME.green;

    const defs = glowDef("g-econ", THEME.cyan);

    // Left: circuit breaker + gauges
    const cbX = 60, cbY = 150;
    const cbStatus = `<g>
      <circle cx="${cbX}" cy="${cbY}" r="28" fill="${THEME.bg2}" stroke="${cbColor}" stroke-width="2"/>
      ${pulse(cbX, cbY, 28, cbColor, "2.5s")}
      <text x="${cbX}" y="${cbY - 6}" text-anchor="middle" fill="${cbColor}" font-family="${THEME.font}" font-size="8" font-weight="700">CIRCUIT</text>
      <text x="${cbX}" y="${cbY + 8}" text-anchor="middle" fill="${cbColor}" font-family="${THEME.font}" font-size="8">${d.circuit_breaker ? "TRIPPED" : "OK"}</text>
    </g>`;

    // Gauges
    const g1 = gauge(200, 150, 44, exposurePct,  "EXPOSURE",  THEME.blue);
    const g2 = gauge(310, 150, 44, tradePct,     "TRADES",    THEME.orange);
    const g3 = gauge(420, 150, 44, entropyPct,   "ENTROPY",   THEME.purple);

    // Treasury box
    const tx = 530, ty = 80;
    const treasury = `<g>
      <rect x="${tx}" y="${ty}" width="160" height="140" rx="10" fill="${THEME.bg2}" stroke="${THEME.cyan}" stroke-width="1.5"/>
      <text x="${tx + 80}" y="${ty + 20}" text-anchor="middle" fill="${THEME.cyan}" font-family="${THEME.font}" font-size="10" font-weight="700">TREASURY</text>
      ${ticker(tx + 16, ty + 50, "₿ " + d.treasury_balance.toFixed(0), "BRDG", THEME.cyan)}
      <text x="${tx + 16}" y="${ty + 75}" fill="${THEME.muted}" font-family="${THEME.font}" font-size="9">Revenue today</text>
      ${progressBar(tx + 16, ty + 82, 128, 6, Math.min(1, d.revenue_today / 1000), THEME.green)}
      <text x="${tx + 16}" y="${ty + 105}" fill="${THEME.muted}" font-family="${THEME.font}" font-size="9">UBI distributed</text>
      ${progressBar(tx + 16, ty + 112, 128, 6, Math.min(1, d.ubi_distributed / 500), THEME.purple)}
    </g>`;

    // UBI terminal
    const ux = 730, uy = 80;
    const ubi = `<g>
      <rect x="${ux}" y="${uy}" width="100" height="140" rx="10" fill="${THEME.bg2}" stroke="${THEME.purple}" stroke-width="1.5"/>
      <text x="${ux + 50}" y="${uy + 20}" text-anchor="middle" fill="${THEME.purple}" font-family="${THEME.font}" font-size="10" font-weight="700">UBI</text>
      <text x="${ux + 50}" y="${uy + 50}" text-anchor="middle" fill="${THEME.purple}" font-family="${THEME.font}" font-size="18" font-weight="700">${d.ubi_distributed}</text>
      <text x="${ux + 50}" y="${uy + 68}" text-anchor="middle" fill="${THEME.muted}" font-family="${THEME.font}" font-size="9">BRDG claimed</text>
      ${pulse(ux + 50, uy + 105, 16, THEME.purple, "3s")}
    </g>`;

    // Flow arrows: CB → gauges → treasury → UBI
    const arrows = `
      ${edge(cbX + 28, cbY, 155, 150, THEME.cyan)}
      ${arrow(155, 150, THEME.cyan)}
      ${edge(480, 150, tx, 150, THEME.cyan)}
      ${arrow(tx, 150, THEME.cyan)}
      ${edge(tx + 160, 150, ux, 150, THEME.purple)}
      ${arrow(ux, 150, THEME.purple)}
    `;

    return panel(W, H, [defs, cbStatus, g1, g2, g3, treasury, ubi, arrows].join("\n"),
      `ECONOMIC ENGINE — exposure: ${d.global_exposure}/${d.exposure_ceiling} | entropy: ${d.entropy} | trades: ${d.trade_count}/${d.trade_freq_limit}`);
  },

  steps: [
    { title: "Circuit Breaker Gate",   detail: "Trips when trade_count ≥ 50 or entropy ≥ 0.8."       },
    { title: "Exposure Governor",      detail: "Per-twin and global exposure ceilings enforced."       },
    { title: "Entropy Monitor",        detail: "Economic entropy score drives governance triggers."    },
    { title: "Treasury Collection",    detail: "All revenue streams funnel to unified treasury."       },
    { title: "UBI Distribution",       detail: "Surplus flows to UBI pool for claim distribution."    },
  ],
};
