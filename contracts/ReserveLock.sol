// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {VestingWallet} from "@openzeppelin/contracts/finance/VestingWallet.sol";

/// @title ReserveLock — pure 12-month asset timelock (no linear vesting).
/// @notice Matches public/tokenomics.html "Strategic Reserve" row (5M BRDG,
///         12-mo cliff, governance-unlocked afterwards).
/// @dev OpenZeppelin's VestingWallet with duration = 0 behaves as a pure
///      timelock: 0% released before `startTimestamp`, 100% released at or
///      after it. Set `startTimestamp` = TGE + 12 months.
contract ReserveLock is VestingWallet {
    constructor(address beneficiary, uint64 unlockTimestamp)
        VestingWallet(beneficiary, unlockTimestamp, 0)
    {}
}
