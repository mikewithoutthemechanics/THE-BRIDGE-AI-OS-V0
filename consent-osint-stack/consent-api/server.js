const express = require('express');
const { Pool } = require('pg');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const app = express();
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://consent_user:changeme@consent-ledger:5432/consent_ledger'
});

const DEMO_MODE = process.env.DEMO_MODE !== 'false';
const NETWORK_MODE = process.env.NETWORK_MODE || 'offline';
const JWT_SECRET = process.env.JWT_SECRET || 'changeme';

// Consent verification middleware
const verifyConsent = async (req, res, next) => {
  const { subject_id, purpose } = req.body;
  
  if (DEMO_MODE) {
    req.consent_verified = true;
    req.demo_mode = true;
    return next();
  }

  try {
    const result = await pool.query(
      `SELECT id, status, consent_scope->>'purpose' as purpose 
       FROM consent_record 
       WHERE subject_id = $1 AND status = 'active' AND purpose = $2`,
      [subject_id, purpose]
    );

    if (result.rows.length === 0) {
      return res.status(403).json({ 
        error: 'Consent not verified',
        message: 'No valid consent found for this operation'
      });
    }

    req.consent_id = result.rows[0].id;
    req.consent_verified = true;
    next();
  } catch (err) {
    console.error('Consent verification error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Audit logging
const auditLog = async (eventType, subjectId, details) => {
  try {
    await pool.query(
      `INSERT INTO consent_audit_log (event_type, subject_id, performed_by, ip_address, event_details)
       VALUES ($1, $2, $3, $4, $5)`,
      [eventType, subjectId, details.performed_by || 'system', details.ip_address, JSON.stringify(details)]
    );
  } catch (err) {
    console.error('Audit log error:', err);
  }
};

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    demo_mode: DEMO_MODE,
    network_mode: NETWORK_MODE,
    timestamp: new Date().toISOString()
  });
});

// Get consent status
app.get('/api/v1/consent/:subject_id', async (req, res) => {
  try {
    const { subject_id } = req.params;
    const result = await pool.query(
      `SELECT id, consent_type, purpose, status, granted_at, expires_at 
       FROM consent_record WHERE subject_id = $1`,
      [subject_id]
    );
    res.json({ subject_id, consents: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Request consent
app.post('/api/v1/consent/request', async (req, res) => {
  const { subject_id, consent_type, purpose, consent_scope, expires_at } = req.body;

  if (DEMO_MODE) {
    const demoConsent = {
      id: crypto.randomUUID(),
      subject_id: subject_id || 'demo-subject',
      consent_type,
      purpose,
      status: 'active',
      granted_at: new Date().toISOString(),
      is_demo: true,
      message: 'Demo consent - no real data will be collected'
    };
    
    await auditLog('CONSENT_REQUESTED', demoConsent.subject_id, {
      consent_type,
      purpose,
      demo_mode: true
    });
    
    return res.json(demoConsent);
  }

  try {
    const consent_id = crypto.randomUUID();
    const receipt = crypto.randomUUID();
    
    const result = await pool.query(
      `INSERT INTO consent_record (id, subject_id, consent_type, purpose, consent_scope, granted_at, expires_at, status, consent_receipt)
       VALUES ($1, $2, $3, $4, $5, NOW(), $6, 'active', $7)
       RETURNING *`,
      [consent_id, subject_id, consent_type, purpose, JSON.stringify(consent_scope || {}), expires_at, receipt]
    );

    await auditLog('CONSENT_GRANTED', subject_id, {
      consent_type,
      purpose,
      consent_id
    });

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Verify consent
app.post('/api/v1/consent/verify', verifyConsent, async (req, res) => {
  const { subject_id, purpose } = req.body;
  
  res.json({
    verified: true,
    consent_id: req.consent_id,
    demo_mode: DEMO_MODE,
    network_mode: NETWORK_MODE,
    message: DEMO_MODE 
      ? 'Demo mode: synthetic data only'
      : 'Consent verified for live data collection'
  });
});

// Revoke consent
app.post('/api/v1/consent/revoke', async (req, res) => {
  const { consent_id, revocation_reason } = req.body;

  try {
    let subjectId;
    
    if (DEMO_MODE) {
      subjectId = 'demo-subject';
    } else {
      const result = await pool.query(
        'SELECT subject_id FROM consent_record WHERE id = $1',
        [consent_id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Consent not found' });
      }
      subjectId = result.rows[0].subject_id;
    }

    if (!DEMO_MODE) {
      await pool.query(
        `UPDATE consent_record SET status = 'revoked', revoked_at = NOW() WHERE id = $1`,
        [consent_id]
      );
    }

    await auditLog('CONSENT_REVOKED', subjectId, {
      consent_id,
      reason: revocation_reason
    });

    res.json({
      status: 'revoked',
      revoked_at: new Date().toISOString(),
      demo_mode: DEMO_MODE
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Data subject rights - access request
app.get('/api/v1/subject/:subject_id/data', async (req, res) => {
  const { subject_id } = req.params;
  
  try {
    const dataResult = await pool.query(
      'SELECT id, record_type, collected_at, collection_method FROM data_record WHERE subject_id = $1',
      [subject_id]
    );

    const consentResult = await pool.query(
      'SELECT * FROM consent_record WHERE subject_id = $1',
      [subject_id]
    );

    res.json({
      subject_id,
      data_records: dataResult.rows,
      consent_records: consentResult.rows,
      request_date: new Date().toISOString()
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete subject data (right to erasure)
app.delete('/api/v1/subject/:subject_id', async (req, res) => {
  const { subject_id } = req.params;

  try {
    await pool.query('DELETE FROM data_record WHERE subject_id = $1', [subject_id]);
    await pool.query('UPDATE consent_record SET status = \'revoked\' WHERE subject_id = $1', [subject_id]);

    await auditLog('DATA_ERASED', subject_id, { request_type: 'erasure' });

    res.json({
      status: 'erased',
      subject_id,
      erased_at: new Date().toISOString()
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Configuration endpoint
app.get('/api/v1/config', (req, res) => {
  res.json({
    demo_mode: DEMO_MODE,
    network_mode: NETWORK_MODE,
    features: {
      consent_management: true,
      data_vault: true,
      osint_tools: !DEMO_MODE,
      monetization: true,
      analytics: true
    }
  });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Consent API running on port ${PORT}`);
  console.log(`Demo mode: ${DEMO_MODE}`);
  console.log(`Network mode: ${NETWORK_MODE}`);
});
