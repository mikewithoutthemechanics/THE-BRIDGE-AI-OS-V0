// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {VestingWallet} from "@openzeppelin/contracts/finance/VestingWallet.sol";
import {VestingWalletCliff} from "@openzeppelin/contracts/finance/VestingWalletCliff.sol";

/// @title TreasuryOpsTimelock — 3-month cliff, 36-month linear vesting.
/// @notice Matches public/tokenomics.html "Treasury Operations" row (15M BRDG,
///         0% TGE, 3-mo cliff, 36-mo linear).
/// @dev Beneficiary is the TreasuryVault contract (or the PROTOCOL_SAFE; both
///      are acceptable — the key property is that ops funds are drip-fed, not
///      instantly available). Total duration = cliff + vest = 39 months from
///      startTimestamp.
contract TreasuryOpsTimelock is VestingWalletCliff {
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
