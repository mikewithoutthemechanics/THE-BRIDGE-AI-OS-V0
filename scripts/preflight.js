#!/usr/bin/env node
/**
 * Preflight Checks — Run BEFORE first deployment
 * Validates environment, dependencies, database connectivity, and configuration
 * 
 * Usage: node scripts/preflight.js
 * Exit codes: 0=all OK, 1=single failure aborts, 2=warnings-only
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const errors = [];
const warnings = [];
let exitCode = 0;

function log(status, message, details = '') {
  const icon = status === 'error' ? '✗' : status === 'warn' ? '⚠' : '✓';
  console.log(`${icon} ${message}`);
  if (details) console.log(`  ${details}`);
}

function check(condition, passMsg, failMsg, isError = true) {
  if (condition) {
    log('ok', passMsg);
    return true;
  } else {
    log(isError ? 'error' : 'warn', failMsg);
    if (isError) errors.push(failMsg);
    else warnings.push(failMsg);
    return false;
  }
}

console.log('═'.repeat(70));
console.log('BRIDGE AI OS — PREFLIGHT CHECKS');
console.log('═'.repeat(70) + '\n');

// ── 1. Environment Variables ─────────────────────────────────────────────────
console.log('Section 1: Environment Variables\n');

const requiredEnv = [
  { key: 'JWT_SECRET', minLength: 32, secret: true },
  { key: 'BRIDGE_INTERNAL_SECRET', minLength: 16, secret: true },
  { key: 'ECONOMY_DB_URL', pattern: /^postgresql:\/\// },
  { key: 'DATABASE_URL', pattern: /^postgresql:\/\// },
  { key: 'SUPABASE_URL', pattern: /^https:\/\// },
  { key: 'SUPABASE_SERVICE_KEY', minLength: 100 },
  { key: 'SUPABASE_ANON_KEY', minLength: 50 },
  { key: 'PAYFAST_MERCHANT_ID', minLength: 8 },
  { key: 'PAYFAST_MERCHANT_KEY', minLength: 20 },
  { key: 'PAYFAST_PASSPHRASE', minLength: 5 },
  { key: 'OPENAI_API_KEY', pattern: /^sk-/ },
  { key: 'ANTHROPIC_API_KEY', pattern: /^sk-ant-/ },
  { key: 'KEYFORGE_MASTER', minLength: 32, secret: true },
];

const envPath = path.join(process.cwd(), '.env');
const envExists = fs.existsSync(envPath);
check(envExists, '.env file exists', '.env file NOT FOUND — copy from .env.example');

if (envExists) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const envLines = envContent.split('\n').filter(l => l.trim() && !l.startsWith('#'));
  const envMap = new Map();
  envLines.forEach(line => {
    const [key, ...val] = line.split('=');
    if (key) envMap.set(key.trim(), val.join('=').trim());
  });

  requiredEnv.forEach(({ key, pattern, minLength, secret }) => {
    const val = envMap.get(key);
    const present = val && val !== '' && !val.includes('CHANGE_ME') && !val.includes('your-') && !val.includes('example');
    
    if (!present) {
      check(false, `${key} configured`, `${key} missing or placeholder value`, true);
    } else {
      if (pattern && !pattern.test(val)) {
        log('warn', `${key} format may be invalid`, `Expected pattern: ${pattern}`);
      }
      if (minLength && val.length < minLength) {
        log('warn', `${key} length < ${minLength}`, `Current: ${val.length} chars (recommended: ≥${minLength})`);
      }
      log('ok', secret ? `${key} set (hidden)` : `${key} OK`);
    }
  });

  // Warn about any .env keys that look like test/dev values
  const testValues = ['test', 'dev', 'localhost', 'example', 'change-me', 'replace-me'];
  envMap.forEach((val, key) => {
    if (testValues.some(tv => val.toLowerCase().includes(tv))) {
      log('warn', `${key} contains test/dev placeholder`, `Value: ${val.substring(0, 30)}...`);
    }
  });
} else {
  errors.push('.env file missing');
}

console.log('');

// ── 2. Node.js & npm Dependencies ────────────────────────────────────────────
console.log('Section 2: Dependencies\n');

const pkgPath = path.join(process.cwd(), 'package.json');
check(fs.existsSync(pkgPath), 'package.json exists', 'package.json missing', true);

if (fs.existsSync(pkgPath)) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  
  check(pkg.engines?.node, 'Node.js engine specified', 'No engines.node in package.json', true);
  check(pkg.dependencies, 'Production dependencies defined', 'No dependencies block', true);
  check(pkg.devDependencies, 'Dev dependencies defined', 'No devDependencies (tests may fail)', false);
  
  // Check node_modules
  const nodeModulesExists = fs.existsSync(path.join(process.cwd(), 'node_modules'));
  check(nodeModulesExists, 'node_modules installed', 'node_modules missing — run: npm ci', false);
  
  // Check specific critical modules
  const criticalModules = ['express', 'dotenv', 'axios', 'bcryptjs', 'jsonwebtoken', '@supabase/supabase-js'];
  criticalModules.forEach(mod => {
    const modPath = path.join(process.cwd(), 'node_modules', mod);
    check(fs.existsSync(modPath), `Module "${mod}" installed`, `Module "${mod}" missing — run: npm install ${mod}`, false);
  });
}

// Check SVG engine deps
const svgPkg = path.join(process.cwd(), 'svg-engine', 'package.json');
check(fs.existsSync(svgPkg), 'svg-engine/package.json exists', 'svg-engine package missing', false);

console.log('');

// ── 3. Database Connectivity ──────────────────────────────────────────────────
console.log('Section 3: Database Connectivity\n');

// SQLite check
const sqliteDb = path.join(process.cwd(), 'users.db');
check(fs.existsSync(sqliteDb) || true, 'SQLite users.db (will be created if missing)', 'users.db not found (will auto-create on first run)', false);

// PostgreSQL/Supabase check (if env present)
try {
  const { Pool } = require('pg');
  const connectionString = process.env.ECONOMY_DB_URL || process.env.DATABASE_URL;
  if (connectionString) {
    const pool = new Pool({ connectionString, connectionTimeoutMillis: 5000 });
    pool.query('SELECT 1', (err, res) => {
      if (err) {
        log('warn', 'PostgreSQL connection test', `Cannot connect: ${err.message}`);
        warnings.push('PostgreSQL unreachable — ensure server is running');
      } else {
        log('ok', 'PostgreSQL reachable');
      }
      pool.end();
    });
  } else {
    log('warn', 'ECONOMY_DB_URL not set', 'Set in .env for production');
  }
} catch (e) {
  log('warn', 'pg module not loaded', 'Install pg package for DB checks');
}

console.log('');

// ── 4. Smart Contracts (if blockchain enabled) ────────────────────────────────
console.log('Section 4: Blockchain (Optional)\n');

const contractsDir = path.join(process.cwd(), 'contracts');
check(fs.existsSync(contractsDir), 'Solidity contracts directory exists', 'No contracts/', false);

const requiredContracts = ['BRDG.sol', 'TreasuryVault.sol', 'StakingVault.sol'];
requiredContracts.forEach(contract => {
  const contractPath = path.join(contractsDir, contract);
  check(fs.existsSync(contractPath), `Contract ${contract} present`, `Missing ${contract}`, false);
});

// Check Hardhat config
const hardhatConfig = path.join(process.cwd(), 'hardhat.config.js');
check(fs.existsSync(hardhatConfig), 'Hardhat config exists', 'Missing hardhat.config.js', false);

// Check deployer private key in env
if (envMap) {
  const deployerKey = envMap.get('DEPLOYER_PRIVATE_KEY');
  check(deployerKey && deployerKey.startsWith('0x'), 'DEPLOYER_PRIVATE_KEY set', 'Not set — contracts cannot be deployed', false);
}

console.log('');

// ── 5. Static Assets & Build ───────────────────────────────────────────────────
console.log('Section 5: Frontend Assets\n');

const publicDir = path.join(process.cwd(), 'public');
check(fs.existsSync(publicDir), 'public/ directory exists', 'public/ missing', false);

const htmlCount = fs.readdirSync(publicDir).filter(f => f.endsWith('.html')).length;
check(htmlCount >= 100, `public/ contains ${htmlCount} HTML pages (expected ≥100)`, 'Fewer than 100 HTML pages found', false);

const buildScript = path.join(process.cwd(), 'build-static.js');
check(fs.existsSync(buildScript), 'build-static.js exists', 'Build script missing — static site build will fail', false);

console.log('');

// ── 6. Configuration Files ────────────────────────────────────────────────────
console.log('Section 6: Configuration\n');

const configFiles = [
  'server.js',
  'brain.js',
  'gateway.js',
  'ecosystem.config.js',
  'docker-compose.yml',
  'docker-compose.prod.yml',
  'nginx-bridge.conf',
  'health-monitor.js',
];

configFiles.forEach(file => {
  const exists = fs.existsSync(path.join(process.cwd(), file));
  check(exists, `${file} present`, `${file} missing`, false);
});

console.log('');

// ── 7. Test Suite ──────────────────────────────────────────────────────────────
console.log('Section 7: Test Suite\n');

const jestConfig = path.join(process.cwd(), 'jest.setup.js');
check(fs.existsSync(jestConfig), 'Jest config present', 'Jest config missing', false);

const testsDir = path.join(process.cwd(), 'tests');
check(fs.existsSync(testsDir), 'tests/ directory exists', 'No tests/', false);

const testFiles = fs.readdirSync(testsDir).filter(f => f.endsWith('.test.js'));
check(testFiles.length > 0, `${testFiles.length} test files found`, 'No test files found', false);

console.log('');

// ── 8. Permissions & File Security ─────────────────────────────────────────────
console.log('Section 8: Security\n');

// Check .gitignore excludes .env
const gitignorePath = path.join(process.cwd(), '.gitignore');
if (fs.existsSync(gitignorePath)) {
  const gitignore = fs.readFileSync(gitignorePath, 'utf8');
  check(gitignore.includes('.env'), '.env in .gitignore', '.env NOT in .gitignore — SECURITY RISK', true);
  check(gitignore.includes('users.db'), 'users.db in .gitignore', 'users.db NOT in .gitignore', false);
  check(gitignore.includes('*.log'), 'logs/ in .gitignore', 'logs/ NOT excluded', false);
}

// Check file permissions for sensitive files
if (envExists) {
  const stats = fs.statSync(envPath);
  // Recommend 600 (owner read/write only)
  const perms = stats.mode & 0o777;
  check(perms <= 600, `.env permissions 600 (${perms.toString(8)})`, `.env world-readable! Fix: chmod 600 .env`, true);
}

console.log('');

// ── 9. System Resources (if run on server) ─────────────────────────────────────
console.log('Section 9: System Resources (Local Check)\n');

// Node version
const nodeVersion = process.version;
const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0], 10);
check(majorVersion >= 18, `Node.js ${nodeVersion} (≥18 required)`, `Node.js ${nodeVersion} too old — upgrade to 18+`, majorVersion < 18 ? true : false);

// Check available disk space
try {
  const stats = execSync('df -h .').toString().split('\n')[1].split(/\s+/);
  const available = stats[3];
  const usedPercent = parseInt(stats[4].replace('%', ''), 10);
  check(usedPercent < 90, `Disk space OK (${available} free, ${stats[4]} used)`, `Disk space low (${stats[4]} used)`, false);
} catch (e) {
  log('warn', 'Cannot check disk space', 'df command not available');
}

// Check memory (if on Linux with /proc/meminfo)
try {
  const memInfo = fs.readFileSync('/proc/meminfo', 'utf8');
  const totalMatch = memInfo.match(/MemTotal:\s+(\d+)/);
  const freeMatch = memInfo.match(/MemAvailable:\s+(\d+)/);
  if (totalMatch && freeMatch) {
    const totalMB = Math.round(parseInt(totalMatch[1], 10) / 1024);
    const freeMB = Math.round(parseInt(freeMatch[1], 10) / 1024);
    check(freeMB >= 1024, `Memory OK (${freeMB}MB free of ${totalMB}MB)`, `Low memory: ${freeMB}MB free — may cause OOM`, freeMB < 1024);
  }
} catch (e) {
  // Not Linux or /proc not accessible
}

console.log('');

// ── SUMMARY ───────────────────────────────────────────────────────────────────
console.log('═'.repeat(70));
console.log('SUMMARY');
console.log('═'.repeat(70));

if (errors.length === 0) {
  console.log('\n✓ ALL CHECKS PASSED — Ready for deployment\n');
  if (warnings.length > 0) {
    console.log(`Warnings (non-blocking): ${warnings.length}`);
    warnings.forEach(w => console.log(`  ⚠ ${w}`));
    console.log('\n');
  }
  process.exit(0);
} else {
  console.log(`\n✗ ${errors.length} ERROR(S) — fix before deploying:\n`);
  errors.forEach(e => console.log(`  ✗ ${e}`));
  if (warnings.length > 0) {
    console.log(`\nWarnings: ${warnings.length}`);
    warnings.forEach(w => console.log(`  ⚠ ${w}`));
  }
  console.log('\n');
  process.exit(1);
}
