// =============================================================================
// BRIDGE AI OS — Zero-Trust Secrets Manager
//
// Handles all secret lifecycle operations:
//   - Encryption at rest (AES-256-GCM)
//   - Controlled decryption (caller must provide purpose context)
//   - Rotation detection + enforcement
//   - Never exposes raw secrets outside secure execution boundary
//
// Raw secret values NEVER appear in:
//   - Registry events (only key names are logged)
//   - Merged state objects
//   - Snapshot files
//   - API responses
// =============================================================================
'use strict';

const crypto   = require('crypto');
const registry = require('./registry');

const ALGORITHM = 'aes-256-gcm';
const IV_LEN    = 12;  // 96-bit IV for GCM
const TAG_LEN   = 16;

// ── Derive encryption key from master secret ──────────────────────────────────
function deriveKey(masterSecret, salt = 'bridge-ai-os-secrets-v1') {
  return crypto.pbkdf2Sync(
    masterSecret,
    Buffer.from(salt, 'utf8'),
    100000,  // iterations
    32,      // 256-bit key
    'sha256'
  );
}

const MASTER_SECRET = process.env.SECRETS_MASTER_KEY || process.env.JWT_SECRET || 'bridge-ai-os-fallback-key';
const ENCRYPTION_KEY = deriveKey(MASTER_SECRET);

// ── Encrypt a plaintext secret ────────────────────────────────────────────────
function encrypt(plaintext) {
  const iv  = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv, { authTagLength: TAG_LEN });

  const encrypted = Buffer.concat([
    cipher.update(String(plaintext), 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return {
    encrypted: encrypted.toString('base64'),
    iv:        iv.toString('hex'),
    tag:       tag.toString('hex'),
  };
}

// ── Decrypt a secret ─────────────────────────────────────────────────────────
function decrypt(encryptedB64, ivHex, tagHex) {
  try {
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      ENCRYPTION_KEY,
      Buffer.from(ivHex, 'hex'),
      { authTagLength: TAG_LEN }
    );
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedB64, 'base64')),
      decipher.final(),
    ]);
    return { ok: true, value: decrypted.toString('utf8') };
  } catch (err) {
    return { ok: false, error: `Decryption failed: ${err.message}` };
  }
}

// ── Encrypt all plaintext secrets in a secret CIO ────────────────────────────
function encryptCIO(cio) {
  const secrets = cio.payload.secrets || {};
  const encrypted = {};
  let count = 0;

  for (const [k, v] of Object.entries(secrets)) {
    if (v.plaintext && !v.encrypted) {
      const { encrypted: enc, iv, tag } = encrypt(v.plaintext);
      encrypted[k] = { ...v, encrypted: enc, iv, tag, plaintext: undefined, source: 'encrypted' };
      count++;
      registry.emit('SECRET_ENCRYPTED', { key: k, namespace: cio.namespace });
    } else {
      encrypted[k] = v;
    }
  }

  return { encryptedCount: count, updatedSecrets: encrypted };
}

// ── Access-controlled secret resolution ──────────────────────────────────────
// Only resolves secrets for callers that provide a valid purpose context.
// All accesses are logged.
const ALLOWED_PURPOSES = new Set(['runtime-inject', 'twin-dispatch', 'integration-auth', 'rotation-check']);

function resolveSecret(cio, secretKey, purpose, callerId = 'unknown') {
  if (!ALLOWED_PURPOSES.has(purpose)) {
    registry.emit('SECRET_ACCESS_DENIED', {
      key: secretKey, namespace: cio.namespace, purpose, callerId,
    });
    return { ok: false, error: `Purpose not allowed: ${purpose}` };
  }

  const s = cio.payload.secrets?.[secretKey];
  if (!s) return { ok: false, error: `Secret not found: ${secretKey}` };

  let value;
  if (s.encrypted && s.iv && s.tag) {
    const result = decrypt(s.encrypted, s.iv, s.tag);
    if (!result.ok) {
      registry.emit('SECRET_DECRYPT_FAILED', { key: secretKey, namespace: cio.namespace, error: result.error });
      return result;
    }
    value = result.value;
  } else if (s.plaintext) {
    value = s.plaintext;
  } else {
    return { ok: false, error: `Secret ${secretKey} has no resolvable value` };
  }

  registry.emit('SECRET_ACCESSED', { key: secretKey, namespace: cio.namespace, purpose, callerId });

  return { ok: true, value };
}

// ── Rotation check ─────────────────────────────────────────────────────────
function checkRotation(cio) {
  const overdue = [];
  const secrets = cio.payload.secrets || {};

  for (const [k, v] of Object.entries(secrets)) {
    // Find the last rotation event for this key
    const lastRotation = registry.getEvents({ type: 'SECRET_ROTATED' })
      .filter(e => e.data.key === k && e.data.namespace === cio.namespace)
      .pop();

    const lastRotatedAt  = lastRotation?.ts || cio.createdAt || 0;
    const ageMs          = Date.now() - lastRotatedAt;
    const ageDays        = Math.floor(ageMs / (1000 * 60 * 60 * 24));

    const policyDays     = parseInt(v.rotation_policy) || 90;

    if (ageDays >= policyDays) {
      overdue.push({ key: k, ageDays, policyDays, overdueBy: ageDays - policyDays });
    }
  }

  if (overdue.length > 0) {
    registry.emit('SECRETS_ROTATION_OVERDUE', { namespace: cio.namespace, overdue });
  }

  return overdue;
}

// ── Inject resolved secrets into environment (for runtime startup) ────────────
function injectToEnv(cio, purpose = 'runtime-inject', callerId = 'engine-startup') {
  const secrets = cio.payload.secrets || {};
  let injected = 0;

  for (const key of Object.keys(secrets)) {
    const result = resolveSecret(cio, key, purpose, callerId);
    if (result.ok) {
      process.env[key] = result.value;
      injected++;
    }
  }

  return injected;
}

module.exports = { encrypt, decrypt, encryptCIO, resolveSecret, checkRotation, injectToEnv };
