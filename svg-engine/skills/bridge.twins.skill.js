/**
 * bridge.twins — Digital twin swarm: leaderboard, skill propagation, teach/learn cycles.
 */
import { hexNode, edge, curve, arrow, glowDef, pulse, panel, badge, progressBar, label, THEME } from "../renderer/primitives.js";

export default {
  id:          "bridge.twins",
  name:        "Digital Twin Swarm",
  description: "Swarm of competing digital twins: skill acquisition, leaderboard, teach→learn propagation.",
  tags:        ["twins", "swarm", "skills", "bridge", "competition"],
  version:     "1.1.0",

  run(input = {}) {
    const names = ["ALPHA", "BETA", "GAMMA", "DELTA", "EPSILON"];
    const twins = names.map((name, i) => ({
      id:         name,
      score:      parseFloat((Math.random() * 100).toFixed(1)),
      tasks_done: Math.floor(Math.random() * 30),
      skills:     Math.floor(Math.random() * 8) + 1,
      trust:      parseFloat((Math.random()).toFixed(2)),
      teaching:   Math.random() > 0.7,
    }));
    twins.sort((a, b) => b.score - a.score);
    return { twins, total_skills: twins.reduce((s, t) => s + t.skills, 0) };
  },

  visualize(input = {}) {
    const { twins } = this.run(input);
    const W = 900, H = 340;

    const defs = glowDef("g-twins", THEME.blue);

    // Layout: pentagon around center
    const cx = 450, cy = 170, R = 130;
    const positions = twins.map((_, i) => {
      const a = (2 * Math.PI * i) / twins.length - Math.PI / 2;
      return { x: Math.round(cx + R * Math.cos(a)), y: Math.round(cy + R * Math.sin(a)) };
    });

    // Edges: teach connections (top twin teaches others)
    const teacher = twins[0];
    const teacherPos = positions[0];
    const teachEdges = positions.slice(1).map((p, i) => {
      if (twins[i + 1].teaching) return "";
      return `${curve(teacherPos.x, teacherPos.y, p.x, p.y, THEME.blue)}`;
    }).join("\n");

    // Hex nodes for each twin
    const twinNodes = twins.map((t, i) => {
      const p    = positions[i];
      const col  = i === 0 ? THEME.cyan : i === 1 ? THEME.blue : THEME.purple;
      const r    = 32 + Math.round(t.score / 10);
      const rank = `#${i + 1} ${t.score}`;
      return [
        hexNode(p.x, p.y, r, t.id, rank, col),
        i === 0 ? pulse(p.x, p.y, r + 4, col, "2s") : "",
        badge(p.x - 20, p.y + r + 14, `${t.skills} skills`, col),
      ].join("\n");
    }).join("\n");

    // Center hub
    const hub = `<g>
      <circle cx="${cx}" cy="${cy}" r="24" fill="${THEME.bg2}" stroke="${THEME.cyan}" stroke-width="1.5"/>
      <text x="${cx}" y="${cy - 4}" text-anchor="middle" fill="${THEME.cyan}" font-family="${THEME.font}" font-size="9" font-weight="700">BRIDGE</text>
      <text x="${cx}" y="${cy + 9}" text-anchor="middle" fill="${THEME.muted}" font-family="${THEME.font}" font-size="8">SWARM</text>
      ${pulse(cx, cy, 24, THEME.cyan, "4s")}
    </g>`;

    // Leaderboard strip at bottom
    const lbY = 295;
    const lbItems = twins.slice(0, 5).map((t, i) => {
      const x = 40 + i * 170;
      const col = i === 0 ? THEME.cyan : THEME.muted;
      return `<g>
        <text x="${x}" y="${lbY}" fill="${col}" font-family="${THEME.font}" font-size="10">#${i+1} ${t.id}</text>
        ${progressBar(x, lbY + 4, 140, 4, t.trust, col)}
        <text x="${x + 145}" y="${lbY}" fill="${THEME.muted}" font-family="${THEME.font}" font-size="9">${t.score}</text>
      </g>`;
    }).join("\n");

    return panel(W, H,
      [defs, teachEdges, twinNodes, hub, lbItems].join("\n"),
      `TWIN SWARM — ${twins.length} active | teacher: ${teacher.id} | total skills: ${twins.reduce((s, t) => s + t.skills, 0)}`
    );
  },

  steps: [
    { title: "Twin instantiation",     detail: "Each twin is an independent cognitive agent."           },
    { title: "Skill competition",      detail: "Twins compete on marketplace tasks; score accumulates." },
    { title: "Teacher election",       detail: "Highest-trust twin becomes teacher for the cycle."      },
    { title: "Skill propagation",      detail: "Teacher broadcasts verified skills to student twins."   },
    { title: "Leaderboard update",     detail: "Trust scores normalised and ranked after each cycle."   },
  ],
};
