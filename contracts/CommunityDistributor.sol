// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {VestingWallet} from "@openzeppelin/contracts/finance/VestingWallet.sol";
import {VestingWalletCliff} from "@openzeppelin/contracts/finance/VestingWalletCliff.sol";

/// @title CommunityDistributor — 1-month cliff, 36-month linear, 5% TGE unlock.
/// @notice Matches public/tokenomics.html "Community & Growth" row (15M BRDG).
/// @dev The 5% TGE portion is NOT held here; it is minted directly to the
///      COMMUNITY_SAFE at TGE. The remaining 95% (14.25M) is locked here with
///      a 1-month cliff and 36-month linear vesting after the cliff. Total
///      duration = cliff + vest = 37 months from startTimestamp.
contract CommunityDistributor is VestingWalletCliff {
    constructor(
        address beneficiary,
        uint64 startTimestamp,
        uint64 cliffSeconds,
        uint64 durationSeconds
    )
        VestingWallet(beneficiary, startTimestamp, durationSeconds)
        VestingWalletCliff(cliffSeconds)
    {}
}
