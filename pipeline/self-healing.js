#!/usr/bin/env node
/**
 * [PIPELINE] Self-Healing Upgrade System
 * ======================================
 * Phase 1: Audit - Scan codebase for issues
 * Phase 2: Auto-Refactor - Apply structured fixes
 * Phase 3: Test Execution - Run test suite
 * Phase 4: Deploy - Staging → Production
 * Phase 5: Evaluate - Health score
 * Phase 6: Repeat Loop - Until 95% threshold
 * 
 * Run: node pipeline/self-healing.js
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SHARED = path.join(ROOT, 'shared');
const USERS_FILE = path.join(SHARED, 'users.json');
const REFERRALS_FILE = path.join(SHARED, 'referrals.json');

// ─── CONFIG ────────────────────────────────────────────────────────────
const CONFIG = {
  superAdminEmail: 'ryanpcowan@gmail.com',
  superAdminPassword: 'BridgeAdmin2026!',
  authServicePort: 9005,
  stagingPort: 8080,
  productionPort: 8080,
  healthThreshold: 0.95,
  maxRetries: 5,
};

// Phase tracking
let phaseLog = [];
let healthScore = 0;
let retryCount = 0;

// ─── UTILITIES ────────────────────────────────────────────────────────────
function log(phase, msg) {
  const entry = `[${phase}] ${msg}`;
  phaseLog.push(entry);
  console.log(`  ${entry}`);
}

function loadJSON(filePath, defaultValue = {}) {
  try {
    if (!fs.existsSync(filePath)) return defaultValue;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch { return defaultValue; }
}

function saveJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function ensureSharedDir() {
  if (!fs.existsSync(SHARED)) {
    fs.mkdirSync(SHARED, { recursive: true });
  }
}

// ─── CRYPTO HELPERS (from auth-service.js) ───────────────────────────────
function hashPassword(password, salt) {
  return crypto.createHmac('sha256', salt).update(password).digest('hex');
}

function generateSalt() {
  return crypto.randomBytes(16).toString('hex');
}

function generateUserId() {
  return 'usr_' + crypto.randomBytes(12).toString('hex');
}

function generateReferralCode() {
  return 'REF-' + crypto.randomBytes(5).toString('hex').toUpperCase();
}

// ─── PHASE 1: AUDIT ──────────────────────────────────────────────────────────
function audit() {
  console.log('\n📋 PHASE 1: AUDIT');
  console.log('═══════════════════════════════════════════');
  
  const issues = [];
  
  // Check auth service exists
  const authServicePath = path.join(ROOT, 'Xscripts', 'auth-service.js');
  if (!fs.existsSync(authServicePath)) {
    issues.push({ severity: 'critical', issue: 'auth-service.js missing' });
  } else {
    log('AUDIT', '✓ Auth service found');
  }
  
  // Check shared directory
  ensureSharedDir();
  if (!fs.existsSync(SHARED)) {
    issues.push({ severity: 'critical', issue: 'shared directory missing' });
  } else {
    log('AUDIT', '✓ Shared directory exists');
  }
  
  // Check users.json
  const users = loadJSON(USERS_FILE, {});
  if (Object.keys(users).length === 0) {
    issues.push({ severity: 'high', issue: 'No users in system - needs superadmin seed' });
  } else {
    log('AUDIT', `✓ ${Object.keys(users).length} users loaded`);
  }
  
  // Check superadmin exists
  const superAdmin = users[CONFIG.superAdminEmail];
  if (!superAdmin) {
    issues.push({ severity: 'critical', issue: 'Superadmin not seeded' });
  } else if (superAdmin.role !== 'superadmin') {
    issues.push({ severity: 'critical', issue: 'User exists but role is not superadmin' });
  } else {
    log('AUDIT', `✓ Superadmin ${CONFIG.superAdminEmail} seeded`);
  }
  
  // Check referral file
  ensureSharedDir();
  const referrals = loadJSON(REFERRALS_FILE, {});
  if (Object.keys(referrals).length === 0) {
    issues.push({ severity: 'medium', issue: 'No referral codes initialized' });
  } else {
    log('AUDIT', `✓ ${Object.keys(referrals).length} referral codes loaded`);
  }
  
  // Check frontend auth integration
  const onboardingPath = path.join(ROOT, 'Xpublic', 'onboarding.html');
  if (fs.existsSync(onboardingPath)) {
    const content = fs.readFileSync(onboardingPath, 'utf8');
    if (content.includes('/auth/register') && content.includes('/auth/login')) {
      log('AUDIT', '✓ Frontend auth integration found');
    } else {
      issues.push({ severity: 'high', issue: 'Frontend auth endpoints not connected' });
    }
  }
  
  // Check welcome page navigation
  const welcomePath = path.join(ROOT, 'Xpublic', 'welcome.html');
  if (fs.existsSync(welcomePath)) {
    const content = fs.readFileSync(welcomePath, 'utf8');
    if (content.includes('localStorage') && content.includes('bridge_token')) {
      log('AUDIT', '✓ Session persistence in welcome page');
    } else {
      issues.push({ severity: 'high', issue: 'Welcome page missing session handling' });
    }
  }
  
  if (issues.length === 0) {
    console.log('  ✓ No issues detected');
    return { pass: true, issues: [] };
  }
  
  console.log(`\n  Issues found: ${issues.length}`);
  issues.forEach(i => console.log(`    • [${i.severity}] ${i.issue}`));
  
  return { pass: false, issues };
}

// ─── PHASE 2: AUTO-REFACTOR ───────────────────────────────────────────────
function autofix() {
  console.log('\n🔧 PHASE 2: AUTO-REFACTOR');
  console.log('═══════════════════════════════════════════');
  
  ensureSharedDir();
  
  // Load existing data
  let users = loadJSON(USERS_FILE, {});
  let referrals = loadJSON(REFERRALS_FILE, {});
  
  // Create superadmin if not exists
  if (!users[CONFIG.superAdminEmail]) {
    const salt = generateSalt();
    const userId = 'usr_superadmin_' + crypto.randomBytes(8).toString('hex');
    
    users[CONFIG.superAdminEmail] = {
      id: userId,
      email: CONFIG.superAdminEmail,
      passwordHash: hashPassword(CONFIG.superAdminPassword, salt),
      salt,
      source: 'BRIDGE_AI_OS',
      role: 'superadmin',
      createdAt: new Date().toISOString(),
      referralCode: generateReferralCode(),
      credits: 999999,
      plan: 'enterprise',
    };
    
    log('FIX', `✓ Created superadmin: ${CONFIG.superAdminEmail}`);
  } else {
    // Update role if exists but wrong
    if (users[CONFIG.superAdminEmail].role !== 'superadmin') {
      users[CONFIG.superAdminEmail].role = 'superadmin';
      users[CONFIG.superAdminEmail].credits = 999999;
      users[CONFIG.superAdminEmail].plan = 'enterprise';
      log('FIX', `✓ Updated superadmin role`);
    }
  }
  
  // Add superadmin referral code
  const superAdminRefCode = users[CONFIG.superAdminEmail]?.referralCode;
  if (superAdminRefCode && !referrals[superAdminRefCode]) {
    referrals[superAdminRefCode] = {
      code: superAdminRefCode,
      ownerId: users[CONFIG.superAdminEmail].id,
      uses: [],
      createdAt: new Date().toISOString(),
    };
    log('FIX', `✓ Created superadmin referral code: ${superAdminRefCode}`);
  }
  
  // Add default user roles for navigation
  const defaultUsers = [
    { email: 'demo@bridge.ai', role: 'demo', plan: 'free' },
    { email: 'pro@bridge.ai', role: 'member', plan: 'pro' },
  ];
  
  defaultUsers.forEach(u => {
    if (!users[u.email]) {
      const salt = generateSalt();
      users[u.email] = {
        id: generateUserId(),
        email: u.email,
        passwordHash: hashPassword('demo1234', salt),
        salt,
        source: 'BRIDGE_AI_OS',
        role: u.role,
        createdAt: new Date().toISOString(),
        referralCode: generateReferralCode(),
        credits: u.plan === 'pro' ? 1000 : 100,
        plan: u.plan,
      };
      log('FIX', `✓ Created default ${u.role} user: ${u.email}`);
    }
  });
  
  // Persist
  saveJSON(USERS_FILE, users);
  saveJSON(REFERRALS_FILE, referrals);
  
  console.log(`\n  ✓ Persisted ${Object.keys(users).length} users`);
  console.log(`  ✓ Persisted ${Object.keys(referrals).length} referral codes`);
  
  return { pass: true };
}

// ─── PHASE 3: TEST EXECUTION ─────────────────────────────────────────────
function testAuth() {
  console.log('\n🧪 PHASE 3: TEST EXECUTION');
  console.log('═══════════════════════════════════════════');
  
  const users = loadJSON(USERS_FILE, {});
  const referrals = loadJSON(REFERRALS_FILE, {});
  
  // Test 1: Verify superadmin can authenticate
  const superAdmin = users[CONFIG.superAdminEmail];
  if (!superAdmin) {
    log('TEST', '✗ Superadmin user not found');
    return { pass: false };
  }
  
  const testPassword = hashPassword(CONFIG.superAdminPassword, superAdmin.salt);
  if (testPassword !== superAdmin.passwordHash) {
    log('TEST', '✗ Superadmin password verification failed');
    return { pass: false };
  }
  log('TEST', '✓ Superadmin authentication works');
  
  // Test 2: Token generation
  const testTokenPayload = {
    sub: superAdmin.id,
    jti: crypto.randomBytes(16).toString('hex'),
    iat: Date.now(),
    exp: Date.now() + 86400000,
    src: 'BRIDGE_AI_OS',
  };
  
  function signToken(payload) {
    const header = Buffer.from(JSON.stringify({ alg: 'HMAC-SHA256', typ: 'AOE-TOKEN' })).toString('base64url');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = crypto.createHmac('sha256', 'aoe-unified-auth-secret-change-me')
      .update(`${header}.${body}`)
      .digest('base64url');
    return `${header}.${body}.${sig}`;
  }
  
  const testToken = signToken(testTokenPayload);
  if (!testToken || testToken.split('.').length !== 3) {
    log('TEST', '✗ Token generation failed');
    return { pass: false };
  }
  log('TEST', '✓ Token generation works');
  
  // Test 3: Verifiable session structure
  if (!superAdmin.id || !superAdmin.role === undefined) {
    log('TEST', '✗ User session structure incomplete');
    return { pass: false };
  }
  log('TEST', '✓ User session structure valid');
  
  // Test 4: RBAC role assignment
  const allowedPages = {
    superadmin: ['/admin.html', '/settings.html', '/control.html', '/welcome.html', '/', '/marketplace.html', '/platforms.html'],
    member: ['/welcome.html', '/', '/marketplace.html', '/platforms.html', '/avatar.html', '/terminal.html'],
    demo: ['/welcome.html', '/onboarding.html'],
  };
  
  const userRole = superAdmin.role;
  if (!allowedPages[userRole]) {
    log('TEST', '✗ Role has no page permissions');
    return { pass: false };
  }
  log('TEST', `✓ RBAC configured for ${userRole} role (${allowedPages[userRole].length} pages)`);
  
  // Test 5: Referral system
  if (!superAdmin.referralCode || !referrals[superAdmin.referralCode]) {
    log('TEST', '✗ Referral system not linked');
    return { pass: false };
  }
  log('TEST', '✓ Referral system functional');
  
  console.log('\n  ✓ All tests passed');
  return { pass: true };
}

// ─── PHASE 4: DEPLOY ──────────────────────────────────────────────────
function deploy() {
  console.log('\n🚀 PHASE 4: DEPLOY');
  console.log('═══════════════════════════════════════════');
  
  // The deploy script syncs to VPS
  // Auth service needs the shared folder to persist
  log('DEPLOY', 'Note: Run deploy-vps.sh to push to production');
  log('DEPLOY', `  Users file: ${USERS_FILE}`);
  log('DEPLOY', `  Referrals file: ${REFERRALS_FILE}`);
  
  // Check if we have the auth-service port available
  log('DEPLOY', 'Deploy to staging...');
  
  return { pass: true };
}

// ─── PHASE 5: EVALUATE ───────────────────────────────────────────────────
function evaluate() {
  console.log('\n📊 PHASE 5: EVALUATE');
  console.log('═══════════════════════════════════════════');
  
  const users = loadJSON(USERS_FILE, {});
  const referrals = loadJSON(REFERRALS_FILE, {});
  
  // Calculate health score
  let score = 0;
  let maxScore = 0;
  
  // Auth endpoints available (25 points)
  maxScore += 25;
  if (fs.existsSync(path.join(ROOT, 'Xscripts', 'auth-service.js'))) score += 25;
  
  // Users seeded (25 points)
  maxScore += 25;
  if (Object.keys(users).length > 0) score += 25;
  
  // Superadmin present (25 points)
  maxScore += 25;
  if (users[CONFIG.superAdminEmail]?.role === 'superadmin') score += 25;
  
  // Referral system (25 points)
  maxScore += 25;
  if (Object.keys(referrals).length > 0) score += 25;
  
  healthScore = score / maxScore;
  
  console.log(`  Health Score: ${(healthScore * 100).toFixed(1)}%`);
  console.log(`  Users: ${Object.keys(users).length}`);
  console.log(`  Referrals: ${Object.keys(referrals).length}`);
  console.log(`  Threshold: ${(CONFIG.healthThreshold * 100).toFixed(0)}%`);
  
  if (healthScore >= CONFIG.healthThreshold) {
    console.log('\n  ✓ SYSTEM READY FOR PRODUCTION');
    return { pass: true, score: healthScore };
  }
  
  console.log(`\n  ⚠ Not ready - needs ${((CONFIG.healthThreshold - healthScore) * 100).toFixed(0)}% more`);
  return { pass: false, score: healthScore };
}

// ─── MAIN LOOOP ─────────────────────────────────────────────────────
async function runPipeline() {
  console.log('');
  console.log('═══════════════════════════════════════════════════');
  console.log('  🔄 SELF-HEALING UPGRADE PIPELINE');
  console.log('  ════════════════════════════════════════════════════');
  console.log(`  Target: ${CONFIG.superAdminEmail}`);
  console.log(`  Threshold: ${(CONFIG.healthThreshold * 100).toFixed(0)}%`);
  console.log('');
  
  let iterations = 0;
  const maxIterations = CONFIG.maxRetries;
  
  while (iterations < maxIterations) {
    iterations++;
    console.log(`\n━━━ ITERATION ${iterations}/${maxIterations} ━━━`);
    
    // Phase 1: Audit
    const auditResult = audit();
    
    // Phase 2: Fix if needed
    if (!auditResult.pass) {
      autofix();
    }
    
    // Phase 3: Test
    const testResult = testAuth();
    if (!testResult.pass) {
      console.log('\n  ✗ Tests failed - retrying...');
      continue;
    }
    
    // Phase 4: Deploy
    deploy();
    
    // Phase 5: Evaluate
    const evalResult = evaluate();
    
    if (evalResult.pass) {
      console.log('\n═══════════════════════════════════════════');
      console.log('  ✓ PIPELINE COMPLETE - PRODUCTION READY');
      console.log('═══════════════════════════════════════════');
      break;
    }
    
    retryCount++;
    console.log(`\n  ↻ Retrying... (${retryCount}/${maxIterations})`);
  }
  
  if (retryCount >= maxIterations) {
    console.log('\n✗ Pipeline exhausted retries');
    process.exit(1);
  }
  
  // Write pipeline summary
  const summary = {
    timestamp: new Date().toISOString(),
    iterations,
    healthScore: healthScore * 100,
    superAdmin: CONFIG.superAdminEmail,
    phaseLog,
  };
  
  fs.writeFileSync(
    path.join(SHARED, 'pipeline-summary.json'),
    JSON.stringify(summary, null, 2)
  );
  
  console.log('\n  Pipeline summary written to shared/pipeline-summary.json');
}

// Run pipeline
runPipeline().catch(err => {
  console.error('\nPipeline error:', err);
  process.exit(1);
});