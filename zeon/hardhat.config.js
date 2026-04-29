require('@nomicfoundation/hardhat-toolbox');

module.exports = {
  solidity: {
    version: '0.8.20',
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    hardhat: { chainId: 31337 },
    linea: {
      url: process.env.LINEA_RPC_URL || 'https://rpc.linea.build',
      chainId: 59144,
      accounts: process.env.ZEON_DEPLOYER_KEY ? [process.env.ZEON_DEPLOYER_KEY] : [],
    },
  },
};
