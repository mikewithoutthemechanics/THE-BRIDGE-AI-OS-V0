/**
 * SVG Primitives — composable building blocks for all skill visualizations.
 * Every visual element in the engine is built from these atoms.
 */

export const THEME = {
  bg:       "#060810",
  bg2:      "#0a0e17",
  bg3:      "#111827",
  cyan:     "#63ffda",
  blue:     "#38bdf8",
  purple:   "#a78bfa",
  pink:     "#f472b6",
  orange:   "#fb923c",
  green:    "#4ade80",
  muted:    "#64748b",
  border:   "rgba(99,255,218,0.18)",
  font:     "JetBrains Mono, monospace",
  fontUI:   "Outfit, -apple-system, sans-serif",
};

// ─── DEFS ─────────────────────────────────────────────────────────────────────

export function glowDef(id, color = THEME.cyan, stdDev = 3) {
  return `<defs>
    <filter id="${id}" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="${stdDev}" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>
    <linearGradient id="grad-${id}" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%"   stop-color="${color}" stop-opacity="0.8"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0.2"/>
    </linearGradient>
  </defs>`;
}

export function multiGradDef(id, stops) {
  const stopSVG = stops.map(([offset, color], i) =>
    `<stop offset="${offset}" stop-color="${color}"/>`).join("");
  return `<defs><linearGradient id="${id}" x1="0%" y1="0%" x2="100%" y2="0%">${stopSVG}</linearGradient></defs>`;
}

// ─── NODES ────────────────────────────────────────────────────────────────────

export function node(x, y, w, h, label, meta = "", color = THEME.cyan, rx = 8) {
  return `<g>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}"
          fill="${THEME.bg2}" stroke="${color}" stroke-width="1.5"
          filter="url(#g-flow)"/>
    <text x="${x + w/2}" y="${y + h/2 - 6}" text-anchor="middle"
          fill="${color}" font-family="${THEME.font}" font-size="11" font-weight="500">${label}</text>
    <text x="${x + w/2}" y="${y + h/2 + 10}" text-anchor="middle"
          fill="${THEME.muted}" font-family="${THEME.font}" font-size="9">${meta}</text>
  </g>`;
}

export function hexNode(cx, cy, r, label, meta = "", color = THEME.cyan) {
  const pts = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    return `${Math.round(cx + r * Math.cos(a))},${Math.round(cy + r * Math.sin(a))}`;
  }).join(" ");
  return `<g>
    <polygon points="${pts}" fill="${THEME.bg2}" stroke="${color}" stroke-width="1.5"/>
    <text x="${cx}" y="${cy - 4}" text-anchor="middle"
          fill="${color}" font-family="${THEME.font}" font-size="10">${label}</text>
    <text x="${cx}" y="${cy + 10}" text-anchor="middle"
          fill="${THEME.muted}" font-family="${THEME.font}" font-size="8">${meta}</text>
  </g>`;
}

export function circle(cx, cy, r, label, color = THEME.cyan) {
  return `<g>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${THEME.bg2}" stroke="${color}" stroke-width="1.5"/>
    <text x="${cx}" y="${cy + 4}" text-anchor="middle"
          fill="${color}" font-family="${THEME.font}" font-size="10">${label}</text>
  </g>`;
}

// ─── EDGES ────────────────────────────────────────────────────────────────────

export function edge(x1, y1, x2, y2, color = THEME.cyan, dashed = false) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"
    stroke="${color}" stroke-width="1.5" stroke-opacity="0.6"
    ${dashed ? 'stroke-dasharray="6,3"' : ""}/>`;
}

export function curve(x1, y1, x2, y2, color = THEME.cyan) {
  const mx = (x1 + x2) / 2;
  return `<path d="M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}"
    fill="none" stroke="${color}" stroke-width="1.5" stroke-opacity="0.5"/>`;
}

export function arrow(x, y, color = THEME.cyan, size = 7, dir = "right") {
  if (dir === "right") {
    return `<polygon points="${x},${y} ${x - size},${y - size/2} ${x - size},${y + size/2}"
      fill="${color}" opacity="0.8"/>`;
  }
  if (dir === "down") {
    return `<polygon points="${x},${y} ${x - size/2},${y - size} ${x + size/2},${y - size}"
      fill="${color}" opacity="0.8"/>`;
  }
  return "";
}

// ─── ANIMATIONS ───────────────────────────────────────────────────────────────

export function signalDot(pathD, dur = "3s", color = THEME.cyan, r = 5) {
  return `<circle r="${r}" fill="${color}" opacity="0.9">
    <animateMotion dur="${dur}" repeatCount="indefinite" calcMode="linear">
      <mpath href="#sig-path-${color.replace("#","")}"/>
    </animateMotion>
  </circle>
  <path id="sig-path-${color.replace("#","")}" d="${pathD}" fill="none" stroke="none"/>`;
}

export function pulse(cx, cy, r, color = THEME.cyan, dur = "2s") {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="2">
    <animate attributeName="r" values="${r};${r * 2};${r}" dur="${dur}" repeatCount="indefinite"/>
    <animate attributeName="opacity" values="0.8;0;0.8" dur="${dur}" repeatCount="indefinite"/>
  </circle>`;
}

export function scanLine(W, H, color = THEME.cyan, dur = "4s") {
  return `<line x1="0" y1="0" x2="${W}" y2="0" stroke="${color}" stroke-width="1" opacity="0.3">
    <animateTransform attributeName="transform" type="translate" values="0,0;0,${H};0,0" dur="${dur}" repeatCount="indefinite"/>
  </line>`;
}

export function ticker(x, y, value, unit, color = THEME.cyan) {
  return `<text x="${x}" y="${y}" fill="${color}" font-family="${THEME.font}" font-size="20" font-weight="700">
    ${value}<tspan fill="${THEME.muted}" font-size="11"> ${unit}</tspan>
  </text>`;
}

// ─── LAYOUT HELPERS ───────────────────────────────────────────────────────────

export function label(x, y, text, color = THEME.muted, size = 10) {
  return `<text x="${x}" y="${y}" fill="${color}" font-family="${THEME.font}" font-size="${size}">${text}</text>`;
}

export function badge(x, y, text, color = THEME.cyan) {
  const w = text.length * 7 + 14;
  return `<g>
    <rect x="${x}" y="${y - 12}" width="${w}" height="18" rx="9" fill="${color}" fill-opacity="0.15" stroke="${color}" stroke-width="1"/>
    <text x="${x + w/2}" y="${y + 1}" text-anchor="middle" fill="${color}" font-family="${THEME.font}" font-size="9">${text}</text>
  </g>`;
}

export function progressBar(x, y, w, h, pct, color = THEME.cyan) {
  return `<g>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h/2}" fill="${THEME.bg3}"/>
    <rect x="${x}" y="${y}" width="${Math.round(w * pct)}" height="${h}" rx="${h/2}" fill="${color}" opacity="0.8">
      <animate attributeName="width" from="0" to="${Math.round(w * pct)}" dur="1s" fill="freeze"/>
    </rect>
  </g>`;
}

export function gauge(cx, cy, r, pct, label, color = THEME.cyan) {
  const startAngle = -Math.PI * 0.75;
  const endAngle   = startAngle + Math.PI * 1.5 * pct;
  const arcPath = (a1, a2) => {
    const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
    const x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2);
    return `M${x1} ${y1} A${r} ${r} 0 ${pct > 0.5 ? 1 : 0} 1 ${x2} ${y2}`;
  };
  return `<g>
    <path d="${arcPath(-Math.PI * 0.75, Math.PI * 0.75)}" fill="none" stroke="${THEME.bg3}" stroke-width="8"/>
    <path d="${arcPath(startAngle, endAngle)}" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round"/>
    <text x="${cx}" y="${cy + 4}" text-anchor="middle" fill="${color}" font-family="${THEME.font}" font-size="14" font-weight="700">${Math.round(pct * 100)}%</text>
    <text x="${cx}" y="${cy + 20}" text-anchor="middle" fill="${THEME.muted}" font-family="${THEME.font}" font-size="9">${label}</text>
  </g>`;
}

// ─── WRAPPER ──────────────────────────────────────────────────────────────────

export function panel(W, H, content, title = "", extra = "") {
  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${THEME.bg}" rx="12"/>
  ${extra}
  ${title ? `<text x="16" y="22" fill="${THEME.cyan}" font-family="${THEME.font}" font-size="10" opacity="0.6">${title}</text>` : ""}
  ${content}
</svg>`;
}
