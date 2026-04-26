// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title PaymentAdapter — stablecoin off-ramp to banking rails
 * @dev Off-chain processor listens for OffRampRequested and completes via /api/treasury.
 */
contract PaymentAdapter is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant ADMIN_ROLE    = keccak256("ADMIN_ROLE");
    bytes32 public constant PROCESSOR_ROLE = keccak256("PROCESSOR_ROLE");

    IERC20 public stable;

    struct Request {
        address user;
        uint256 amount;
        bytes32 refHash; // hash of bank data kept off-chain (PII-safe)
        uint8   status;  // 0 pending, 1 settled, 2 refunded
    }

    uint256 public nextId;
    mapping(uint256 => Request) public requests;

    event OffRampRequested(uint256 indexed id, address indexed user, uint256 amount, bytes32 refHash);
    event OffRampSettled(uint256 indexed id);
    event OffRampRefunded(uint256 indexed id);

    constructor(address _stable, address admin) {
        require(_stable != address(0) && admin != address(0), "zero addr");
        stable = IERC20(_stable);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
    }

    function offRamp(uint256 amount, bytes32 refHash) external nonReentrant returns (uint256 id) {
        require(amount > 0, "zero");
        stable.safeTransferFrom(msg.sender, address(this), amount);
        id = ++nextId;
        requests[id] = Request(msg.sender, amount, refHash, 0);
        emit OffRampRequested(id, msg.sender, amount, refHash);
    }

    function settle(uint256 id) external onlyRole(PROCESSOR_ROLE) nonReentrant {
        Request storage r = requests[id];
        require(r.status == 0, "not pending");
        r.status = 1;
        emit OffRampSettled(id);
    }

    function refund(uint256 id) external onlyRole(PROCESSOR_ROLE) nonReentrant {
        Request storage r = requests[id];
        require(r.status == 0, "not pending");
        r.status = 2;
        stable.safeTransfer(r.user, r.amount);
        emit OffRampRefunded(id);
    }

    function sweep(address to, uint256 amount) external onlyRole(ADMIN_ROLE) {
        stable.safeTransfer(to, amount);
    }
}
