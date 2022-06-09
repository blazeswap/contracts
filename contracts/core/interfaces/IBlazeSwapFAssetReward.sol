// SPDX-License-Identifier: MIT
pragma solidity >=0.7.5;
pragma abicoder v2;

interface IBlazeSwapFAssetReward {
    function fAssets() external view returns (address[] memory);

    function fAssetConfigParams() external view returns (uint256, string memory);
}
