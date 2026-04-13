// =============================================================================
// BRIDGE AI OS — File System Watcher
//
// Watches /config, /vars, /secrets for .bridge* file changes in real-time.
// Uses Node.js built-in fs.watch — no external dependencies.
//
// Behaviour:
//   - 300ms debounce per file (handles editor atomic saves / tmp file churn)
//   - Emits FILE_CHANGED or FILE_DELETED registry events
//   - Calls registered callback with { type, path, ext, domain }
//   - On Linux (no recursive support): watches each dir individually
//   - Graceful: watcher errors don't crash the process
//
// Usage:
//   const watcher = require('./watcher');
//   watcher.start(async ({ type, path }) => {
//     if (type === 'change') await hotReload.processChange(path);
//     if (type === 'delete') await hotReload.processDeletion(path);
//   });
// =============================================================================
'use strict';

const fs         = require('fs');
const path       = require('path');
const registry   = require('./registry');
const { SEARCH_DIRS, VALID_EXTENSIONS } = require('./discovery');

const DEBOUNCE_MS = parseInt(process.env.CONFIG_WATCHER_DEBOUNCE_MS) || 300;

const _watchers       = [];
const _debounceTimers = new Map();
const _callbacks      = new Set();
let   _started        = false;

// ── Build reverse lookup: dir → domain name ───────────────────────────────────
const _dirToDomain = Object.fromEntries(
  Object.entries(SEARCH_DIRS).map(([domain, dir]) => [dir, domain])
);

// ── Determine which domain a file path belongs to ────────────────────────────
function getDomain(filePath) {
  for (const [dir, domain] of Object.entries(_dirToDomain)) {
    if (filePath.startsWith(dir)) return domain;
  }
  return null;
}

// ── Dispatch a debounced file event ──────────────────────────────────────────
function dispatch(filePath) {
  const ext    = path.extname(filePath).toLowerCase();
  if (!VALID_EXTENSIONS[ext]) return; // ignore non-bridge files

  const exists = fs.existsSync(filePath);
  const type   = exists ? 'change' : 'delete';
  const domain = getDomain(filePath);

  registry.emit(exists ? 'FILE_CHANGED' : 'FILE_DELETED', {
    path: filePath, ext, domain,
  });

  for (const cb of _callbacks) {
    cb({ type, path: filePath, ext, domain }).catch(err => {
      console.error('[WATCHER] callback error:', err.message);
      registry.emit('WATCHER_CALLBACK_ERROR', { path: filePath, error: err.message });
    });
  }
}

// ── Create a debounced event handler for a specific file ─────────────────────
function onEvent(rawPath) {
  if (!rawPath) return;
  // Normalize path separators
  const filePath = rawPath.replace(/\\/g, '/');

  const key = filePath;
  if (_debounceTimers.has(key)) clearTimeout(_debounceTimers.get(key));
  _debounceTimers.set(key, setTimeout(() => {
    _debounceTimers.delete(key);
    dispatch(filePath);
  }, DEBOUNCE_MS));
}

// ── Watch a single directory ──────────────────────────────────────────────────
function watchDir(dir, domain) {
  try {
    fs.mkdirSync(dir, { recursive: true });

    // Windows + macOS support { recursive: true } natively.
    // Linux kernel < 5.x doesn't — fall back to non-recursive (single-level).
    const recursive = process.platform === 'win32' || process.platform === 'darwin';

    const watcher = fs.watch(dir, { recursive }, (eventType, filename) => {
      if (!filename) return;
      const fullPath = path.join(dir, filename).replace(/\\/g, '/');
      onEvent(fullPath);
    });

    watcher.on('error', err => {
      console.warn(`[WATCHER] Error on ${dir}:`, err.message);
      registry.emit('WATCHER_ERROR', { dir, error: err.message });
    });

    _watchers.push(watcher);
    registry.emit('WATCHER_STARTED', { dir, domain, recursive, debounceMs: DEBOUNCE_MS });
  } catch (err) {
    console.warn(`[WATCHER] Could not watch ${dir}:`, err.message);
    registry.emit('WATCHER_START_FAILED', { dir, error: err.message });
  }
}

// ── Public API ────────────────────────────────────────────────────────────────
function start(callback) {
  if (callback) _callbacks.add(callback);

  if (_started) return; // already watching — callback added above
  _started = true;

  for (const [domain, dir] of Object.entries(SEARCH_DIRS)) {
    watchDir(dir, domain);
  }
}

function stop() {
  for (const w of _watchers) { try { w.close(); } catch (_) {} }
  _watchers.length = 0;
  _callbacks.clear();
  for (const t of _debounceTimers.values()) clearTimeout(t);
  _debounceTimers.clear();
  _started = false;
  registry.emit('WATCHER_STOPPED', {});
}

function isRunning() { return _started; }

function addCallback(cb) { _callbacks.add(cb); }
function removeCallback(cb) { _callbacks.delete(cb); }

module.exports = { start, stop, isRunning, addCallback, removeCallback };
