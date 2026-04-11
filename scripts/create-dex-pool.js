/**
 * Create BRDG/ETH Liquidity Pool on SyncSwap (Linea)
 *
 * Usage:
 *   node scripts/create-dex-pool.js
 *
 * Prerequisites:
 *   - Deployer wallet must hold BRDG tokens and ETH
 *   - BRDG contract must be deployed (reads from deployment.json)
 *
 * This script:
 *   1. Creates a Classic Pool on SyncSwap if it doesn't exist
 *   2. Approves BRDG for the SyncSwap Router
 *   3. Adds initial liquidity (configurable amounts)
 */
'use strict';

require('dotenv').config();
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

// ── Configuration ────────────────────────────────────────────────────────────
const RPC_URL = process.env.BRIDGE_SIWE_RPC_URL || 'https://rpc.linea.build';
const DEPLOYMENT = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'deployment.json'), 'utf8'));
const BRDG_ADDRESS = DEPLOYMENT.contracts.BRDG;

const WETH_ADDRESS = '0xe5D7C2a44FfDDf6b295A15c148167daaAf5Cf34f'; // WETH on Linea

// SyncSwap addresses on Linea mainnet
const SYNCSWAP_ROUTER = '0x80e38291e06339d10AAB483C65695D004dBD5C69';
const SYNCSWAP_FACTORY = '0x37BAc764494c8db4e54BDE72f6965beA9fa0AC2d';

// Initial liquidity: 10,000 BRDG + 0.0005 ETH (conservative seed — $1.80 worth)
// This sets initial price: 1 BRDG = 0.00000005 ETH ≈ $0.00018 at $3600/ETH
// Adjust these amounts based on desired initial price
const BRDG_AMOUNT = ethers.parseEther('10000');  // 10,000 BRDG
const ETH_AMOUNT = ethers.parseEther('0.0005');   // 0.0005 ETH

// ── ABIs ─────────────────────────────────────────────────────────────────────
const FACTORY_ABI = [
  'function getPool(address, address) view returns (address)',
  'function createPool(bytes) returns (address)',
];

const ROUTER_ABI = [
  'function addLiquidity2(address pool, tuple(address token, uint256 amount)[] inputs, bytes data, uint256 minLiquidity, address callback, bytes callbackData) payable returns (uint256)',
];

const ERC20_ABI = [
  'function approve(address, uint256) returns (bool)',
  'function allowance(address, address) view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
];

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('═══════════════��═══════════════════════════════════════');
  console.log('BRDG/ETH DEX Pool Creation — SyncSwap on Linea');
  console.log('═══════════════════════════════════════════════════════\n');

  // Connect wallet
  const key = process.env.DEPLOYER_PRIVATE_KEY.startsWith('0x')
    ? process.env.DEPLOYER_PRIVATE_KEY
    : '0x' + process.env.DEPLOYER_PRIVATE_KEY;
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(key, provider);

  console.log(`Wallet: ${wallet.address}`);
  const ethBal = await provider.getBalance(wallet.address);
  console.log(`ETH balance: ${ethers.formatEther(ethBal)}`);

  const brdg = new ethers.Contract(BRDG_ADDRESS, ERC20_ABI, wallet);
  const brdgBal = await brdg.balanceOf(wallet.address);
  console.log(`BRDG balance: ${ethers.formatEther(brdgBal)}`);

  // Check sufficient balances
  if (ethBal < ETH_AMOUNT) {
    console.error(`\nInsufficient ETH. Need ${ethers.formatEther(ETH_AMOUNT)}, have ${ethers.formatEther(ethBal)}`);
    process.exit(1);
  }
  if (brdgBal < BRDG_AMOUNT) {
    console.error(`\nInsufficient BRDG. Need ${ethers.formatEther(BRDG_AMOUNT)}, have ${ethers.formatEther(brdgBal)}`);
    process.exit(1);
  }

  // Step 1: Check if pool exists
  console.log('\nStep 1: Checking for existing pool...');
  const factory = new ethers.Contract(SYNCSWAP_FACTORY, FACTORY_ABI, wallet);
  let poolAddr = await factory.getPool(BRDG_ADDRESS, WETH_ADDRESS);

  if (poolAddr === ethers.ZeroAddress) {
    console.log('  No pool found. Creating...');
    // Encode pool creation data: abi.encode(address, address)
    const createData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['address', 'address'],
      [BRDG_ADDRESS, WETH_ADDRESS]
    );
    const createTx = await factory.createPool(createData);
    await createTx.wait();
    poolAddr = await factory.getPool(BRDG_ADDRESS, WETH_ADDRESS);
    console.log(`  Pool created: ${poolAddr}`);
  } else {
    console.log(`  Pool exists: ${poolAddr}`);
  }

  // Step 2: Approve BRDG for router
  console.log('\nStep 2: Approving BRDG for SyncSwap Router...');
  const allowance = await brdg.allowance(wallet.address, SYNCSWAP_ROUTER);
  if (allowance < BRDG_AMOUNT) {
    const approveTx = await brdg.approve(SYNCSWAP_ROUTER, ethers.MaxUint256);
    await approveTx.wait();
    console.log('  Approved');
  } else {
    console.log('  Already approved');
  }

  // Step 3: Add liquidity
  console.log('\nStep 3: Adding initial liquidity...');
  console.log(`  BRDG: ${ethers.formatEther(BRDG_AMOUNT)}`);
  console.log(`  ETH:  ${ethers.formatEther(ETH_AMOUNT)}`);

  const router = new ethers.Contract(SYNCSWAP_ROUTER, ROUTER_ABI, wallet);

  // SyncSwap addLiquidity2 inputs
  const inputs = [
    { token: BRDG_ADDRESS, amount: BRDG_AMOUNT },
    { token: ethers.ZeroAddress, amount: ETH_AMOUNT }, // ETH as native
  ];

  // Callback data: abi.encode(address) — receiver of LP tokens
  const callbackData = ethers.AbiCoder.defaultAbiCoder().encode(['address'], [wallet.address]);

  const addTx = await router.addLiquidity2(
    poolAddr,
    inputs,
    '0x', // data
    0n,   // minLiquidity (0 for initial add)
    ethers.ZeroAddress, // no callback
    callbackData,
    { value: ETH_AMOUNT }
  );
  const receipt = await addTx.wait();
  console.log(`  Liquidity added! tx: ${receipt.hash}`);

  // Step 4: Verify
  console.log('\nStep 4: Verifying pool state...');
  const impliedPrice = Number(ethers.formatEther(ETH_AMOUNT)) / Number(ethers.formatEther(BRDG_AMOUNT));
  console.log(`  Pool: ${poolAddr}`);
  console.log(`  Initial price: 1 BRDG = ${impliedPrice.toFixed(8)} ETH`);
  console.log(`  At $3600/ETH: 1 BRDG ≈ $${(impliedPrice * 3600).toFixed(4)}`);

  // Save pool address
  DEPLOYMENT.contracts.DEXPool = poolAddr;
  DEPLOYMENT.dexConfig = {
    dex: 'SyncSwap',
    pool: poolAddr,
    initialBrdg: ethers.formatEther(BRDG_AMOUNT),
    initialEth: ethers.formatEther(ETH_AMOUNT),
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(
    path.join(__dirname, '..', 'data', 'deployment.json'),
    JSON.stringify(DEPLOYMENT, null, 2)
  );
  console.log('  deployment.json updated with pool address');

  console.log('\n═════════════���═══════════════════════════��═════════════');
  console.log('POOL CREATION COMPLETE');
  console.log('════════════════════════════════════════════════════��══');
  console.log(`\nNext: curl https://your-domain/api/brdg/price to verify oracle`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Pool creation failed:', error.message);
    process.exit(1);
  });
