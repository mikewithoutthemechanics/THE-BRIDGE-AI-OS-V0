require('dotenv').config();
require('@nomicfoundation/hardhat-toolbox');

// Genesis alignment: the deployer key MUST be an explicit, dedicated seed.
// Deriving from JWT_SECRET / BRIDGE_SIWE_JWT_SECRET / BRIDGE_INTERNAL_SECRET is
// forbidden by BRIDGE_REAL_SYSTEM_BLUEPRINT.md §Security. See
// docs/GENESIS_ALIGNMENT.md §Phase A.
function getDeployerKey() {
  const raw = process.env.DEPLOYER_PRIVATE_KEY || process.env.TREASURY_PRIVATE_KEY;
  if (!raw) {
    // Dummy key — only valid for `hardhat compile` / `hardhat test`. Any
    // command that actually signs a transaction will fail with a clear error.
    return '0x' + 'ab'.repeat(32);
  }
  const trimmed = raw.trim();
  const key = trimmed.startsWith('0x') ? trimmed : '0x' + trimmed;
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error('[hardhat] DEPLOYER_PRIVATE_KEY must be a 32-byte hex value (64 hex chars).');
  }
  return key;
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
