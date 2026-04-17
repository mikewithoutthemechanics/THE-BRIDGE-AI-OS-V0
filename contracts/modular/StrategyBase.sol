// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./IStrategy.sol";

interface IVaultReport {
    function reportHarvest(uint256 bucketId, uint256 profit) external;
}

/**
 * @title StrategyBase — extend this to integrate Aave/Compound/LP/RWA
 * @dev Placeholder holds idle funds. Override _deploy/_withdraw/_harvest.
 */
abstract contract StrategyBase is IStrategy, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public immutable override vault;
    uint256 public immutable bucketId;
    IERC20  public immutable asset;
    uint256 public slippageBps = 50; // 0.5% default

    modifier onlyVault() {
        require(msg.sender == vault, "not vault");
        _;
    }

    constructor(address _vault, uint256 _bucketId, address _asset) Ownable(msg.sender) {
        require(_vault != address(0) && _asset != address(0), "zero addr");
        vault   = _vault;
        bucketId = _bucketId;
        asset   = IERC20(_asset);
    }

    function setSlippage(uint256 bps) external onlyOwner {
        require(bps <= 1000, "slippage too high");
        slippageBps = bps;
    }

    function deploy(uint256 amount) external override onlyVault nonReentrant {
        asset.safeTransferFrom(vault, address(this), amount);
        _deploy(amount);
    }

    function withdraw(uint256 amount) external override onlyVault nonReentrant {
        _withdraw(amount);
        asset.safeTransfer(vault, amount);
    }

    function harvest() external override nonReentrant returns (uint256 profit) {
        profit = _harvest();
        if (profit > 0) {
            asset.safeTransfer(vault, profit);
            IVaultReport(vault).reportHarvest(bucketId, profit);
        }
    }

    function _deploy(uint256 amount)   internal virtual {}
    function _withdraw(uint256 amount) internal virtual {}
    function _harvest() internal virtual returns (uint256) { return 0; }
}
