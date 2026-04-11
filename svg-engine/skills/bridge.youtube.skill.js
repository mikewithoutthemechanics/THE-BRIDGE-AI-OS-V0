/**
 * bridge.youtube.skill.js — YouTube Skill Discovery Pipeline
 * Visualizes: QUERY → SEARCH API → VIDEO META → MARKDOWN PARSE → SKILL ADOPT
 * Animated signal propagates through the discovery chain.
 */

import {
  panel, node, edge, arrow, signalDot, badge, label,
  pulse, ticker, progressBar, THEME,
} from "../renderer/primitives.js";

const W = 720, H = 320;

const STAGES = [
  { id: "query",   x: 30,  label: "QUERY",        color: THEME.cyan },
  { id: "search",  x: 160, label: "YT SEARCH API", color: THEME.purple },
  { id: "meta",    x: 310, label: "VIDEO META",    color: THEME.blue },
  { id: "parse",   x: 460, label: "MD PARSE",      color: THEME.green },
  { id: "adopt",   x: 600, label: "SKILL ADOPT",   color: THEME.gold },
];

const NW = 110, NH = 44, NY = 120;

function stageNode(s, input) {
  const active = input?.active_stage === s.id;
  const done   = input?.done_stages?.includes(s.id);
  const c = done ? THEME.green : active ? s.color : THEME.dim;
  return node(s.x, NY, NW, NH, s.label, done ? "✓" : active ? "●" : "○", c, 6);
}

function stageEdges() {
  const out = [];
  for (let i = 0; i < STAGES.length - 1; i++) {
    const a = STAGES[i], b = STAGES[i + 1];
    const x1 = a.x + NW, y = NY + NH / 2;
    const x2 = b.x;
    out.push(edge(x1, y, x2, y, THEME.dim));
    out.push(arrow(x2 - 8, y, THEME.cyan, 6, "right"));
  }
  return out.join("");
}

function signalPath() {
  const x1 = STAGES[0].x + NW / 2;
  const x2 = STAGES[STAGES.length - 1].x + NW / 2;
  const y  = NY + NH / 2;
  return `M${x1},${y} L${x2},${y}`;
}

export const id          = "bridge.youtube";
export const name        = "YouTube Skill Discovery";
export const description = "Searches YouTube for skill videos, parses video descriptions as markdown, and learns skill definitions — steps, tags, and description — into the Bridge engine.";
export const tags        = ["youtube", "learning", "skills", "discovery", "bridge"];
export const version     = "1.0.0";

export const steps = [
  { title: "Query Build",     detail: "Compose search string from skill_id + name + tags" },
  { title: "YouTube Search",  detail: "POST to Data API v3 /search — costs 100 quota units" },
  { title: "Video Metadata",  detail: "Fetch /videos?part=snippet,statistics — costs 1 unit" },
  { title: "Markdown Parse",  detail: "Extract numbered steps, first paragraph, infer Bridge tags" },
  { title: "Skill Adoption",  detail: "Persist skill definition to memory; available to engine + SVG renderer" },
];

export function run(input = {}) {
  return {
    skill_id:    id,
    query:       input.query       || "(no query)",
    video_id:    input.video_id    || null,
    skill_found: input.skill_found ?? false,
    tags_inferred: input.tags      || [],
    steps_extracted: input.steps   || 0,
    quota_used:  input.quota_used  ?? 101,
    source:      "youtube",
  };
}

export function visualize(input = {}) {
  const query      = input.query       || "fastapi tutorial";
  const quotaUsed  = input.quota_used  ?? 101;
  const quotaMax   = 10000;
  const quotaPct   = Math.min(quotaUsed / quotaMax, 1);
  const stepsFound = input.steps       || 5;
  const tags       = (input.tags       || ["youtube", "learning", "engineering"]).slice(0, 4);
  const videoTitle = input.video_title || "FastAPI Full Course";

  const nodes   = STAGES.map(s => stageNode(s, input)).join("");
  const edges   = stageEdges();
  const signal  = signalDot(signalPath(), "2.4s", THEME.cyan, 5);
  const pulseEl = pulse(STAGES[4].x + NW / 2, NY + NH / 2, 28, THEME.gold, "1.8s");

  // Query box (bottom-left)
  const queryBox = `
    <rect x="30" y="200" width="200" height="50" rx="6" fill="#0d1b2a" stroke="${THEME.cyan}" stroke-width="1"/>
    <text x="40" y="218" fill="${THEME.dim}" font-family="JetBrains Mono,monospace" font-size="9">SEARCH QUERY</text>
    <text x="40" y="236" fill="${THEME.cyan}" font-family="JetBrains Mono,monospace" font-size="11">${query.substring(0, 22)}</text>
    <text x="40" y="248" fill="${THEME.dim}" font-family="JetBrains Mono,monospace" font-size="9">+ tutorial</text>
  `;

  // Quota meter (bottom-center)
  const quotaBar = `
    <text x="260" y="215" fill="${THEME.dim}" font-family="JetBrains Mono,monospace" font-size="9">DAILY QUOTA</text>
    ${progressBar(260, 220, 160, 10, quotaPct, quotaPct > 0.8 ? THEME.red : THEME.green)}
    <text x="260" y="245" fill="${THEME.gold}" font-family="JetBrains Mono,monospace" font-size="9">${quotaUsed} / ${quotaMax} units used</text>
  `;

  // Steps found badge strip (bottom-right)
  const tagBadges = tags.map((t, i) => badge(460 + i * 64, 220, t, THEME.purple)).join("");
  const stepsInfo = `
    <text x="460" y="215" fill="${THEME.dim}" font-family="JetBrains Mono,monospace" font-size="9">INFERRED TAGS</text>
    ${tagBadges}
    <text x="460" y="258" fill="${THEME.green}" font-family="JetBrains Mono,monospace" font-size="9">STEPS EXTRACTED: ${stepsFound}</text>
  `;

  // Video title banner
  const titleBanner = `
    <text x="${W / 2}" y="92" text-anchor="middle" fill="${THEME.dim}" font-family="JetBrains Mono,monospace" font-size="9">LEARNING FROM</text>
    <text x="${W / 2}" y="107" text-anchor="middle" fill="${THEME.gold}" font-family="JetBrains Mono,monospace" font-size="10" font-style="italic">${(videoTitle || "").substring(0, 50)}</text>
  `;

  const content = [
    titleBanner,
    nodes,
    edges,
    signal,
    pulseEl,
    queryBox,
    quotaBar,
    stepsInfo,
  ].join("\n");

  return panel(W, H, content, "BRIDGE · YOUTUBE SKILL DISCOVERY");
}
