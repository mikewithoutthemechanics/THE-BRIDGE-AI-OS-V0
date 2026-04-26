// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title TreasuryVaultV2 — Bridge AI OS Treasury (Classify-capable)
 * @notice Drop-in successor to TreasuryVault. Same 40/25/20/15 split,
 *         same depositBrdg / withdrawBrdg / withdrawEth semantics.
 *
 *         Adds `classify(uint256 amount)` and `classifyEth(uint256 amount)`
 *         owner-only admin functions that reclassify a raw BRDG/ETH balance
 *         already sitting on the contract (e.g. delivered via `mint()` or
 *         direct transfer) into the four buckets per the current split bps.
 *         Without this, tokens landed without going through `depositBrdg`
 *         are permanently stuck (see original TreasuryVault for the bug).
 *
 *         Split: Ops 40% / Liquidity 25% / Reserve 20% / Founder 15%.
 */
contract TreasuryVaultV2 is Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable brdg;

    uint256 public constant OPS_BPS      = 4000; // 40%
    uint256 public constant LIQ_BPS      = 2500; // 25%
    uint256 public constant RESERVE_BPS  = 2000; // 20%
    uint256 public constant FOUNDER_BPS  = 1500; // 15%

    struct Buckets {
        uint256 ops;
        uint256 liquidity;
        uint256 reserve;
        uint256 founder;
    }

    Buckets public ethBuckets;
    Buckets public brdgBuckets;

    uint256 public totalEthDeposited;
    uint256 public totalBrdgDeposited;

    event EthDeposited(address indexed from, uint256 amount);
    event BrdgDeposited(address indexed from, uint256 amount);
    event EthWithdrawn(address indexed to, uint256 amount, string bucket);
    event BrdgWithdrawn(address indexed to, uint256 amount, string bucket);
    event BrdgClassified(uint256 amount, uint256 ops, uint256 liq, uint256 res, uint256 fnd);
    event EthClassified(uint256 amount, uint256 ops, uint256 liq, uint256 res, uint256 fnd);

    constructor(address _brdg) Ownable(msg.sender) {
        require(_brdg != address(0), "zero brdg");
        brdg = IERC20(_brdg);
    }

    receive() external payable {
        _splitEth(msg.value);
        emit EthDeposited(msg.sender, msg.value);
    }

    function depositBrdg(uint256 amount) external {
        brdg.safeTransferFrom(msg.sender, address(this), amount);
        _splitBrdg(amount);
        emit BrdgDeposited(msg.sender, amount);
    }

    /**
     * @notice Reclassify `amount` of BRDG already held by this contract into
     *         the four buckets per OPS/LIQ/RESERVE/FOUNDER bps. Useful after
     *         a direct mint() or raw transfer() to this contract.
     *
     *         Reverts if the unclassified balance is below `amount`. The
     *         unclassified balance is balanceOf(this) minus the sum of all
     *         brdgBuckets (what is already tracked).
     */
    function classify(uint256 amount) external onlyOwner {
        require(amount > 0, "zero amount");
        uint256 tracked = brdgBuckets.ops + brdgBuckets.liquidity + brdgBuckets.reserve + brdgBuckets.founder;
        uint256 bal = brdg.balanceOf(address(this));
        require(bal >= tracked + amount, "insufficient untracked balance");
        (uint256 ops, uint256 liq, uint256 res, uint256 fnd) = _splitBrdg(amount);
        emit BrdgClassified(amount, ops, liq, res, fnd);
    }

    /**
     * @notice Same as `classify` but for ETH already sitting on the contract
     *         (e.g. sent to `receive()` without metering, or delivered before
     *         deploy).
     */
    function classifyEth(uint256 amount) external onlyOwner {
        require(amount > 0, "zero amount");
        uint256 tracked = ethBuckets.ops + ethBuckets.liquidity + ethBuckets.reserve + ethBuckets.founder;
        uint256 bal = address(this).balance;
        require(bal >= tracked + amount, "insufficient untracked balance");
        (uint256 ops, uint256 liq, uint256 res, uint256 fnd) = _splitEth(amount);
        emit EthClassified(amount, ops, liq, res, fnd);
    }

    function withdrawEth(string calldata bucket, address to, uint256 amount) external onlyOwner {
        require(to != address(0), "zero to");
        bytes32 b = keccak256(bytes(bucket));
        if (b == keccak256("ops"))            { require(ethBuckets.ops >= amount);       ethBuckets.ops -= amount; }
        else if (b == keccak256("liquidity")) { require(ethBuckets.liquidity >= amount); ethBuckets.liquidity -= amount; }
        else if (b == keccak256("reserve"))   { require(ethBuckets.reserve >= amount);   ethBuckets.reserve -= amount; }
        else if (b == keccak256("founder"))   { require(ethBuckets.founder >= amount);   ethBuckets.founder -= amount; }
        else revert("invalid bucket");

        (bool ok, ) = to.call{value: amount}("");
        require(ok, "eth transfer failed");
        emit EthWithdrawn(to, amount, bucket);
    }

    function withdrawBrdg(string calldata bucket, address to, uint256 amount) external onlyOwner {
        require(to != address(0), "zero to");
        bytes32 b = keccak256(bytes(bucket));
        if (b == keccak256("ops"))            { require(brdgBuckets.ops >= amount);       brdgBuckets.ops -= amount; }
        else if (b == keccak256("liquidity")) { require(brdgBuckets.liquidity >= amount); brdgBuckets.liquidity -= amount; }
        else if (b == keccak256("reserve"))   { require(brdgBuckets.reserve >= amount);   brdgBuckets.reserve -= amount; }
        else if (b == keccak256("founder"))   { require(brdgBuckets.founder >= amount);   brdgBuckets.founder -= amount; }
        else revert("invalid bucket");

        brdg.safeTransfer(to, amount);
        emit BrdgWithdrawn(to, amount, bucket);
    }

    function bucketBalances() external view returns (
        uint256 opsEth, uint256 liqEth, uint256 resEth, uint256 fndEth,
        uint256 opsBrdg, uint256 liqBrdg, uint256 resBrdg, uint256 fndBrdg
    ) {
        return (
            ethBuckets.ops, ethBuckets.liquidity, ethBuckets.reserve, ethBuckets.founder,
            brdgBuckets.ops, brdgBuckets.liquidity, brdgBuckets.reserve, brdgBuckets.founder
        );
    }

    function _splitEth(uint256 amount) internal returns (uint256, uint256, uint256, uint256) {
        uint256 ops = (amount * OPS_BPS) / 10000;
        uint256 liq = (amount * LIQ_BPS) / 10000;
        uint256 res = (amount * RESERVE_BPS) / 10000;
        uint256 fnd = amount - ops - liq - res;
        ethBuckets.ops       += ops;
        ethBuckets.liquidity += liq;
        ethBuckets.reserve   += res;
        ethBuckets.founder   += fnd;
        totalEthDeposited += amount;
        return (ops, liq, res, fnd);
    }

    function _splitBrdg(uint256 amount) internal returns (uint256, uint256, uint256, uint256) {
        uint256 ops = (amount * OPS_BPS) / 10000;
        uint256 liq = (amount * LIQ_BPS) / 10000;
        uint256 res = (amount * RESERVE_BPS) / 10000;
        uint256 fnd = amount - ops - liq - res;
        brdgBuckets.ops       += ops;
        brdgBuckets.liquidity += liq;
        brdgBuckets.reserve   += res;
        brdgBuckets.founder   += fnd;
        totalBrdgDeposited += amount;
        return (ops, liq, res, fnd);
    }
}
