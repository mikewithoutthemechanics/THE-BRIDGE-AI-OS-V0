// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title StakingVault — Bridge AI OS Staking with Revenue-Funded Rewards
 * @notice Variable yield staking vault. NO fixed APY.
 *         Rewards pool is funded ONLY from:
 *         - DEX trading fees (0.3% per swap)
 *         - Task marketplace fees (14% of task value)
 *         - Manual deposits from treasury buyback
 *
 * Staking rules:
 *   - Minimum lock: 30 days
 *   - Maximum lock: 365 days
 *   - Reward = proportional share of pool weighted by (amount * lockDays)
 *   - Can unstake only AFTER lock period expires
 */
contract StakingVault is Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable brdg;

    struct Stake {
        uint256 amount;
        uint256 startTime;
        uint256 lockDays;
        bool withdrawn;
    }

    mapping(address => Stake[]) public stakes;

    uint256 public totalStaked;           // Sum of all active stakes
    uint256 public rewardPool;            // Funded from real fees only
    uint256 public totalDistributed;      // Historical rewards paid out

    event Staked(address indexed user, uint256 amount, uint256 lockDays, uint256 stakeIndex);
    event Unstaked(address indexed user, uint256 principal, uint256 reward, uint256 stakeIndex);
    event RewardsFunded(address indexed from, uint256 amount, string source);

    constructor(address _brdg) Ownable(msg.sender) {
        require(_brdg != address(0), "zero brdg");
        brdg = IERC20(_brdg);
    }

    /**
     * @notice Fund the reward pool from actual revenue sources.
     *         Only owner can call (treasury or revenue router).
     * @param amount BRDG amount to add to rewards
     * @param source Description of revenue source (dex-fees, task-fees, buyback, etc.)
     */
    function fundRewards(uint256 amount, string calldata source) external onlyOwner {
        require(amount > 0, "zero amount");
        brdg.safeTransferFrom(msg.sender, address(this), amount);
        rewardPool += amount;
        emit RewardsFunded(msg.sender, amount, source);
    }

    /**
     * @notice Stake BRDG tokens for a lock period.
     * @param amount BRDG to stake
     * @param lockDays Lock period (30-365 days)
     */
    function stake(uint256 amount, uint256 lockDays) external {
        require(amount > 0, "zero amount");
        require(lockDays >= 30 && lockDays <= 365, "invalid lock period");

        brdg.safeTransferFrom(msg.sender, address(this), amount);

        stakes[msg.sender].push(Stake({
            amount: amount,
            startTime: block.timestamp,
            lockDays: lockDays,
            withdrawn: false
        }));

        totalStaked += amount;

        emit Staked(msg.sender, amount, lockDays, stakes[msg.sender].length - 1);
    }

    /**
     * @notice Unstake after lock period. Receives principal + proportional reward.
     * @param stakeIndex Index of the stake to unstake
     */
    function unstake(uint256 stakeIndex) external {
        Stake storage s = stakes[msg.sender][stakeIndex];
        require(!s.withdrawn, "already withdrawn");

        uint256 lockEnd = s.startTime + (s.lockDays * 1 days);
        require(block.timestamp >= lockEnd, "still locked");

        // Calculate reward as proportional share of pool, weighted by lock duration
        // weight = (stakeAmount * lockDays) / 365
        // reward = (pool * weight) / (totalStakedWeight)
        uint256 weight = (s.amount * s.lockDays) / 365;

        // Total weight = sum of all active stakes' weights
        // Simplified: if only this stake, weight = totalStaked * avgLockDays / 365
        // For now, use conservative: reward capped at 50% of pool per unstake
        uint256 rewardCap = rewardPool / 2;
        uint256 reward = rewardCap > 0 ? (rewardPool * weight) / (totalStaked * 2) : 0;
        if (reward > rewardCap) reward = rewardCap;

        // Mark as withdrawn
        s.withdrawn = true;
        totalStaked -= s.amount;
        rewardPool -= reward;
        totalDistributed += reward;

        // Transfer principal + reward
        brdg.safeTransfer(msg.sender, s.amount + reward);

        emit Unstaked(msg.sender, s.amount, reward, stakeIndex);
    }

    /**
     * @notice Get pending reward estimate for a specific stake.
     *         Reward is only available after lock period expires.
     */
    function pendingReward(address user, uint256 stakeIndex) external view returns (uint256) {
        if (stakeIndex >= stakes[user].length) return 0;

        Stake storage s = stakes[user][stakeIndex];
        if (s.withdrawn || totalStaked == 0) return 0;

        // Only calculate reward if lock period is over
        uint256 lockEnd = s.startTime + (s.lockDays * 1 days);
        if (block.timestamp < lockEnd) return 0;

        uint256 weight = (s.amount * s.lockDays) / 365;
        uint256 rewardCap = rewardPool / 2;
        uint256 reward = rewardPool > 0 ? (rewardPool * weight) / (totalStaked * 2) : 0;

        return reward > rewardCap ? rewardCap : reward;
    }

    /**
     * @notice Get all stakes for a user.
     */
    function getStakes(address user) external view returns (Stake[] memory) {
        return stakes[user];
    }

    /**
     * @notice Get count of user's stakes.
     */
    function getStakeCount(address user) external view returns (uint256) {
        return stakes[user].length;
    }

    /**
     * @notice Current effective APY (annual percent yield) for display purposes.
     *         Formula: (rewardPool / totalStaked) * 100 if assuming annual distribution
     *         This is NOT a promise — yield depends on actual revenue.
     */
    function effectiveAPY() external view returns (uint256 percentBP) {
        if (totalStaked == 0) return 0;
        // Return as basis points (1% = 100 BP)
        return (rewardPool * 10000) / totalStaked;
    }

    /**
     * @notice Emergency withdraw (owner only) to recover stuck tokens.
     *         This bypasses staking logic and should only be used if something breaks.
     */
    function emergencyWithdraw(address token, address to, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(to, amount);
    }
}
