// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./IStrategy.sol";

/**
 * @title Vault — Internal economy: shares + L1/L2/L3 risk buckets
 * @notice Accounting only. No yield logic, no bridging. Allocates to strategies per bucket.
 */
contract Vault is ReentrancyGuard, AccessControl, Pausable {
    using SafeERC20 for IERC20;

    bytes32 public constant ADMIN_ROLE    = keccak256("ADMIN_ROLE");
    bytes32 public constant KEEPER_ROLE   = keccak256("KEEPER_ROLE");
    bytes32 public constant STRATEGY_ROLE = keccak256("STRATEGY_ROLE");

    IERC20 public immutable token;

    struct Bucket {
        address strategy;    // may be address(0) = idle
        uint256 allocation;  // basis points (0-10000)
        uint256 deposited;   // principal routed to this bucket
        uint256 yieldAccrued;
        uint256 cap;         // 0 = uncapped
    }

    // Bucket 0 = L1 stable, 1 = L2 balanced, 2 = L3 aggressive
    mapping(uint256 => Bucket) public buckets;
    uint256 public bucketCount;

    mapping(address => uint256) public shares;
    uint256 public totalShares;
    uint256 public totalAssets;

    event Deposited(address indexed user, uint256 amount, uint256 sharesMinted);
    event Withdrawn(address indexed user, uint256 amount, uint256 sharesBurned);
    event BucketSet(uint256 indexed id, address strategy, uint256 allocation, uint256 cap);
    event Allocated(uint256 indexed bucketId, uint256 amount);
    event Harvested(uint256 indexed bucketId, uint256 profit);

    constructor(address _token, address admin) {
        require(_token != address(0) && admin != address(0), "zero addr");
        token = IERC20(_token);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
    }

    function setBucket(uint256 id, address strategy, uint256 allocationBps, uint256 cap)
        external onlyRole(ADMIN_ROLE)
    {
        require(allocationBps <= 10000, "bps>10000");
        buckets[id] = Bucket({
            strategy: strategy,
            allocation: allocationBps,
            deposited: buckets[id].deposited,
            yieldAccrued: buckets[id].yieldAccrued,
            cap: cap
        });
        if (id >= bucketCount) bucketCount = id + 1;
        if (strategy != address(0)) _grantRole(STRATEGY_ROLE, strategy);
        emit BucketSet(id, strategy, allocationBps, cap);
    }

    function deposit(uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "zero amount");
        uint256 minted = totalShares == 0 || totalAssets == 0
            ? amount
            : (amount * totalShares) / totalAssets;

        token.safeTransferFrom(msg.sender, address(this), amount);
        shares[msg.sender] += minted;
        totalShares        += minted;
        totalAssets        += amount;

        _allocate(amount);
        emit Deposited(msg.sender, amount, minted);
    }

    function withdraw(uint256 sharesToBurn) external nonReentrant {
        require(sharesToBurn > 0 && shares[msg.sender] >= sharesToBurn, "bad shares");
        uint256 amount = (sharesToBurn * totalAssets) / totalShares;

        shares[msg.sender] -= sharesToBurn;
        totalShares        -= sharesToBurn;
        totalAssets        -= amount;

        uint256 idle = token.balanceOf(address(this));
        if (idle < amount) _pullFromStrategies(amount - idle);

        token.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount, sharesToBurn);
    }

    function reportHarvest(uint256 bucketId, uint256 profit)
        external onlyRole(STRATEGY_ROLE)
    {
        require(buckets[bucketId].strategy == msg.sender, "not strategy");
        buckets[bucketId].yieldAccrued += profit;
        totalAssets += profit;
        emit Harvested(bucketId, profit);
    }

    function _allocate(uint256 amount) internal {
        for (uint256 i = 0; i < bucketCount; i++) {
            Bucket storage b = buckets[i];
            if (b.strategy == address(0) || b.allocation == 0) continue;
            uint256 slice = (amount * b.allocation) / 10000;
            if (slice == 0) continue;
            if (b.cap > 0 && b.deposited + slice > b.cap) {
                slice = b.cap > b.deposited ? b.cap - b.deposited : 0;
            }
            if (slice == 0) continue;
            b.deposited += slice;
            token.safeIncreaseAllowance(b.strategy, slice);
            IStrategy(b.strategy).deploy(slice);
            emit Allocated(i, slice);
        }
    }

    function _pullFromStrategies(uint256 needed) internal {
        for (uint256 i = 0; i < bucketCount && needed > 0; i++) {
            Bucket storage b = buckets[i];
            if (b.strategy == address(0) || b.deposited == 0) continue;
            uint256 pull = b.deposited >= needed ? needed : b.deposited;
            b.deposited -= pull;
            IStrategy(b.strategy).withdraw(pull);
            needed -= pull;
        }
        require(needed == 0, "insufficient liquidity");
    }

    function pause()   external onlyRole(ADMIN_ROLE) { _pause();   }
    function unpause() external onlyRole(ADMIN_ROLE) { _unpause(); }

    function bucketOf(uint256 id) external view returns (Bucket memory) { return buckets[id]; }
    function pricePerShare() external view returns (uint256) {
        return totalShares == 0 ? 1e18 : (totalAssets * 1e18) / totalShares;
    }
}
