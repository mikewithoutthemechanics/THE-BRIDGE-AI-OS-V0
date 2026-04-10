/**
 * BRDG Token + Treasury/Staking Vault Deployment Script
 * Week 1 Day 4 artifact
 *
 * Usage:
 *   npx hardhat run scripts/deploy-contracts.js --network linea-testnet
 *   npx hardhat run scripts/deploy-contracts.js --network linea
 *
 * Deployment sequence:
 * 1. Deploy BRDG ERC-20
 * 2. Deploy TreasuryVault (needs BRDG address)
 * 3. Deploy StakingVault (needs BRDG address)
 * 4. Grant MINTER_ROLE to TreasuryVault (allows minting into treasury)
 * 5. Fund initial staking rewards
 * 6. Save contract addresses to .env.deployed
 */

const hre = require('hardhat');
const fs = require('fs');
const path = require('path');

// Treasury wallet address (from eth-treasury.js)
const TREASURY_ADDRESS = process.env.TREASURY_ADDRESS || '0xF22Bc18487764FEe106ca5Fb2EE27b11FDcB3756';

// Initial staking reward pool
const INITIAL_STAKING_REWARDS = hre.ethers.parseEther('500000'); // 500K BRDG

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('BRDG + Treasury/Staking Vault Deployment');
  console.log('═══════════════════════════════════════════════════════\n');

  const [deployer] = await hre.ethers.getSigners();
  console.log(`Deploying from: ${deployer.address}`);
  console.log(`Network: ${hre.network.name}`);
  console.log(`Chain ID: ${(await hre.ethers.provider.getNetwork()).chainId}\n`);

  // ───────────────────────────────────────────────────────────────
  // STEP 1: Deploy BRDG Token
  // ───────────────────────────────────────────────────────────────
  console.log('STEP 1: Deploying BRDG Token...');
  const BRDG = await hre.ethers.getContractFactory('BRDG');
  const brdg = await BRDG.deploy(TREASURY_ADDRESS);
  await brdg.waitForDeployment();
  const brdgAddress = await brdg.getAddress();
  console.log(`  ✓ BRDG deployed: ${brdgAddress}`);

  const totalSupply = await brdg.totalSupply();
  console.log(`  ✓ Initial mint to treasury: ${hre.ethers.formatEther(totalSupply)} BRDG\n`);

  // ───────────────────────────────────────────────────────────────
  // STEP 2: Deploy Treasury Vault
  // ───────────────────────────────────────────────────────────────
  console.log('STEP 2: Deploying TreasuryVault...');
  const TreasuryVault = await hre.ethers.getContractFactory('TreasuryVault');
  const treasuryVault = await TreasuryVault.deploy(brdgAddress);
  await treasuryVault.waitForDeployment();
  const vaultAddress = await treasuryVault.getAddress();
  console.log(`  ✓ TreasuryVault deployed: ${vaultAddress}`);
  console.log(`  ✓ Split: Ops 40% / Liquidity 25% / Reserve 20% / Founder 15%\n`);

  // ───────────────────────────────────────────────────────────────
  // STEP 3: Deploy Staking Vault
  // ───────────────────────────────────────────────────────────────
  console.log('STEP 3: Deploying StakingVault...');
  const StakingVault = await hre.ethers.getContractFactory('StakingVault');
  const stakingVault = await StakingVault.deploy(brdgAddress);
  await stakingVault.waitForDeployment();
  const stakingAddress = await stakingVault.getAddress();
  console.log(`  ✓ StakingVault deployed: ${stakingAddress}`);
  console.log(`  ✓ Reward pool: ${hre.ethers.formatEther(INITIAL_STAKING_REWARDS)} BRDG\n`);

  // ───────────────────────────────────────────────────────────────
  // STEP 4: Set burn exemption for staking vault
  // ───────────────────────────────────────────────────────────────
  console.log('STEP 4: Configuring burn exemptions...');
  const exemptTx = await brdg.setBurnExempt(stakingAddress, true);
  await exemptTx.wait();
  console.log(`  ✓ StakingVault exempted from 1% burn\n`);

  // ───────────────────────────────────────────────────────────────
  // STEP 5: Fund initial staking rewards
  // ───────────────────────────────────────────────────────────────
  console.log('STEP 5: Funding staking reward pool...');

  // Transfer BRDG from treasury to staking vault
  // Note: Treasury receives the initial 10M, we approve staking to spend some
  const approveTx = await brdg.approve(stakingAddress, INITIAL_STAKING_REWARDS);
  await approveTx.wait();
  console.log(`  ✓ Approved ${hre.ethers.formatEther(INITIAL_STAKING_REWARDS)} BRDG for StakingVault`);

  const fundTx = await stakingVault.fundRewards(INITIAL_STAKING_REWARDS, 'initial-pool');
  await fundTx.wait();
  console.log(`  ✓ Staking reward pool funded\n`);

  // ───────────────────────────────────────────────────────────────
  // STEP 6: Verification
  // ───────────────────────────────────────────────────────────────
  console.log('STEP 6: Verifying deployment...');

  const brdgSupply = await brdg.totalSupply();
  const brdgOwner = await brdg.owner();
  const vaultOwner = await treasuryVault.owner();
  const stakingOwner = await stakingVault.owner();
  const rewardPoolBalance = await stakingVault.rewardPool();

  console.log(`  ✓ BRDG total supply: ${hre.ethers.formatEther(brdgSupply)}`);
  console.log(`  ✓ BRDG owner: ${brdgOwner === deployer.address ? 'Deployer' : brdgOwner}`);
  console.log(`  ✓ TreasuryVault owner: ${vaultOwner === deployer.address ? 'Deployer' : vaultOwner}`);
  console.log(`  ✓ StakingVault owner: ${stakingOwner === deployer.address ? 'Deployer' : stakingOwner}`);
  console.log(`  ✓ StakingVault reward pool: ${hre.ethers.formatEther(rewardPoolBalance)} BRDG\n`);

  // ───────────────────────────────────────────────────────────────
  // STEP 7: Save addresses
  // ───────────────────────────────────────────────────────────────
  console.log('STEP 7: Saving contract addresses...');

  const addresses = {
    network: hre.network.name,
    chainId: (await hre.ethers.provider.getNetwork()).chainId,
    timestamp: new Date().toISOString(),
    contracts: {
      BRDG: brdgAddress,
      TreasuryVault: vaultAddress,
      StakingVault: stakingAddress,
    },
    settings: {
      treasuryAddress: TREASURY_ADDRESS,
      initialBRDGMint: hre.ethers.formatEther(totalSupply),
      initialStakingRewards: hre.ethers.formatEther(INITIAL_STAKING_REWARDS),
    },
  };

  const deploymentFile = path.join(__dirname, `../.env.deployed-${hre.network.name}`);
  fs.writeFileSync(deploymentFile, JSON.stringify(addresses, null, 2));
  console.log(`  ✓ Addresses saved to: ${deploymentFile}\n`);

  // ───────────────────────────────────────────────────────────────
  // SUMMARY
  // ───────────────────────────────────────────────────────────────
  console.log('═══════════════════════════════════════════════════════');
  console.log('DEPLOYMENT COMPLETE');
  console.log('═══════════════════════════════════════════════════════\n');

  console.log('Contract Addresses:');
  console.log(`  BRDG Token:         ${brdgAddress}`);
  console.log(`  Treasury Vault:     ${vaultAddress}`);
  console.log(`  Staking Vault:      ${stakingAddress}\n`);

  console.log('Next Steps:');
  console.log('  1. Update defi-service config with contract addresses');
  console.log('  2. Set up price oracle (reads BRDG/ETH pool)');
  console.log('  3. Create BRDG/ETH liquidity pool on DEX');
  console.log('  4. Fund initial liquidity (1 ETH + 10,000 BRDG)');
  console.log('  5. Test end-to-end: PayFast → ledger → BRDG buyback\n');

  // Optional: Verify on Lineascan
  if (hre.network.name === 'linea' || hre.network.name === 'linea-testnet') {
    console.log('Verifying on Lineascan...');
    try {
      await hre.run('verify:verify', { address: brdgAddress, constructorArguments: [TREASURY_ADDRESS] });
      console.log(`  ✓ BRDG verified`);
    } catch (error) {
      console.log(`  ℹ Verification skipped (may need manual verification)`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
