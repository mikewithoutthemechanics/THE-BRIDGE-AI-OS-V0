// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {VestingWallet} from "@openzeppelin/contracts/finance/VestingWallet.sol";
import {VestingWalletCliff} from "@openzeppelin/contracts/finance/VestingWalletCliff.sol";

/// @title FounderVesting — 12-month cliff, 36-month linear vesting after cliff.
/// @notice Total lockup window = cliff + vest = 48 months from startTimestamp.
/// @dev Beneficiary is OpenZeppelin VestingWallet's `owner()`. Ownership may
///      only be transferred by the beneficiary themselves (Ownable).
///      Matches public/tokenomics.html "Founders & Team" row (10M BRDG, 0% TGE,
///      12-mo cliff, 36-mo linear).
contract FounderVesting is VestingWalletCliff {
    /// @param beneficiary   Address (typically a Gnosis Safe) that receives released tokens.
    /// @param startTimestamp Unix seconds at which vesting starts (cliff counts from here).
    /// @param cliffSeconds  Length of the cliff in seconds (e.g. 365 * 86400).
    /// @param durationSeconds Total duration from start (cliff + linear vesting window).
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
