/**
 * BRDG → ETH Swap Module — SyncSwap Integration (Linea mainnet)
 * 
 * Executes BRDG to ETH swaps via SyncSwap DEX for withdrawal conversions.
 * 
 * Usage:
 *   const { swapBRDGtoETH, getSwapQuote } = require('./lib/brdg-swap');
 *   const result = await swapBRDGtoETH('1000', '0xUserAddress...');
 */
'use strict';

const { ethers } = require('ethers');

// ── SyncSwap Constants (Linea mainnet) ───────────────────────────────────────
const SYNCSWAP_ROUTER = '0x80e38291e06339d10AAB483C65695D004dBD5C69';
const CLASSIC_FACTORY = '0x37BAc764494c8db4e54BDE72f6965beA9fa0AC2d';
const WETH_ADDRESS = '0xe5D7C2a44FfDDf6b295A15c148167daaAf5Cf34f';
const BRDG_ADDRESS = process.env.BRDG_CONTRACT_ADDRESS || '0x6Ee9Fb40b97139EEEc406c096393e0b53C89975f';
const LINEA_RPC = process.env.BRIDGE_SIWE_RPC_URL || 'https://rpc.linea.build';
const CHAIN_ID = 59144;

// ── ABIs ───────────────────────────────────────────────────────────────────
const ROUTER_ABI = [
  'function swap(tuple(address tokenIn, address tokenOut, bool stable, address to) route, uint256 amountIn, uint256 amountOutMin, address to, uint256 deadline) external payable returns (uint256 amountOut)',
  'function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory amounts)',
  'function poolOf(address factory, address tokenA, address tokenB, bool stable) external view returns (address)',
];

const FACTORY_ABI = [
  'function getPool(address tokenA, address tokenB) external view returns (address)',
  'function getReserves(address tokenA, address tokenB) external view returns (uint256 reserveA, uint256 reserveB)',
];

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
];

// ── Provider & Signer ────────────────────────────────────────────────────────
function getProvider() {
  return require('./treasury').getProvider();
}

function getSigner() {
  const { getWallet } = require('./eth-treasury');
  return getWallet();
}

// ── Core Swap Functions ────────────────────────────────────────────────────

/**
 * Get a quote for swapping BRDG to ETH
 * @param {string} brdgAmount - Amount of BRDG to swap (e.g., "1000")
 * @returns {Promise<{brdgIn: string, ethOut: string, price: string, slippageBps: number}>}
 */
async function getSwapQuote(brdgAmount) {
  const provider = getProvider();
  const router = new ethers.Contract(SYNCSWAP_ROUTER, ROUTER_ABI, provider);
  
  const amountIn = ethers.parseEther(brdgAmount);
  
  // Try to get amounts out via router
  let amounts;
  try {
    amounts = await router.getAmountsOut(amountIn, [BRDG_ADDRESS, WETH_ADDRESS]);
  } catch (e) {
    // Fallback: calculate from pool reserves
    const factory = new ethers.Contract(CLASSIC_FACTORY, FACTORY_ABI, provider);
    const pool = await factory.getPool(BRDG_ADDRESS, WETH_ADDRESS);
    
    if (pool === ethers.ZeroAddress) {
      throw new Error('BRDG/ETH pool does not exist on SyncSwap');
    }
    
    const brdg = new ethers.Contract(BRDG_ADDRESS, ERC20_ABI, provider);
    const weth = new ethers.Contract(WETH_ADDRESS, ERC20_ABI, provider);
    
    const brdgReserve = await brdg.balanceOf(pool);
    const ethReserve = await weth.balanceOf(pool);
    
    // Constant product formula: x * y = k
    // amountOut = (amountIn * reserveOut) / (reserveIn + amountIn)
    const amountOut = (amountIn * ethReserve) / (brdgReserve + amountIn);
    amounts = [amountIn, amountOut];
  }
  
  const ethOut = ethers.formatEther(amounts[1]);
  const price = parseFloat(ethOut) / parseFloat(brdgAmount);
  
  return {
    brdgIn: brdgAmount,
    ethOut: ethOut,
    price: price.toFixed(10),
    slippageBps: 50, // 0.5% default
    route: [BRDG_ADDRESS, WETH_ADDRESS],
  };
}

/**
 * Execute a BRDG → ETH swap on SyncSwap
 * @param {string} brdgAmount - Amount of BRDG to swap (e.g., "1000")
 * @param {string} toAddress - Recipient address for ETH output
 * @param {object} opts - Options { slippageBps, deadlineMinutes }
 * @returns {Promise<{ok: boolean, tx_hash: string, brdgIn: string, ethOut: string, ethOutActual: string}>}
 */
async function swapBRDGtoETH(brdgAmount, toAddress, opts = {}) {
  const signer = getSigner();
  const router = new ethers.Contract(SYNCSWAP_ROUTER, ROUTER_ABI, signer);
  const brdg = new ethers.Contract(BRDG_ADDRESS, ERC20_ABI, signer);
  
  // Validate inputs
  if (!ethers.isAddress(toAddress)) {
    throw new Error('Invalid recipient address');
  }
  
  const amountIn = ethers.parseEther(brdgAmount);
  if (amountIn <= 0n) {
    throw new Error('Amount must be positive');
  }
  
  // Check BRDG balance
  const balance = await brdg.balanceOf(signer.address);
  if (balance < amountIn) {
    throw new Error(
      `Insufficient BRDG balance: have ${ethers.formatEther(balance)} BRDG, ` +
      `need ${brdgAmount} BRDG`
    );
  }
  
  // Get quote for minimum output
  const quote = await getSwapQuote(brdgAmount);
  const slippageBps = opts.slippageBps || 50; // 0.5%
  const minAmountOut = ethers.parseEther(
    (parseFloat(quote.ethOut) * (1 - slippageBps / 10000)).toFixed(18)
  );
  
  // Approve router if needed
  const allowance = await brdg.allowance(signer.address, SYNCSWAP_ROUTER);
  if (allowance < amountIn) {
    console.log('[brdg-swap] Approving SyncSwap Router...');
    const approveTx = await brdg.approve(SYNCSWAP_ROUTER, ethers.MaxUint256);
    await approveTx.wait();
    console.log('[brdg-swap] Approved:', approveTx.hash);
  }
  
  // Build route: BRDG → WETH (unstable/volatile pool)
  const route = {
    tokenIn: BRDG_ADDRESS,
    tokenOut: WETH_ADDRESS,
    stable: false, // BRDG/ETH is volatile
    to: toAddress,
  };
  
  const deadline = Math.floor(Date.now() / 1000) + (opts.deadlineMinutes || 10) * 60;
  
  console.log('[brdg-swap] Executing swap:', {
    brdgIn: brdgAmount,
    minEthOut: ethers.formatEther(minAmountOut),
    to: toAddress,
  });
  
  // Execute swap
  const tx = await router.swap(
    route,
    amountIn,
    minAmountOut,
    toAddress,
    deadline
  );
  
  const receipt = await tx.wait();
  
  // Parse actual ETH output from event (Swap event on pool)
  let ethOutActual = quote.ethOut;
  try {
    // Try to find the actual output from Swap event
    const poolAddr = await router.poolOf(CLASSIC_FACTORY, BRDG_ADDRESS, WETH_ADDRESS, false);
    const pool = new ethers.Contract(
      poolAddr,
      ['event Swap(address indexed sender, address indexed to, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out)'],
      getProvider()
    );
    
    for (const log of receipt.logs) {
      try {
        const parsed = pool.interface.parseLog(log);
        if (parsed && parsed.name === 'Swap') {
          // Determine which token is ETH (WETH)
          ethOutActual = ethers.formatEther(parsed.args.amount1Out || parsed.args.amount0Out);
          break;
        }
      } catch (_) {}
    }
  } catch (_) {}
  
  return {
    ok: true,
    tx_hash: receipt.hash,
    brdgIn: brdgAmount,
    ethOut: quote.ethOut,
    ethOutActual: ethOutActual,
    to: toAddress,
    gasUsed: receipt.gasUsed.toString(),
    status: receipt.status === 1 ? 'confirmed' : 'failed',
  };
}

/**
 * Swap BRDG to ETH and send to user (convenience for withdrawals)
 * @param {string} brdgAmount - Amount to convert
 * @param {string} userAddress - Final recipient
 * @returns {Promise<{ok: boolean, tx_hash: string, brdgIn: string, ethOut: string}>}
 */
async function swapAndSend(brdgAmount, userAddress) {
  const signer = getSigner();
  
  // Swap to treasury wallet first (for safety), then forward ETH
  const swapResult = await swapBRDGtoETH(brdgAmount, signer.address);
  
  if (!swapResult.ok) return swapResult;
  
  // Forward ETH to user
  const ethAmount = swapResult.ethOutActual || swapResult.ethOut;
  const { withdraw } = require('./eth-treasury');
  const forwardResult = await withdraw(userAddress, ethAmount);
  
  return {
    ok: true,
    swap_tx: swapResult.tx_hash,
    forward_tx: forwardResult.tx_hash,
    brdgIn: brdgAmount,
    ethOut: ethAmount,
    to: userAddress,
  };
}

/**
 * Check if BRDG/ETH pool exists and has liquidity
 * @returns {Promise<{exists: boolean, pool: string, brdgReserve: string, ethReserve: string}>}
 */
async function checkPoolLiquidity() {
  const provider = getProvider();
  const factory = new ethers.Contract(CLASSIC_FACTORY, FACTORY_ABI, provider);
  
  const pool = await factory.getPool(BRDG_ADDRESS, WETH_ADDRESS);
  
  if (pool === ethers.ZeroAddress) {
    return { exists: false, pool: null, brdgReserve: '0', ethReserve: '0' };
  }
  
  const brdg = new ethers.Contract(BRDG_ADDRESS, ERC20_ABI, provider);
  const weth = new ethers.Contract(WETH_ADDRESS, ERC20_ABI, provider);
  
  const brdgReserve = await brdg.balanceOf(pool);
  const ethReserve = await weth.balanceOf(pool);
  
  return {
    exists: brdgReserve > 0n && ethReserve > 0n,
    pool,
    brdgReserve: ethers.formatEther(brdgReserve),
    ethReserve: ethers.formatEther(ethReserve),
  };
}

module.exports = {
  swapBRDGtoETH,
  getSwapQuote,
  swapAndSend,
  checkPoolLiquidity,
  SYNCSWAP_ROUTER,
  WETH_ADDRESS,
  BRDG_ADDRESS,
};
