require('dotenv').config();
require('@nomicfoundation/hardhat-toolbox');

// Derive the deployer private key from the same master secret as eth-treasury.js
const crypto = require('crypto');
const os = require('os');

function getDeployerKey() {
  // Priority 1: Explicit deployer key (for deploying from external wallets like 0xAC30...)
  if (process.env.DEPLOYER_PRIVATE_KEY && process.env.DEPLOYER_PRIVATE_KEY.length >= 64) {
    const key = process.env.DEPLOYER_PRIVATE_KEY;
    return key.startsWith('0x') ? key : '0x' + key;
  }

  // Priority 2: Derive from master secret (same as eth-treasury.js)
  const sources = [
    process.env.BRIDGE_SIWE_JWT_SECRET,
    process.env.BRIDGE_INTERNAL_SECRET,
    process.env.JWT_SECRET,
  ].filter(s => s && s.length >= 32);

  if (sources.length === 0) {
    console.warn('[hardhat] No secret env vars found — using dummy key for compilation only');
    return '0x' + 'ab'.repeat(32);
  }

  const master = crypto.createHash('sha512').update(sources.join(':')).digest();
  const key = crypto.createHmac('sha256', master).update('bridge-treasury-eth-wallet-v1').digest('hex');
  return '0x' + key;
}

module.exports = {
  solidity: {
    version: '0.8.20',
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    linea: {
      url: process.env.BRIDGE_SIWE_RPC_URL || 'https://rpc.linea.build',
      chainId: 59144,
      accounts: [getDeployerKey()],
    },
    lineaSepolia: {
      url: 'https://rpc.sepolia.linea.build',
      chainId: 59141,
      accounts: [getDeployerKey()],
    },
  },
  etherscan: {
    apiKey: {
      linea: process.env.LINEASCAN_API_KEY || 'placeholder',
    },
    customChains: [
      {
        network: 'linea',
        chainId: 59144,
        urls: {
          apiURL: 'https://api.lineascan.build/api',
          browserURL: 'https://lineascan.build',
        },
      },
    ],
  },
  sourcify: {
    enabled: true,
  },
  paths: {
    sources: './contracts',
    artifacts: './artifacts',
    cache: './cache',
  },
};
