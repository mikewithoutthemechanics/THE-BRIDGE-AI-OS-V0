#!/usr/bin/env node
/**
 * generate-assets.js
 * Creates PWA icon PNGs (icon-192.png, icon-512.png) and og-image.png
 * using only Node.js built-in modules (no canvas dependency).
 *
 * Produces minimal valid PNG files with a cyan (#00c8ff) background
 * and a centered white "B" rendered as pixel art.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const PUBLIC = path.join(__dirname, '..', 'public');

// ── PNG helpers ──────────────────────────────────────────────────────
function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([len, typeAndData, crc]);
}

function createPNG(width, height, pixelFn) {
  // Build raw image data: filter byte 0 (None) + RGB for each row
  const raw = [];
  for (let y = 0; y < height; y++) {
    raw.push(0); // filter byte
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixelFn(x, y, width, height);
      raw.push(r, g, b);
    }
  }

  const rawBuf = Buffer.from(raw);
  const compressed = zlib.deflateSync(rawBuf, { level: 9 });

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Drawing helpers ──────────────────────────────────────────────────
const BG = [5, 10, 15];       // #050a0f
const CYAN = [0, 200, 255];   // #00c8ff
const WHITE = [255, 255, 255];
const DIM_CYAN = [0, 140, 200];

// Simple "B" glyph on a 7x9 grid
const B_GLYPH = [
  '######.',
  '#.....#',
  '#.....#',
  '######.',
  '#.....#',
  '#.....#',
  '#.....#',
  '######.',
  '........',
];
const GLYPH_W = 7;
const GLYPH_H = 9;

function drawIcon(x, y, w, h) {
  // Background: dark with subtle radial gradient toward cyan
  const cx = w / 2, cy = h / 2;
  const maxDist = Math.sqrt(cx * cx + cy * cy);
  const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) / maxDist;

  // Rounded corner mask (radius = 18.75% of width, matching SVG rx=96/512)
  const radius = Math.floor(w * 0.1875);
  const inCorner = (px, py) => {
    if (px < radius && py < radius) return Math.sqrt((px - radius) ** 2 + (py - radius) ** 2) > radius;
    if (px >= w - radius && py < radius) return Math.sqrt((px - (w - radius - 1)) ** 2 + (py - radius) ** 2) > radius;
    if (px < radius && py >= h - radius) return Math.sqrt((px - radius) ** 2 + (py - (h - radius - 1)) ** 2) > radius;
    if (px >= w - radius && py >= h - radius) return Math.sqrt((px - (w - radius - 1)) ** 2 + (py - (h - radius - 1)) ** 2) > radius;
    return false;
  };

  if (inCorner(x, y)) return [0, 0, 0]; // transparent (black) outside corners

  // Grid lines (subtle)
  const gridSpacing = Math.floor(w / 4);
  const onGrid = (x % gridSpacing < 2 || y % gridSpacing < 2);

  let bg = BG.slice();
  if (onGrid) {
    bg = bg.map((c, i) => Math.min(255, c + Math.floor(CYAN[i] * 0.06)));
  }

  // Subtle radial glow in center
  const glow = Math.max(0, 1 - dist * 1.5);
  bg = bg.map((c, i) => Math.min(255, Math.floor(c + CYAN[i] * glow * 0.08)));

  // "B" letter - centered, sized to ~50% of icon
  const letterW = Math.floor(w * 0.45);
  const letterH = Math.floor(h * 0.55);
  const letterX = Math.floor((w - letterW) / 2);
  const letterY = Math.floor((h - letterH) / 2);

  if (x >= letterX && x < letterX + letterW && y >= letterY && y < letterY + letterH) {
    const gx = Math.floor((x - letterX) / (letterW / GLYPH_W));
    const gy = Math.floor((y - letterY) / (letterH / GLYPH_H));
    if (gy < GLYPH_H && gx < GLYPH_W && B_GLYPH[gy][gx] === '#') {
      // Gradient on the letter: top=bright cyan, bottom=slightly dimmer
      const t = (y - letterY) / letterH;
      return CYAN.map((c, i) => Math.floor(c + (DIM_CYAN[i] - c) * t * 0.3));
    }
  }

  return bg;
}

function drawOgImage(x, y, w, h) {
  // 1200x630 OG image: dark background with centered "Bridge AI OS" concept
  const cx = w / 2, cy = h / 2;
  const maxDist = Math.sqrt(cx * cx + cy * cy);
  const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) / maxDist;

  // Background with subtle radial gradient
  const glow = Math.max(0, 1 - dist * 1.4);
  let bg = BG.map((c, i) => Math.min(255, Math.floor(c + CYAN[i] * glow * 0.12)));

  // Horizontal line accents
  if (y === Math.floor(h * 0.15) || y === Math.floor(h * 0.85)) {
    const edgeDist = Math.abs(x - cx) / cx;
    if (edgeDist < 0.6) {
      const fade = 1 - edgeDist / 0.6;
      return CYAN.map(c => Math.floor(c * fade * 0.4));
    }
  }

  // Grid dots
  const dotSpacing = 40;
  const dotRadius = 1;
  const dx = (x % dotSpacing) - dotSpacing / 2;
  const dy = (y % dotSpacing) - dotSpacing / 2;
  if (Math.sqrt(dx * dx + dy * dy) < dotRadius) {
    return bg.map((c, i) => Math.min(255, c + Math.floor(CYAN[i] * 0.15)));
  }

  // Large centered "B" letter
  const letterW = Math.floor(h * 0.4);  // based on height for correct proportions
  const letterH = Math.floor(h * 0.5);
  const letterX = Math.floor((w - letterW) / 2);
  const letterY = Math.floor((h - letterH) / 2);

  if (x >= letterX && x < letterX + letterW && y >= letterY && y < letterY + letterH) {
    const gx = Math.floor((x - letterX) / (letterW / GLYPH_W));
    const gy = Math.floor((y - letterY) / (letterH / GLYPH_H));
    if (gy < GLYPH_H && gx < GLYPH_W && B_GLYPH[gy][gx] === '#') {
      return CYAN;
    }
  }

  // "Bridge AI OS" text area indicator — a subtle bar below the B
  const barY = letterY + letterH + Math.floor(h * 0.06);
  const barH = 3;
  const barW = Math.floor(w * 0.25);
  const barX = Math.floor((w - barW) / 2);
  if (y >= barY && y < barY + barH && x >= barX && x < barX + barW) {
    return CYAN.map(c => Math.floor(c * 0.5));
  }

  return bg;
}

// ── Generate files ───────────────────────────────────────────────────
console.log('Generating icon-192.png ...');
fs.writeFileSync(path.join(PUBLIC, 'icon-192.png'), createPNG(192, 192, drawIcon));

console.log('Generating icon-512.png ...');
fs.writeFileSync(path.join(PUBLIC, 'icon-512.png'), createPNG(512, 512, drawIcon));

console.log('Generating og-image.png ...');
fs.writeFileSync(path.join(PUBLIC, 'og-image.png'), createPNG(1200, 630, drawOgImage));

console.log('Done. Files written to public/');
