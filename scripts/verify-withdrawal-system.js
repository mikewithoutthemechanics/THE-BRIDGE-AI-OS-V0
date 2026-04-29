#!/usr/bin/env node
/**
 * Verify Withdrawal System Setup
 * 
 * Run: node scripts/verify-withdrawal-system.js
 * 
 * Checks:
 *   1. All required npm packages (ethers)
 *   2. Environment variables (TREASURY_PRIVATE_KEY, BRDG_CONTRACT_ADDRESS, etc.)
 *   3. Database tables exist
 *   4. Treasury modules load correctly
 *   5. On-chain connectivity (Linea RPC)
 */

'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const checks = {
  npm: [],
  env: [],
  modules: [],
  db: [],
  chain: [],
  errors: []
};

async function runChecks() {
  console.log('WITHDRAWAL SYSTEM VERIFICATION\n');
  console.log('=' .repeat(50));

  // 1. Check npm packages
  console.log('\n[1/5] Checking npm packages...\n');
  
  const requiredPackages = [
    { name: 'ethers', module: 'ethers' },
    { name: '@supabase/supabase-js', module: '@supabase/supabase-js' }
  ];

  for (const pkg of requiredPackages) {
    try {
      require(pkg.module);
      checks.npm.push({ name: pkg.name, status: 'OK', message: 'Installed' });
      console.log(`  ✓ ${pkg.name}`);
    } catch (e) {
      checks.npm.push({ name: pkg.name, status: 'FAIL', message: e.message });
      checks.errors.push(`npm:${pkg.name}`);
      console.log(`  ✗ ${pkg.name}: ${e.message}`);
    }
  }

  // 2. Check environment variables
  console.log('\n[2/5] Checking environment variables...\n');
  
  const requiredEnv = [
    { key: 'SUPABASE_URL', description: 'Supabase project URL' },
    { key: 'SUPABASE_SERVICE_KEY', description: 'Supabase service role key', alt: 'SUPABASE_ADMIN_KEY' },
    { key: 'TREASURY_PRIVATE_KEY', description: 'Treasury wallet private key', alt: 'DEPLOYER_PRIVATE_KEY' },
    { key: 'JWT_SECRET', description: 'JWT signing secret' }
  ];

  const optionalEnv = [
    { key: 'BRDG_CONTRACT_ADDRESS', description: 'BRDG token contract (default: 0x6Ee9Fb40b97139EEEc406c096393e0b53C89975f)' },
    { key: 'BRIDGE_SIWE_RPC_URL', description: 'Linea RPC URL (default: https://rpc.linea.build)' },
    { key: 'BRIDGE_SIWE_CHAIN_ID', description: 'Linea Chain ID (default: 59144)' }
  ];

  for (const env of requiredEnv) {
    const value = process.env[env.key] || (env.alt && process.env[env.alt]);
    if (value) {
      const masked = env.key.includes('KEY') || env.key.includes('SECRET') 
        ? `${value.slice(0, 6)}...${value.slice(-4)}` 
        : value;
      checks.env.push({ key: env.key, status: 'OK', value: masked });
      console.log(`  ✓ ${env.key}: ${masked}`);
    } else {
      checks.env.push({ key: env.key, status: 'MISSING', description: env.description });
      checks.errors.push(`env:${env.key}`);
      console.log(`  ✗ ${env.key}: MISSING (${env.description})`);
    }
  }

  for (const env of optionalEnv) {
    const value = process.env[env.key];
    if (value) {
      checks.env.push({ key: env.key, status: 'OK', value });
      console.log(`  ○ ${env.key}: ${value} (optional)`);
    } else {
      checks.env.push({ key: env.key, status: 'DEFAULT', description: env.description });
      console.log(`  ○ ${env.key}: Using default (${env.description})`);
    }
  }

  // 3. Check module loading
  console.log('\n[3/5] Checking treasury modules...\n');

  const modulesToCheck = [
    { name: 'lib/treasury', path: '../lib/treasury' },
    { name: 'lib/eth-treasury', path: '../lib/eth-treasury' },
    { name: 'lib/brdg-chain', path: '../lib/brdg-chain' },
    { name: 'lib/brdg-swap', path: '../lib/brdg-swap' },
    { name: 'lib/withdrawal-routes', path: '../lib/withdrawal-routes' },
    { name: 'lib/claim-routes', path: '../lib/claim-routes' },
    { name: 'lib/treasury-withdraw', path: '../lib/treasury-withdraw' }
  ];

  for (const mod of modulesToCheck) {
    try {
      const loaded = require(mod.path);
      const exports = Object.keys(loaded).slice(0, 3).join(', ') + (Object.keys(loaded).length > 3 ? '...' : '');
      checks.modules.push({ name: mod.name, status: 'OK', exports });
      console.log(`  ✓ ${mod.name}: ${exports || 'loaded'}`);
    } catch (e) {
      checks.modules.push({ name: mod.name, status: 'FAIL', error: e.message });
      checks.errors.push(`module:${mod.name}`);
      console.log(`  ✗ ${mod.name}: ${e.message}`);
    }
  }

  // 4. Check database tables
  console.log('\n[4/5] Checking database tables...\n');

  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

    const tables = [
      'withdrawal_requests',
      'agent_claims',
      'fiat_payouts',
      'withdrawal_claims',
      'admin_withdrawals'
    ];

    for (const table of tables) {
      try {
        const { error } = await supabase.from(table).select('*', { head: true, count: 'exact' });
        if (error && error.code === '42P01') {
          checks.db.push({ table, status: 'MISSING' });
          checks.errors.push(`db:${table}`);
          console.log(`  ✗ ${table}: Table does not exist`);
        } else if (error) {
          checks.db.push({ table, status: 'ERROR', message: error.message });
          checks.errors.push(`db:${table}`);
          console.log(`  ✗ ${table}: ${error.message}`);
        } else {
          checks.db.push({ table, status: 'OK' });
          console.log(`  ✓ ${table}: Accessible`);
        }
      } catch (e) {
        checks.db.push({ table, status: 'ERROR', message: e.message });
        checks.errors.push(`db:${table}`);
        console.log(`  ✗ ${table}: ${e.message}`);
      }
    }

    // Check users.wallet_address
    try {
      const { error } = await supabase.from('users').select('wallet_address').limit(1);
      if (error && error.message.includes('wallet_address')) {
        checks.db.push({ table: 'users.wallet_address', status: 'MISSING' });
        checks.errors.push('db:users.wallet_address');
        console.log(`  ✗ users.wallet_address: Column missing`);
      } else {
        checks.db.push({ table: 'users.wallet_address', status: 'OK' });
        console.log(`  ✓ users.wallet_address: Exists`);
      }
    } catch (e) {
      console.log(`  ○ users.wallet_address: Could not verify (${e.message})`);
    }
  } else {
    console.log('  ! Skipping (Supabase not configured)');
    checks.db.push({ status: 'SKIPPED', reason: 'Supabase not configured' });
  }

  // 5. Check on-chain connectivity
  console.log('\n[5/5] Checking on-chain connectivity...\n');

  try {
    const { getProvider } = require('../lib/treasury');
    const provider = getProvider();
    
    console.log('  → Testing Linea RPC connection...');
    const blockNumber = await provider.getBlockNumber();
    checks.chain.push({ check: 'linea_rpc', status: 'OK', blockNumber });
    console.log(`  ✓ Linea RPC: Connected (block ${blockNumber})`);

    // Check treasury wallet
    console.log('  → Checking treasury wallet...');
    const { getAddress, getBalance } = require('../lib/eth-treasury');
    const address = getAddress();
    const balance = await getBalance();
    checks.chain.push({ check: 'treasury_wallet', status: 'OK', address, balance: balance.eth });
    console.log(`  ✓ Treasury wallet: ${address}`);
    console.log(`    Balance: ${balance.eth} ETH`);

    // Check BRDG contract
    console.log('  → Checking BRDG contract...');
    const { getTokenStats } = require('../lib/brdg-chain');
    const stats = await getTokenStats();
    checks.chain.push({ 
      check: 'brdg_contract', 
      status: 'OK', 
      address: stats.token.address,
      totalSupply: stats.token.totalSupply
    });
    console.log(`  ✓ BRDG contract: ${stats.token.address}`);
    console.log(`    Total supply: ${stats.token.totalSupply}`);

  } catch (e) {
    checks.chain.push({ check: 'on_chain', status: 'FAIL', error: e.message });
    checks.errors.push('chain:connectivity');
    console.log(`  ✗ On-chain check failed: ${e.message}`);
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('SUMMARY');
  console.log('='.repeat(50));
  
  const totalErrors = checks.errors.length;
  
  if (totalErrors === 0) {
    console.log('\n✓ All checks passed! Withdrawal system is ready.\n');
    console.log('Enabled routes:');
    console.log('  • POST /api/user/withdraw/brdg - User BRDG withdrawals');
    console.log('  • POST /api/agent/claim - Agent earnings claims');
    console.log('  • POST /api/user/swap/brdg-to-eth - BRDG to ETH swaps');
    console.log('  • POST /api/admin/swap/execute - Admin swaps');
    console.log('\nDaily limits: 10,000 BRDG per user');
    console.log('Cooldown: 10 minutes between withdrawals\n');
  } else {
    console.log(`\n✗ ${totalErrors} issue(s) found:\n`);
    checks.errors.forEach(err => {
      const [category, item] = err.split(':');
      console.log(`  [${category.toUpperCase()}] ${item}`);
    });
    
    console.log('\n[REQUIRED ACTIONS]');
    
    if (checks.errors.some(e => e.startsWith('env:'))) {
      console.log('\n1. Set missing environment variables in .env:');
      checks.env
        .filter(e => e.status === 'MISSING')
        .forEach(e => console.log(`   ${e.key}=your_${e.key.toLowerCase()}_here`));
    }
    
    if (checks.errors.some(e => e.startsWith('db:'))) {
      console.log('\n2. Run database migration:');
      console.log('   node migrations/apply-withdrawal-system.js');
      console.log('\n   Or manually run SQL in Supabase dashboard:');
      console.log('   migrations/013_withdrawal_system.sql');
    }
    
    if (checks.errors.some(e => e.startsWith('chain:'))) {
      console.log('\n3. Check Linea RPC and treasury wallet configuration');
    }
    
    console.log('');
    process.exit(1);
  }
}

runChecks().catch(err => {
  console.error('\n[FATAL ERROR]', err.message);
  process.exit(1);
});
