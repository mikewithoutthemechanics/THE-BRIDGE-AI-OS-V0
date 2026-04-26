// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IStrategy {
    function deploy(uint256 amount) external;
    function withdraw(uint256 amount) external;
    function harvest() external returns (uint256 profit);
    function totalAssets() external view returns (uint256);
    function vault() external view returns (address);
}
