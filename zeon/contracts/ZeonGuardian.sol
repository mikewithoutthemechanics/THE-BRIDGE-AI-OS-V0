// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/*
    ZeonGuardian

    Design: a watched hot wallet pre-approves MAX on this contract for every
    token it holds. If an attacker ever acquires the hot wallet's key and
    broadcasts a transferFrom(hot, attacker, X), the ZEON sentinel bot sees
    the pending tx in the mempool and broadcasts rescuePullFrom() at a higher
    gas price. The sequencer orders by gas price, so ZEON lands first and
    drains the hot wallet balance into ColdSafe — the attacker's tx then
    reverts with ERC20 "insufficient balance".

    Roles:
      owner    — deploys, can rotate sentinel/pauser/coldsafe, can add/remove
                 watched tokens, can emergency-pause.
      sentinel — the only address allowed to call rescuePullFrom. Holds ~0.001
                 ETH for gas; compromise cost = one rescue tx's worth of gas.
      pauser   — can pause/unpause rescue operations. Separate key from
                 sentinel so a sentinel-key leak can be frozen without
                 touching the cold safe.
      coldSafe — destination of every rescue. Hardware wallet or multisig.

    Notes:
      * This contract NEVER holds token balance; it only pulls hot → cold via
        the hot wallet's standing approval, then rescue is done.
      * If the hot wallet's approval is revoked, rescue obviously fails — but
        the approval is set to MAX on deployment and re-approved by the hot
        wallet as a one-time setup (see deploy-modular-vault.js).
*/

interface IERC20 {
    function balanceOf(address) external view returns (uint256);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
}

contract ZeonGuardian {
    address public owner;
    address public sentinel;
    address public pauser;
    address public coldSafe;
    bool    public paused;

    mapping(address => bool) public watchedToken;

    event Rescued(address indexed token, address indexed hot, address indexed coldSafe, uint256 amount, address sentinel);
    event Paused(address indexed by);
    event Unpaused(address indexed by);
    event SentinelRotated(address indexed oldSentinel, address indexed newSentinel);
    event PauserRotated(address indexed oldPauser, address indexed newPauser);
    event ColdSafeRotated(address indexed oldColdSafe, address indexed newColdSafe);
    event OwnerRotated(address indexed oldOwner, address indexed newOwner);
    event WatchedTokenSet(address indexed token, bool watched);

    modifier onlyOwner()    { require(msg.sender == owner,    "ZEON: not owner");    _; }
    modifier onlySentinel() { require(msg.sender == sentinel, "ZEON: not sentinel"); _; }
    modifier onlyPauser()   { require(msg.sender == pauser || msg.sender == owner, "ZEON: not pauser"); _; }
    modifier notPaused()    { require(!paused, "ZEON: paused"); _; }

    constructor(address _sentinel, address _pauser, address _coldSafe) {
        require(_sentinel != address(0) && _pauser != address(0) && _coldSafe != address(0), "ZEON: zero addr");
        owner    = msg.sender;
        sentinel = _sentinel;
        pauser   = _pauser;
        coldSafe = _coldSafe;
    }

    /* ---------- rescue (hot-path, gas-critical) ---------- */

    function rescuePullFrom(address token, address hot, uint256 amount)
        external
        onlySentinel
        notPaused
        returns (bool)
    {
        require(watchedToken[token], "ZEON: token not watched");
        require(amount > 0, "ZEON: zero amount");
        bool ok = IERC20(token).transferFrom(hot, coldSafe, amount);
        require(ok, "ZEON: transferFrom failed");
        emit Rescued(token, hot, coldSafe, amount, msg.sender);
        return true;
    }

    function rescueFullBalance(address token, address hot)
        external
        onlySentinel
        notPaused
        returns (uint256)
    {
        require(watchedToken[token], "ZEON: token not watched");
        uint256 bal = IERC20(token).balanceOf(hot);
        uint256 allow = IERC20(token).allowance(hot, address(this));
        uint256 amount = bal < allow ? bal : allow;
        require(amount > 0, "ZEON: nothing to rescue");
        bool ok = IERC20(token).transferFrom(hot, coldSafe, amount);
        require(ok, "ZEON: transferFrom failed");
        emit Rescued(token, hot, coldSafe, amount, msg.sender);
        return amount;
    }

    /* ---------- control plane ---------- */

    function pause()   external onlyPauser { paused = true;  emit Paused(msg.sender); }
    function unpause() external onlyPauser { paused = false; emit Unpaused(msg.sender); }

    function setWatchedToken(address token, bool watched) external onlyOwner {
        watchedToken[token] = watched;
        emit WatchedTokenSet(token, watched);
    }

    function rotateSentinel(address n) external onlyOwner {
        require(n != address(0), "ZEON: zero addr");
        emit SentinelRotated(sentinel, n); sentinel = n;
    }
    function rotatePauser(address n) external onlyOwner {
        require(n != address(0), "ZEON: zero addr");
        emit PauserRotated(pauser, n); pauser = n;
    }
    function rotateColdSafe(address n) external onlyOwner {
        require(n != address(0), "ZEON: zero addr");
        emit ColdSafeRotated(coldSafe, n); coldSafe = n;
    }
    function rotateOwner(address n) external onlyOwner {
        require(n != address(0), "ZEON: zero addr");
        emit OwnerRotated(owner, n); owner = n;
    }
}
