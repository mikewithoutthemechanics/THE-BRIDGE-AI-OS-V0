const { expect } = require('chai');
const { ethers } = require('hardhat');

// Simulate the race end-to-end on hardhat's local chain. Hardhat lets us set
// base fees and auto-mining order, so we emulate the "sequencer orders by
// gas price" property by sending the attacker's tx first but with lower gas
// and then the rescue with higher gas, then mining once.

describe('ZeonGuardian', function () {
  async function deploy() {
    const [owner, sentinel, pauser, coldSafe, hot, attacker, stranger] = await ethers.getSigners();

    const Tok = await ethers.getContractFactory('MockERC20');
    const brdg = await Tok.deploy('Bridge', 'BRDG');
    const usdt = await Tok.deploy('Tether', 'USDT');

    const Guardian = await ethers.getContractFactory('ZeonGuardian');
    const guardian = await Guardian.deploy(sentinel.address, pauser.address, coldSafe.address);

    // Mint to hot, approve guardian for MAX (the one-time setup).
    await brdg.mint(hot.address, ethers.parseUnits('1000', 18));
    await usdt.mint(hot.address, ethers.parseUnits('500', 18));
    await brdg.connect(hot).approve(await guardian.getAddress(), ethers.MaxUint256);
    await usdt.connect(hot).approve(await guardian.getAddress(), ethers.MaxUint256);

    // Register as watched (owner call).
    await guardian.setWatchedToken(await brdg.getAddress(), true);
    await guardian.setWatchedToken(await usdt.getAddress(), true);

    return { owner, sentinel, pauser, coldSafe, hot, attacker, stranger, brdg, usdt, guardian };
  }

  it('rescues full BRDG balance when sentinel calls before attacker', async () => {
    const { sentinel, coldSafe, hot, brdg, guardian } = await deploy();
    const hotBal = await brdg.balanceOf(hot.address);

    await expect(guardian.connect(sentinel).rescueFullBalance(await brdg.getAddress(), hot.address))
      .to.emit(guardian, 'Rescued');

    expect(await brdg.balanceOf(hot.address)).to.equal(0n);
    expect(await brdg.balanceOf(coldSafe.address)).to.equal(hotBal);
  });

  it('race: sentinel wins → attacker reverts with insufficient balance', async () => {
    const { sentinel, coldSafe, hot, attacker, brdg, guardian } = await deploy();
    const hotBal = await brdg.balanceOf(hot.address);

    // Hot wallet also approves attacker (simulates leaked key granting
    // transferFrom authority — in reality the attacker owns the key directly,
    // but we model the transfer budget this way).
    await brdg.connect(hot).approve(attacker.address, ethers.MaxUint256);

    // Disable auto-mining so we can order txs manually.
    await ethers.provider.send('evm_setAutomine', [false]);

    const attackerTx = await brdg.connect(attacker).transferFrom(
      hot.address, attacker.address, hotBal,
      { gasPrice: ethers.parseUnits('10', 'gwei') }
    );
    const rescueTx = await guardian.connect(sentinel).rescueFullBalance(
      await brdg.getAddress(), hot.address,
      { gasPrice: ethers.parseUnits('12', 'gwei') } // 20% bump
    );

    // Mine one block; geth/hardhat order by effectiveGasPrice desc.
    await ethers.provider.send('hardhat_mine', ['0x1']);
    await ethers.provider.send('evm_setAutomine', [true]);

    // Rescue mined successfully; attacker mined but reverted.
    const rescueRc = await ethers.provider.getTransactionReceipt(rescueTx.hash);
    const attackerRc = await ethers.provider.getTransactionReceipt(attackerTx.hash);

    expect(rescueRc.status, 'rescue should succeed').to.equal(1);
    expect(attackerRc.status, 'attacker should revert').to.equal(0);

    expect(await brdg.balanceOf(hot.address)).to.equal(0n);
    expect(await brdg.balanceOf(coldSafe.address)).to.equal(hotBal);
    expect(await brdg.balanceOf(attacker.address)).to.equal(0n);
  });

  it('rejects rescue on unwatched token', async () => {
    const { sentinel, hot, guardian } = await deploy();
    const Tok = await ethers.getContractFactory('MockERC20');
    const scam = await Tok.deploy('Scam', 'SCAM');
    await scam.mint(hot.address, 100n);
    await scam.connect(hot).approve(await guardian.getAddress(), ethers.MaxUint256);

    await expect(guardian.connect(sentinel).rescueFullBalance(await scam.getAddress(), hot.address))
      .to.be.revertedWith('ZEON: token not watched');
  });

  it('rejects rescue from non-sentinel', async () => {
    const { stranger, hot, brdg, guardian } = await deploy();
    await expect(guardian.connect(stranger).rescueFullBalance(await brdg.getAddress(), hot.address))
      .to.be.revertedWith('ZEON: not sentinel');
  });

  it('pauser can freeze; sentinel rescues fail while paused; unpause restores', async () => {
    const { sentinel, pauser, hot, brdg, guardian } = await deploy();
    await guardian.connect(pauser).pause();
    expect(await guardian.paused()).to.equal(true);

    await expect(guardian.connect(sentinel).rescueFullBalance(await brdg.getAddress(), hot.address))
      .to.be.revertedWith('ZEON: paused');

    await guardian.connect(pauser).unpause();
    expect(await guardian.paused()).to.equal(false);

    await expect(guardian.connect(sentinel).rescueFullBalance(await brdg.getAddress(), hot.address))
      .to.emit(guardian, 'Rescued');
  });

  it('pauser cannot rotate cold safe or other roles', async () => {
    const { pauser, attacker, guardian } = await deploy();
    await expect(guardian.connect(pauser).rotateColdSafe(attacker.address))
      .to.be.revertedWith('ZEON: not owner');
    await expect(guardian.connect(pauser).rotateSentinel(attacker.address))
      .to.be.revertedWith('ZEON: not owner');
  });

  it('owner can rotate sentinel, pauser, cold safe, and self', async () => {
    const { owner, sentinel, pauser, coldSafe, stranger, guardian } = await deploy();
    await expect(guardian.connect(owner).rotateSentinel(stranger.address)).to.emit(guardian, 'SentinelRotated');
    await expect(guardian.connect(owner).rotatePauser(stranger.address)).to.emit(guardian, 'PauserRotated');
    await expect(guardian.connect(owner).rotateColdSafe(stranger.address)).to.emit(guardian, 'ColdSafeRotated');
    await expect(guardian.connect(owner).rotateOwner(stranger.address)).to.emit(guardian, 'OwnerRotated');
    // old owner no longer owner
    await expect(guardian.connect(owner).rotateSentinel(sentinel.address)).to.be.revertedWith('ZEON: not owner');
  });

  it('rescueFullBalance takes min(balance, allowance)', async () => {
    const { sentinel, coldSafe, hot, brdg, guardian } = await deploy();
    // Reduce allowance below balance.
    await brdg.connect(hot).approve(await guardian.getAddress(), ethers.parseUnits('100', 18));
    const allow = ethers.parseUnits('100', 18);
    await guardian.connect(sentinel).rescueFullBalance(await brdg.getAddress(), hot.address);
    expect(await brdg.balanceOf(coldSafe.address)).to.equal(allow);
    expect(await brdg.balanceOf(hot.address)).to.equal(ethers.parseUnits('900', 18));
  });

  it('cannot rescue when there is nothing to rescue', async () => {
    const { sentinel, hot, brdg, guardian } = await deploy();
    await brdg.connect(hot).approve(await guardian.getAddress(), 0);
    await expect(guardian.connect(sentinel).rescueFullBalance(await brdg.getAddress(), hot.address))
      .to.be.revertedWith('ZEON: nothing to rescue');
  });
});
