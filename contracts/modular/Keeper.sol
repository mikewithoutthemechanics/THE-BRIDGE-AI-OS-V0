// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "./IStrategy.sol";

/**
 * @title Keeper — bot-triggered harvest/rebalance (no user gas)
 */
contract Keeper is AccessControl {
    bytes32 public constant ADMIN_ROLE  = keccak256("ADMIN_ROLE");
    bytes32 public constant BOT_ROLE    = keccak256("BOT_ROLE");

    address[] public strategies;

    event StrategyAdded(address strategy);
    event StrategyRemoved(address strategy);
    event HarvestRun(address strategy, uint256 profit);

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
        _grantRole(BOT_ROLE, admin);
    }

    function addStrategy(address s) external onlyRole(ADMIN_ROLE) {
        strategies.push(s);
        emit StrategyAdded(s);
    }

    function removeStrategy(uint256 idx) external onlyRole(ADMIN_ROLE) {
        require(idx < strategies.length, "oob");
        address removed = strategies[idx];
        strategies[idx] = strategies[strategies.length - 1];
        strategies.pop();
        emit StrategyRemoved(removed);
    }

    function run() external onlyRole(BOT_ROLE) {
        for (uint256 i = 0; i < strategies.length; i++) {
            try IStrategy(strategies[i]).harvest() returns (uint256 profit) {
                emit HarvestRun(strategies[i], profit);
            } catch { /* skip failing strategies */ }
        }
    }

    function count() external view returns (uint256) { return strategies.length; }
}
