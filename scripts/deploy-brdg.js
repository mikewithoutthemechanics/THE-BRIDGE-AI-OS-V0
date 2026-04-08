/**
 * Deploy BRDG Token + TreasuryVault to Linea
 *
 * Usage:
 *   npx hardhat run scripts/deploy-brdg.js --network linea
 *   npx hardhat run scripts/deploy-brdg.js --network lineaSepolia  (testnet first)
 */
const { ethers } = require('hardhat');
const fs = require('fs');
const path = require('path');

async function main() {
  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);

  console.log('='.repeat(60));
  console.log('BRIDGE AI OS — BRDG Token Deployment');
  console.log('='.repeat(60));
  console.log(`Deployer:  ${deployer.address}`);
  console.log(`Balance:   ${ethers.formatEther(balance)} ETH`);
  console.log(`Network:   ${(await ethers.provider.getNetwork()).name} (chain ${(await ethers.provider.getNetwork()).chainId})`);
  console.log('');

  if (balance === 0n) {
    console.error('ERROR: Deployer has 0 ETH. Fund the wallet first.');
    console.error(`       Send ETH to: ${deployer.address}`);
    process.exit(1);
  }

  // Treasury receives the initial BRDG mint. Use TREASURY_ADDRESS env or fall back to deployer.
  const treasury = process.env.TREASURY_ADDRESS || deployer.address;
  console.log(`Treasury:  ${treasury}`);
  console.log('');

  // 1. Deploy BRDG Token
  console.log('[1/2] Deploying BRDG Token (ERC-20)...');
  const BRDG = await ethers.getContractFactory('BRDG');
  const brdg = await BRDG.deploy(treasury);
  await brdg.waitForDeployment();
  const brdgAddr = await brdg.getAddress();
  console.log(`  BRDG Token deployed at: ${brdgAddr}`);
  console.log(`  Initial supply: 10,000,000 BRDG to treasury`);
  console.log('');

  // 2. Deploy TreasuryVault
  console.log('[2/2] Deploying TreasuryVault...');
  const Vault = await ethers.getContractFactory('TreasuryVault');
  const vault = await Vault.deploy(brdgAddr);
  await vault.waitForDeployment();
  const vaultAddr = await vault.getAddress();
  console.log(`  TreasuryVault deployed at: ${vaultAddr}`);
  console.log('');

  // 3. Set vault as burn-exempt (it holds tokens, shouldn't lose 1% on internal transfers)
  console.log('Setting TreasuryVault as burn-exempt...');
  const tx = await brdg.setBurnExempt(vaultAddr, true);
  await tx.wait();
  console.log('  Done.');
  console.log('');

  // 4. Save deployment addresses
  const deployment = {
    network: (await ethers.provider.getNetwork()).name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    deployer: deployer.address,
    treasury: treasury,
    contracts: {
      BRDG: brdgAddr,
      TreasuryVault: vaultAddr,
    },
    deployedAt: new Date().toISOString(),
  };

  const outDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'deployment.json');
  fs.writeFileSync(outFile, JSON.stringify(deployment, null, 2));

  console.log('='.repeat(60));
  console.log('DEPLOYMENT COMPLETE');
  console.log('='.repeat(60));
  console.log(`BRDG Token:     ${brdgAddr}`);
  console.log(`TreasuryVault:  ${vaultAddr}`);
  console.log(`Saved to:       ${outFile}`);
  console.log('');
  console.log('Next steps:');
  console.log('  1. Verify contracts on Lineascan:');
  console.log(`     npx hardhat verify --network linea ${brdgAddr} ${treasury}`);
  console.log(`     npx hardhat verify --network linea ${vaultAddr} ${brdgAddr}`);
  console.log('  2. Add BRDG token to wallet: Import custom token → paste address');
  console.log('  3. Seed liquidity on SyncSwap or Lynex');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
