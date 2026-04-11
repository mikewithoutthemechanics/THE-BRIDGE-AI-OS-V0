/**
 * bridge.treasury — Central treasury: all revenue streams funneled, tracked, and distributed.
 * Every economic action in the system routes here. Single source of financial truth.
 */
import { node, edge, arrow, curve, glowDef, progressBar, pulse, panel, ticker, badge, label, THEME } from "../renderer/primitives.js";

export default {
  id:          "bridge.treasury",
  name:        "Central Treasury",
  description: "Unified treasury: all revenue streams converge, tracked per-source, distributed to UBI + operations.",
  tags:        ["treasury", "economy", "revenue", "ubi", "bridge", "defi"],
  version:     "1.0.0",

  run(input = {}) {
    const sources = [
      { id: "marketplace",  label: "Marketplace",  amount: parseFloat((Math.random()*200).toFixed(2)), color: THEME.cyan   },
      { id: "bossbots",     label: "BossBots",     amount: parseFloat((Math.random()*80).toFixed(2)),  color: THEME.orange },
      { id: "sensor",       label: "Sensors",      amount: parseFloat((Math.random()*30).toFixed(2)),  color: THEME.blue   },
      { id: "execution",    label: "Execution",    amount: parseFloat((Math.random()*150).toFixed(2)), color: THEME.purple },
      { id: "defi",         label: "DeFi",         amount: parseFloat((Math.random()*120).toFixed(2)), color: THEME.pink   },
    ];
    const total = sources.reduce((s, x) => s + x.amount, 0);
    const ubiPool     = parseFloat((total * 0.30).toFixed(2));
    const operations  = parseFloat((total * 0.40).toFixed(2));
    const reserve     = parseFloat((total * 0.20).toFixed(2));
    const evolution   = parseFloat((total * 0.10).toFixed(2));
    return { sources, total: parseFloat(total.toFixed(2)), ubiPool, operations, reserve, evolution };
  },

  visualize(input = {}) {
    const d = this.run(input);
    const W = 900, H = 300;

    const defs = glowDef("g-treas", THEME.cyan);

    // Revenue sources on left (column)
    const sourceEls = d.sources.map((s, i) => {
      const x = 20, y = 40 + i * 50;
      const barW = 120;
      const pct = Math.min(1, s.amount / 250);
      return [
        node(x, y, 140, 36, s.label, `${s.amount} BRDG`, s.color, 6),
        progressBar(x + 144, y + 10, barW, 8, pct, s.color),
        `<text x="${x + 148 + barW}" y="${y + 22}" fill="${THEME.muted}" font-family="${THEME.font}" font-size="9">${s.amount}</text>`,
      ].join("\n");
    }).join("\n");

    // Central treasury vault
    const vx = 360, vy = 60;
    const vault = `<g>
      <rect x="${vx}" y="${vy}" width="180" height="180" rx="16" fill="${THEME.bg2}" stroke="${THEME.cyan}" stroke-width="2"/>
      <rect x="${vx}" y="${vy}" width="180" height="40" rx="16" fill="${THEME.bg3}"/>
      <rect x="${vx}" y="${vy + 20}" width="180" height="20" fill="${THEME.bg3}"/>
      <text x="${vx + 90}" y="${vy + 24}" text-anchor="middle" fill="${THEME.cyan}" font-family="${THEME.font}" font-size="12" font-weight="700">TREASURY</text>
      ${pulse(vx + 90, vy + 90, 50, THEME.cyan, "4s")}
      <text x="${vx + 90}" y="${vy + 85}" text-anchor="middle" fill="${THEME.cyan}" font-family="${THEME.font}" font-size="22" font-weight="700">${d.total}</text>
      <text x="${vx + 90}" y="${vy + 105}" text-anchor="middle" fill="${THEME.muted}" font-family="${THEME.font}" font-size="10">BRDG total</text>
      ${badge(vx + 44, vy + 155, "UNIFIED", THEME.cyan)}
    </g>`;

    // Revenue flow lines (sources → vault)
    const flowLines = d.sources.map((s, i) => {
      const sy = 40 + i * 50 + 18;
      const ex = vx;
      const ey = vy + 90;
      return curve(160, sy, ex, ey, s.color);
    }).join("\n");

    // Distribution on right
    const distItems = [
      { label: "UBI POOL",    amount: d.ubiPool,    color: THEME.purple, pct: 0.30 },
      { label: "OPERATIONS",  amount: d.operations, color: THEME.blue,   pct: 0.40 },
      { label: "RESERVE",     amount: d.reserve,    color: THEME.cyan,   pct: 0.20 },
      { label: "EVOLUTION",   amount: d.evolution,  color: THEME.orange, pct: 0.10 },
    ];
    const distEls = distItems.map((item, i) => {
      const x = 580, y = 55 + i * 55;
      return [
        `${edge(vx + 180, vy + 90, x, y + 18, item.color)}`,
        `${arrow(x, y + 18, item.color)}`,
        node(x, y, 150, 36, item.label, `${item.amount} BRDG (${Math.round(item.pct*100)}%)`, item.color, 6),
      ].join("\n");
    }).join("\n");

    return panel(W, H,
      [defs, sourceEls, flowLines, vault, distEls].join("\n"),
      `CENTRAL TREASURY — total: ${d.total} BRDG | UBI: ${d.ubiPool} | ops: ${d.operations} | reserve: ${d.reserve}`
    );
  },

  steps: [
    { title: "Revenue ingestion",  detail: "All sources (marketplace, bossbots, sensors, DeFi) funnel here." },
    { title: "Unified accounting", detail: "Single balance sheet; per-source attribution tracked."           },
    { title: "UBI allocation",     detail: "30% flows to UBI pool for distribution to claimants."            },
    { title: "Operations fund",    detail: "40% covers infrastructure, API costs, agent execution."          },
    { title: "Reserve + Evolution",detail: "20% reserve for stability; 10% for evolution budget."            },
  ],
};
