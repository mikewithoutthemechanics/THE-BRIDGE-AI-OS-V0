/**
 * Modular Vault Stack Deployment — Vault + StrategyIdle (L1/L2/L3) + Router + Adapter + Keeper
 *
 * Usage:
 *   npx hardhat run scripts/deploy-modular-vault.js --network lineaSepolia
 *   npx hardhat run scripts/deploy-modular-vault.js --network linea
 *
 * Env:
 *   ASSET_ADDRESS   ERC20 underlying (default: BRDG from .env.deployed-linea)
 *   STABLE_ADDRESS  ERC20 stable for off-ramp (default: USDC on Linea)
 *   ADMIN_ADDRESS   optional — defaults to deployer
 *
 * Writes: .env.deployed-modular-<network>.json
 */
const hre = require('hardhat');
const fs  = require('fs');
const path = require('path');

const LINEA_USDC = '0x176211869cA2b568f2A7D4EE941E073a821EE1ff';
const BUCKETS = [
  { id: 0, name: 'L1 stable',     allocationBps: 5000, cap: 0 },
  { id: 1, name: 'L2 balanced',   allocationBps: 3000, cap: 0 },
  { id: 2, name: 'L3 aggressive', allocationBps: 2000, cap: 0 },
];

async function verify(address, args) {
  if (!['linea', 'lineaSepolia'].includes(hre.network.name)) return;
  try {
    await hre.run('verify:verify', { address, constructorArguments: args });
    console.log(`  ✓ verified ${address}`);
  } catch (e) {
    console.log(`  ℹ verify skipped for ${address}: ${e.message.split('\n')[0]}`);
  }
}

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const admin = process.env.ADMIN_ADDRESS || deployer.address;
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Admin:    ${admin}`);
  console.log(`Network:  ${hre.network.name}\n`);

  let asset = process.env.ASSET_ADDRESS;
  if (!asset) {
    try {
      const prev = JSON.parse(fs.readFileSync(path.join(__dirname, `../.env.deployed-${hre.network.name}.json`)));
      asset = prev.contracts?.BRDG;
    } catch {}
  }
  if (!asset) throw new Error('ASSET_ADDRESS env required (or deploy BRDG first)');
  const stable = process.env.STABLE_ADDRESS || LINEA_USDC;
  console.log(`Asset:  ${asset}`);
  console.log(`Stable: ${stable}\n`);

  // 1. Vault
  console.log('[1/5] Vault');
  const Vault = await hre.ethers.getContractFactory('contracts/modular/Vault.sol:Vault');
  const vault = await Vault.deploy(asset, admin);
  await vault.waitForDeployment();
  const vaultAddr = await vault.getAddress();
  console.log(`  deployed: ${vaultAddr}`);

  // 2. Strategies (one per bucket)
  console.log('[2/5] Strategies (Idle placeholder — swap to Aave/Compound later)');
  const Strategy = await hre.ethers.getContractFactory('StrategyIdle');
  const strategies = {};
  for (const b of BUCKETS) {
    const s = await Strategy.deploy(vaultAddr, b.id, asset);
    await s.waitForDeployment();
    strategies[b.id] = await s.getAddress();
    console.log(`  bucket ${b.id} (${b.name}): ${strategies[b.id]}`);
  }

  // 3. Wire buckets
  console.log('[3/5] Wiring buckets');
  for (const b of BUCKETS) {
    const tx = await vault.setBucket(b.id, strategies[b.id], b.allocationBps, b.cap);
    await tx.wait();
    console.log(`  bucket ${b.id}: ${b.allocationBps / 100}% allocation`);
  }

  // 4. BridgeRouter
  console.log('[4/5] BridgeRouter');
  const Router = await hre.ethers.getContractFactory('BridgeRouter');
  const router = await Router.deploy(admin);
  await router.waitForDeployment();
  const routerAddr = await router.getAddress();
  console.log(`  deployed: ${routerAddr}`);

  // 5. PaymentAdapter + Keeper
  console.log('[5/5] PaymentAdapter + Keeper');
  const Adapter = await hre.ethers.getContractFactory('PaymentAdapter');
  const adapter = await Adapter.deploy(stable, admin);
  await adapter.waitForDeployment();
  const adapterAddr = await adapter.getAddress();

  const Keeper = await hre.ethers.getContractFactory('contracts/modular/Keeper.sol:Keeper');
  const keeper = await Keeper.deploy(admin);
  await keeper.waitForDeployment();
  const keeperAddr = await keeper.getAddress();
  for (const b of BUCKETS) {
    const tx = await keeper.addStrategy(strategies[b.id]);
    await tx.wait();
  }
  console.log(`  adapter: ${adapterAddr}`);
  console.log(`  keeper:  ${keeperAddr}`);

  // Save
  const out = {
    network: hre.network.name,
    chainId: Number((await hre.ethers.provider.getNetwork()).chainId),
    timestamp: new Date().toISOString(),
    asset, stable, admin,
    contracts: {
      Vault: vaultAddr,
      BridgeRouter: routerAddr,
      PaymentAdapter: adapterAddr,
      Keeper: keeperAddr,
      Strategies: strategies,
    },
    buckets: BUCKETS,
  };
  const outFile = path.join(__dirname, `../.env.deployed-modular-${hre.network.name}.json`);
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
  console.log(`\nAddresses → ${outFile}`);

  // Verify
  console.log('\nVerifying on Lineascan...');
  await verify(vaultAddr, [asset, admin]);
  for (const b of BUCKETS) await verify(strategies[b.id], [vaultAddr, b.id, asset]);
  await verify(routerAddr,  [admin]);
  await verify(adapterAddr, [stable, admin]);
  await verify(keeperAddr,  [admin]);

  console.log('\n✓ modular stack live');
}

main().catch(e => { console.error(e); process.exit(1); });
