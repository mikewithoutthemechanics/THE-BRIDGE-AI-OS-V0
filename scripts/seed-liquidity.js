/**
 * Seed BRDG/ETH liquidity on SyncSwap (Linea mainnet)
 *
 * Usage:
 *   node scripts/seed-liquidity.js
 *
 * This will:
 *   1. Create a BRDG/ETH pool on SyncSwap Classic Pool Factory
 *   2. Approve BRDG spending on SyncSwap Router
 *   3. Add liquidity (BRDG + ETH) to the pool
 */
require('dotenv').config();
const { ethers } = require('ethers');

// ── Config ──────────────────────────────────────────────────────────────────
const BRDG_ADDRESS = '0x5f0541302bd4fC672018b07a35FA5f294A322947';
const WETH_ADDRESS = '0xe5D7C2a44FfDDf6b295A15c148167daaAf5Cf34f'; // WETH on Linea
const SYNCSWAP_ROUTER = '0x80e38291e06339d10AAB483C65695D004dBD5C69';
const CLASSIC_FACTORY = '0x37BAc764494c8db4e54BDE72f6965beA9fa0AC2d';

// How much to seed: 100,000 BRDG + 0.003 ETH (~$8) = initial price ~$0.00008/BRDG
const BRDG_AMOUNT = ethers.parseEther('100000');  // 100k BRDG (1% of supply)
const ETH_AMOUNT = ethers.parseEther('0.003');     // 0.003 ETH

// ── ABIs ────────────────────────────────────────────────────────────────────
const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
];

const ROUTER_ABI = [
  'function createPool(address _factory, bytes calldata data) external payable returns (address)',
  'function addLiquidity2(address pool, tuple(address token, uint256 amount)[] inputs, bytes data, uint256 minLiquidity, address callback, bytes callbackData) external payable returns (uint256 liquidity)',
];

const FACTORY_ABI = [
  'function getPool(address tokenA, address tokenB) view returns (address)',
];

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const key = process.env.DEPLOYER_PRIVATE_KEY;
  if (!key || key.length < 64) {
    console.error('ERROR: DEPLOYER_PRIVATE_KEY not set in .env');
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider('https://rpc.linea.build', { name: 'linea', chainId: 59144 });
  const wallet = new ethers.Wallet(key.startsWith('0x') ? key : '0x' + key, provider);

  console.log('='.repeat(60));
  console.log('BRDG/ETH Liquidity Seeding — SyncSwap on Linea');
  console.log('='.repeat(60));
  console.log('Wallet:', wallet.address);

  const ethBal = await provider.getBalance(wallet.address);
  console.log('ETH Balance:', ethers.formatEther(ethBal));

  const brdg = new ethers.Contract(BRDG_ADDRESS, ERC20_ABI, wallet);
  const brdgBal = await brdg.balanceOf(wallet.address);
  console.log('BRDG Balance:', ethers.formatEther(brdgBal));

  if (ethBal < ETH_AMOUNT + ethers.parseEther('0.001')) {
    console.error('ERROR: Not enough ETH. Need', ethers.formatEther(ETH_AMOUNT), '+ gas');
    process.exit(1);
  }
  if (brdgBal < BRDG_AMOUNT) {
    console.error('ERROR: Not enough BRDG. Need', ethers.formatEther(BRDG_AMOUNT));
    process.exit(1);
  }

  const router = new ethers.Contract(SYNCSWAP_ROUTER, ROUTER_ABI, wallet);
  const factory = new ethers.Contract(CLASSIC_FACTORY, FACTORY_ABI, provider);

  // Step 1: Check if pool exists, create if not
  console.log('\n[1/3] Checking for existing BRDG/ETH pool...');
  let poolAddress = await factory.getPool(BRDG_ADDRESS, WETH_ADDRESS);

  if (poolAddress === ethers.ZeroAddress) {
    console.log('  No pool found. Creating BRDG/ETH classic pool...');
    // Factory.createPool data: abi.encode(address, address) for token0, token1
    const createData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['address', 'address'],
      [BRDG_ADDRESS, WETH_ADDRESS]
    );
    const createTx = await router.createPool(CLASSIC_FACTORY, createData);
    const receipt = await createTx.wait();
    console.log('  Pool creation tx:', receipt.hash);

    poolAddress = await factory.getPool(BRDG_ADDRESS, WETH_ADDRESS);
    console.log('  Pool created at:', poolAddress);
  } else {
    console.log('  Pool already exists at:', poolAddress);
  }

  // Step 2: Approve BRDG on router
  console.log('\n[2/3] Approving BRDG on SyncSwap Router...');
  const allowance = await brdg.allowance(wallet.address, SYNCSWAP_ROUTER);
  if (allowance < BRDG_AMOUNT) {
    const approveTx = await brdg.approve(SYNCSWAP_ROUTER, BRDG_AMOUNT);
    await approveTx.wait();
    console.log('  Approved:', approveTx.hash);
  } else {
    console.log('  Already approved.');
  }

  // Step 3: Add liquidity
  console.log('\n[3/3] Adding liquidity...');
  console.log('  BRDG:', ethers.formatEther(BRDG_AMOUNT));
  console.log('  ETH:', ethers.formatEther(ETH_AMOUNT));

  // TokenInput array: BRDG + native ETH (address(0))
  const inputs = [
    { token: BRDG_ADDRESS, amount: BRDG_AMOUNT },
    { token: ethers.ZeroAddress, amount: ETH_AMOUNT }, // native ETH
  ];

  // data = abi.encode(address) — the recipient of LP tokens
  const addData = ethers.AbiCoder.defaultAbiCoder().encode(['address'], [wallet.address]);

  // Calculate 95% of expected LP tokens as minimum to prevent sandwich attacks
  const minLiquidity = BRDG_AMOUNT * 95n / 100n; // 95% floor

  const addTx = await router.addLiquidity2(
    poolAddress,
    inputs,
    addData,
    minLiquidity,         // minLiquidity (95% floor to prevent sandwich attacks)
    ethers.ZeroAddress,   // no callback
    '0x',                 // no callbackData
    { value: ETH_AMOUNT } // send ETH with tx
  );
  const addReceipt = await addTx.wait();

  console.log('\n' + '='.repeat(60));
  console.log('LIQUIDITY ADDED SUCCESSFULLY');
  console.log('='.repeat(60));
  console.log('Pool:', poolAddress);
  console.log('TX:', addReceipt.hash);
  console.log('BRDG deposited:', ethers.formatEther(BRDG_AMOUNT));
  console.log('ETH deposited:', ethers.formatEther(ETH_AMOUNT));
  console.log('LP tokens sent to:', wallet.address);
  console.log('\nView pool: https://syncswap.xyz/pool/' + poolAddress);
  console.log('View on Lineascan: https://lineascan.build/tx/' + addReceipt.hash);
}

main().catch(err => {
  console.error('FAILED:', err.message);
  if (err.data) console.error('Revert data:', err.data);
  process.exit(1);
});
