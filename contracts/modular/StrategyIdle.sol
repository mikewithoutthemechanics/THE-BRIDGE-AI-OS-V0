// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./StrategyBase.sol";

/// @notice Bucket 0 / L1 default: holds principal, zero external risk.
contract StrategyIdle is StrategyBase {
    constructor(address _vault, uint256 _bucketId, address _asset)
        StrategyBase(_vault, _bucketId, _asset) {}

    function totalAssets() external view override returns (uint256) {
        return asset.balanceOf(address(this));
    }
}
