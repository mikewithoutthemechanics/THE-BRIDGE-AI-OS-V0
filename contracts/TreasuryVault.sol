// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title TreasuryVault — Bridge AI OS Treasury
 * @notice Receives ETH + BRDG, auto-splits into 4 buckets.
 *         Splits: Ops 40% / Liquidity 25% / Reserve 20% / Founder 15%
 */
contract TreasuryVault is Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable brdg;

    // Split percentages (basis points, total = 10000)
    uint256 public constant OPS_BPS      = 4000; // 40%
    uint256 public constant LIQ_BPS      = 2500; // 25%
    uint256 public constant RESERVE_BPS  = 2000; // 20%
    uint256 public constant FOUNDER_BPS  = 1500; // 15%

    // Bucket balances (tracked for transparency, not separate addresses)
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

    constructor(address _brdg) Ownable(msg.sender) {
        require(_brdg != address(0), "zero brdg");
        brdg = IERC20(_brdg);
    }

    /// @notice Deposit ETH — auto-splits into 4 buckets.
    receive() external payable {
        _splitEth(msg.value);
        emit EthDeposited(msg.sender, msg.value);
    }

    /// @notice Deposit BRDG tokens — auto-splits into 4 buckets.
    function depositBrdg(uint256 amount) external {
        brdg.safeTransferFrom(msg.sender, address(this), amount);
        brdgBuckets.ops       += (amount * OPS_BPS)     / 10000;
        brdgBuckets.liquidity += (amount * LIQ_BPS)     / 10000;
        brdgBuckets.reserve   += (amount * RESERVE_BPS) / 10000;
        brdgBuckets.founder   += (amount * FOUNDER_BPS) / 10000;
        totalBrdgDeposited += amount;
        emit BrdgDeposited(msg.sender, amount);
    }

    /// @notice Withdraw ETH from a specific bucket. Owner only.
    function withdrawEth(string calldata bucket, address to, uint256 amount) external onlyOwner {
        require(to != address(0), "zero to");
        bytes32 b = keccak256(bytes(bucket));
        if (b == keccak256("ops"))       { require(ethBuckets.ops >= amount);       ethBuckets.ops -= amount; }
        else if (b == keccak256("liquidity")) { require(ethBuckets.liquidity >= amount); ethBuckets.liquidity -= amount; }
        else if (b == keccak256("reserve"))   { require(ethBuckets.reserve >= amount);   ethBuckets.reserve -= amount; }
        else if (b == keccak256("founder"))   { require(ethBuckets.founder >= amount);   ethBuckets.founder -= amount; }
        else revert("invalid bucket");

        (bool ok, ) = to.call{value: amount}("");
        require(ok, "eth transfer failed");
        emit EthWithdrawn(to, amount, bucket);
    }

    /// @notice Withdraw BRDG from a specific bucket. Owner only.
    function withdrawBrdg(string calldata bucket, address to, uint256 amount) external onlyOwner {
        require(to != address(0), "zero to");
        bytes32 b = keccak256(bytes(bucket));
        if (b == keccak256("ops"))       { require(brdgBuckets.ops >= amount);       brdgBuckets.ops -= amount; }
        else if (b == keccak256("liquidity")) { require(brdgBuckets.liquidity >= amount); brdgBuckets.liquidity -= amount; }
        else if (b == keccak256("reserve"))   { require(brdgBuckets.reserve >= amount);   brdgBuckets.reserve -= amount; }
        else if (b == keccak256("founder"))   { require(brdgBuckets.founder >= amount);   brdgBuckets.founder -= amount; }
        else revert("invalid bucket");

        brdg.safeTransfer(to, amount);
        emit BrdgWithdrawn(to, amount, bucket);
    }

    /// @notice View all bucket balances.
    function bucketBalances() external view returns (
        uint256 opsEth, uint256 liqEth, uint256 resEth, uint256 fndEth,
        uint256 opsBrdg, uint256 liqBrdg, uint256 resBrdg, uint256 fndBrdg
    ) {
        return (
            ethBuckets.ops, ethBuckets.liquidity, ethBuckets.reserve, ethBuckets.founder,
            brdgBuckets.ops, brdgBuckets.liquidity, brdgBuckets.reserve, brdgBuckets.founder
        );
    }

    function _splitEth(uint256 amount) internal {
        ethBuckets.ops       += (amount * OPS_BPS)     / 10000;
        ethBuckets.liquidity += (amount * LIQ_BPS)     / 10000;
        ethBuckets.reserve   += (amount * RESERVE_BPS) / 10000;
        ethBuckets.founder   += (amount * FOUNDER_BPS) / 10000;
        totalEthDeposited += amount;
    }
}
