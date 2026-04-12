'use strict';
/**
 * lib/iot-agent.js — IoT Device Agent Economy
 *
 * Every physical IoT device is a first-class agent in the Bridge AI OS economy:
 *   - Devices register → get API key + agent twin + BRDG wallet
 *   - Devices push telemetry → earn BRDG per data batch
 *   - Devices can spend BRDG on AI inference via AP2 marketplace
 *   - Data feeds into the autonomous pipeline as IoT signals
 *
 * For now: agent economy only (no hardware SDK required)
 * Future: LoRa, Zigbee, MQTT, Matter protocol bridges
 */

const crypto = require('crypto');
const { supabaseAdmin, isConfigured } = require('./supabase');

// ── BRDG earning rates ────────────────────────────────────────────────────────
const EARN_RATES = {
  telemetry_batch:   1,    // BRDG per telemetry push (any size)
  anomaly_detected:  5,    // BRDG bonus when device flags an anomaly
  uptime_daily:      2,    // BRDG per day of continuous uptime
  high_frequency:    3,    // BRDG bonus for >10 readings in a batch
  first_push:       10,    // BRDG one-time bonus on first telemetry
};

// Device type → capabilities mapping (for twin creation)
const DEVICE_TYPES = {
  sensor:       { skills: ['telemetry', 'anomaly_detection'], layer: 'iot' },
  camera:       { skills: ['vision', 'motion_detection', 'object_recognition'], layer: 'iot' },
  actuator:     { skills: ['command_execution', 'state_control'], layer: 'iot' },
  gateway:      { skills: ['mesh_routing', 'protocol_bridge', 'edge_compute'], layer: 'iot' },
  edge_compute: { skills: ['local_inference', 'preprocessing', 'filtering'], layer: 'iot' },
  environmental:{ skills: ['temperature', 'humidity', 'air_quality', 'co2'], layer: 'iot' },
  energy:       { skills: ['power_monitoring', 'solar_tracking', 'load_balancing'], layer: 'iot' },
  wearable:     { skills: ['biometrics', 'location', 'activity'], layer: 'iot' },
};

// ── Internal ledger fallback (when Supabase unavailable) ─────────────────────
const memDevices = new Map();
const memTelemetry = [];

// ── Device Registration ───────────────────────────────────────────────────────

/**
 * Register an IoT device as an agent in the economy.
 * Returns { device_id, api_key, agent_id, wallet } for the device to store.
 */
async function registerDevice({ name, type = 'sensor', owner_user_id = null, metadata = {} }) {
  const device_id = 'iot_' + Date.now().toString(36) + '_' + crypto.randomBytes(4).toString('hex');
  const api_key   = 'brdg_iot_' + crypto.randomBytes(20).toString('hex');
  const agent_id  = 'agent_iot_' + device_id;
  const caps      = DEVICE_TYPES[type] || DEVICE_TYPES.sensor;

  const device = {
    device_id,
    api_key,
    agent_id,
    name: name || `IoT Device ${device_id.slice(-6)}`,
    type,
    owner_user_id,
    brdg_earned: 0,
    brdg_balance: 0,
    status: 'active',
    push_count: 0,
    metadata: { ...metadata, caps },
    registered_at: new Date().toISOString(),
    last_seen: null,
  };

  if (isConfigured) {
    // Insert into iot_devices
    const { error: devErr } = await supabaseAdmin.from('iot_devices').insert({
      device_id,
      api_key,
      agent_id,
      name: device.name,
      type,
      owner_user_id,
      brdg_earned: 0,
      brdg_balance: 0,
      status: 'active',
      push_count: 0,
      metadata,
      registered_at: device.registered_at,
    });
    if (devErr && devErr.code !== '23505') {
      console.warn('[iot-agent] device insert error:', devErr.message);
    }

    // Create agent twin in agent_twins table
    try {
      await supabaseAdmin.from('agent_twins').upsert({
        user_id: owner_user_id || device_id,
        agent_id,
        name: device.name,
        persona: `IoT ${type} agent for ${device.name}`,
        skills: caps.skills,
        level: 1,
        xp: 0,
        brdg_balance: 0,
        status: 'active',
      }, { onConflict: 'agent_id' });
    } catch (_) {}
  }

  memDevices.set(device_id, device);
  return { device_id, api_key, agent_id, brdg_wallet: agent_id, type, caps: caps.skills };
}

// ── Telemetry Ingestion + BRDG Earning ───────────────────────────────────────

/**
 * Accept a telemetry batch from a device.
 * Validates API key, records readings, credits BRDG.
 *
 * @param {string} api_key - Device's API key
 * @param {Array}  readings - [{ metric, value, unit, timestamp? }]
 * @returns {{ ok, brdg_earned, total_brdg, device_id }}
 */
async function pushTelemetry(api_key, readings = []) {
  // Authenticate device
  const device = await getDeviceByApiKey(api_key);
  if (!device) return { ok: false, error: 'invalid_api_key' };

  const now = new Date().toISOString();
  let brdg = EARN_RATES.telemetry_batch;

  // Bonus: first push ever
  if (device.push_count === 0) brdg += EARN_RATES.first_push;

  // Bonus: high-frequency batch
  if (readings.length >= 10) brdg += EARN_RATES.high_frequency;

  // Bonus: anomaly flag in any reading
  const hasAnomaly = readings.some(r => r.anomaly === true || r.flag === 'anomaly');
  if (hasAnomaly) brdg += EARN_RATES.anomaly_detected;

  // Store telemetry
  if (isConfigured && readings.length > 0) {
    const rows = readings.map(r => ({
      device_id: device.device_id,
      metric:    r.metric || 'unknown',
      value:     typeof r.value === 'number' ? r.value : parseFloat(r.value) || 0,
      unit:      r.unit || null,
      raw:       r,
      timestamp: r.timestamp || now,
    }));
    await supabaseAdmin.from('iot_telemetry').insert(rows).catch(e =>
      console.warn('[iot-agent] telemetry insert:', e.message)
    );

    // Credit BRDG to device
    await supabaseAdmin.from('iot_devices').update({
      brdg_earned:  (device.brdg_earned || 0) + brdg,
      brdg_balance: (device.brdg_balance || 0) + brdg,
      push_count:   (device.push_count || 0) + 1,
      last_seen:    now,
    }).eq('device_id', device.device_id);

    // Log earning in iot_earnings
    await supabaseAdmin.from('iot_earnings').insert({
      device_id:  device.device_id,
      brdg_amount: brdg,
      reason:     buildEarnReason(device.push_count, readings.length, hasAnomaly),
      batch_size: readings.length,
      created_at: now,
    }).catch(() => {});

    // Also credit internal supaclaw ledger so it shows up in agent economy
    try {
      const ledger = require('./supaclaw-ledger');
      await ledger.credit(device.agent_id, brdg, 'iot_telemetry', `${readings.length} readings from ${device.name}`);
    } catch (_) {}
  } else {
    // In-memory fallback
    memTelemetry.push(...readings.map(r => ({ ...r, device_id: device.device_id, ingested_at: now })));
    if (memDevices.has(device.device_id)) {
      const d = memDevices.get(device.device_id);
      d.brdg_earned  = (d.brdg_earned || 0) + brdg;
      d.brdg_balance = (d.brdg_balance || 0) + brdg;
      d.push_count   = (d.push_count || 0) + 1;
      d.last_seen    = now;
    }
  }

  return {
    ok: true,
    device_id:   device.device_id,
    brdg_earned: brdg,
    total_brdg:  (device.brdg_earned || 0) + brdg,
    readings_recorded: readings.length,
  };
}

// ── Economy stats ─────────────────────────────────────────────────────────────

async function getEconomyStats() {
  if (!isConfigured) {
    return {
      total_devices: memDevices.size,
      active_devices: [...memDevices.values()].filter(d => d.status === 'active').length,
      total_brdg_earned: [...memDevices.values()].reduce((s, d) => s + (d.brdg_earned || 0), 0),
      total_readings: memTelemetry.length,
      source: 'memory',
    };
  }

  const [devStats, earnStats] = await Promise.all([
    supabaseAdmin.from('iot_devices').select('status, brdg_earned, push_count'),
    supabaseAdmin.from('iot_telemetry').select('id', { count: 'exact', head: true }),
  ]);

  const devices = devStats.data || [];
  return {
    total_devices:     devices.length,
    active_devices:    devices.filter(d => d.status === 'active').length,
    total_brdg_earned: devices.reduce((s, d) => s + (d.brdg_earned || 0), 0),
    total_readings:    earnStats.count || 0,
    total_pushes:      devices.reduce((s, d) => s + (d.push_count || 0), 0),
    source: 'supabase',
  };
}

async function listDevices(limit = 50) {
  if (!isConfigured) return [...memDevices.values()].slice(0, limit);
  const { data } = await supabaseAdmin
    .from('iot_devices')
    .select('device_id, name, type, status, brdg_earned, brdg_balance, push_count, last_seen, registered_at')
    .order('registered_at', { ascending: false })
    .limit(limit);
  return data || [];
}

async function getDevice(device_id) {
  if (!isConfigured) return memDevices.get(device_id) || null;
  const { data } = await supabaseAdmin.from('iot_devices')
    .select('*').eq('device_id', device_id).single();
  return data || null;
}

async function getDeviceEarnings(device_id, limit = 20) {
  if (!isConfigured) return [];
  const { data } = await supabaseAdmin.from('iot_earnings')
    .select('*').eq('device_id', device_id).order('created_at', { ascending: false }).limit(limit);
  return data || [];
}

async function getLatestTelemetry(device_id, limit = 50) {
  if (!isConfigured) return memTelemetry.filter(t => t.device_id === device_id).slice(-limit);
  const { data } = await supabaseAdmin.from('iot_telemetry')
    .select('metric, value, unit, timestamp').eq('device_id', device_id)
    .order('timestamp', { ascending: false }).limit(limit);
  return data || [];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getDeviceByApiKey(api_key) {
  if (!api_key) return null;
  if (isConfigured) {
    const { data } = await supabaseAdmin.from('iot_devices')
      .select('*').eq('api_key', api_key).eq('status', 'active').single();
    return data || null;
  }
  return [...memDevices.values()].find(d => d.api_key === api_key) || null;
}

function buildEarnReason(pushCount, batchSize, hasAnomaly) {
  const parts = ['telemetry_batch'];
  if (pushCount === 0) parts.push('first_push_bonus');
  if (batchSize >= 10) parts.push('high_frequency_bonus');
  if (hasAnomaly) parts.push('anomaly_detection_bonus');
  return parts.join('+');
}

module.exports = {
  registerDevice,
  pushTelemetry,
  getEconomyStats,
  listDevices,
  getDevice,
  getDeviceEarnings,
  getLatestTelemetry,
  EARN_RATES,
  DEVICE_TYPES,
};
