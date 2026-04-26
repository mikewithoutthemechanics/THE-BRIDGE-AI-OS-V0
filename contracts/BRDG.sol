// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title BRDG Token — Bridge AI OS Utility Token
 * @notice ERC-20 on Linea (chain 59144). 100M fixed cap, 1% burn on transfer.
 *
 * Deployment:
 *   - Chain: Linea Mainnet (59144)
 *   - RPC: https://rpc.linea.build
 *   - Treasury: 0xF22Bc18487764FEe106ca5Fb2EE27b11FDcB3756
 *   - Initial mint: 10M to treasury
 *   - Max supply: 100M (hard cap, enforced in mint())
 */
contract BRDG is ERC20, Ownable {
    uint256 public constant MAX_SUPPLY = 100_000_000 * 1e18; // 100M
    uint256 public constant BURN_BPS = 100; // 1% = 100 basis points
    uint256 public totalBurned;

    // Addresses exempt from burn (treasury, DEX pools, staking vault)
    mapping(address => bool) public burnExempt;

    event BurnExemptSet(address indexed account, bool exempt);

    constructor(address treasury) ERC20("Bridge AI", "BRDG") Ownable(msg.sender) {
        require(treasury != address(0), "zero treasury");
        burnExempt[treasury] = true;
        _mint(treasury, 10_000_000 * 1e18); // 10M initial to treasury
    }

    /// @notice Mint new tokens. Only owner (governance). Enforces MAX_SUPPLY.
    function mint(address to, uint256 amount) external onlyOwner {
        require(totalSupply() + amount <= MAX_SUPPLY, "exceeds max supply");
        _mint(to, amount);
    }

    /// @notice Set burn exemption for an address (DEX pools, staking vaults).
    function setBurnExempt(address account, bool exempt) external onlyOwner {
        burnExempt[account] = exempt;
        emit BurnExemptSet(account, exempt);
    }

    /// @dev Override transfer to apply 1% burn unless sender or recipient is exempt.
    function _update(address from, address to, uint256 amount) internal override {
        if (from == address(0) || to == address(0) || burnExempt[from] || burnExempt[to]) {
            super._update(from, to, amount);
            return;
        }

        uint256 burnAmount = (amount * BURN_BPS) / 10_000;
        uint256 sendAmount = amount - burnAmount;

        super._update(from, address(0), burnAmount); // burn
        totalBurned += burnAmount;

        super._update(from, to, sendAmount); // transfer remainder
    }
}
