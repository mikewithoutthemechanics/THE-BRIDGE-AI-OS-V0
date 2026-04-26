// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IBridge {
    function sendToL2(address token, address to, uint256 amount, uint256 chainId) external payable;
}

/**
 * @title BridgeRouter — cross-layer liquidity (L1 ↔ L2 ↔ L3)
 * @dev Vault never bridges directly. Admin whitelists bridges per chain.
 */
contract BridgeRouter is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant ADMIN_ROLE  = keccak256("ADMIN_ROLE");
    bytes32 public constant ROUTER_ROLE = keccak256("ROUTER_ROLE");

    mapping(uint256 => address) public bridgeOf; // chainId → bridge adapter
    mapping(uint256 => bool) public chainEnabled;

    event BridgeSet(uint256 indexed chainId, address bridge);
    event Dispatched(uint256 indexed chainId, address token, address target, uint256 amount);

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
    }

    function setBridge(uint256 chainId, address bridgeAdapter, bool enabled)
        external onlyRole(ADMIN_ROLE)
    {
        bridgeOf[chainId]  = bridgeAdapter;
        chainEnabled[chainId] = enabled;
        emit BridgeSet(chainId, bridgeAdapter);
    }

    function bridge(address token, uint256 amount, uint256 targetChain, address target)
        external payable nonReentrant onlyRole(ROUTER_ROLE)
    {
        require(chainEnabled[targetChain], "chain disabled");
        address adapter = bridgeOf[targetChain];
        require(adapter != address(0), "no bridge");

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        IERC20(token).safeIncreaseAllowance(adapter, amount);
        IBridge(adapter).sendToL2{value: msg.value}(token, target, amount, targetChain);

        emit Dispatched(targetChain, token, target, amount);
    }
}
