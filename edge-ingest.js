require('dotenv').config();

// Resolve key from any of the three possible env names used across the codebase.
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY =
  process.env.SUPABASE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  '';

let supabase = null;
try {
  if (SUPABASE_URL && SUPABASE_KEY) {
    const { createClient } = require('@supabase/supabase-js');
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  } else {
    console.warn('[edge-ingest] Supabase URL/KEY not set — telemetry disabled (gateway continues)');
  }
} catch (e) {
  console.warn('[edge-ingest] Supabase init failed — telemetry disabled:', e.message);
  supabase = null;
}

module.exports = function edgeIngest(req, res, next) {
  const start = Date.now();
  res.on('finish', async () => {
    if (!supabase) return;
    const latency = Date.now() - start;
    const url = req.originalUrl || req.url;
    const events = [];
    if (latency > 300) events.push({ type: 'latency', value: latency });
    if (url.includes('/auth')) events.push({ type: 'auth', value: 1 });
    if (url.includes('/llm') || url.includes('/infer')) events.push({ type: 'cost', value: 1 });
    for (const e of events) {
      try {
        await supabase.from('events').insert({
          ts: new Date().toISOString(),
          type: e.type,
          value: e.value,
          meta: url,
        });
      } catch (_) { /* telemetry must never break the gateway */ }
    }
  });
  next();
};
