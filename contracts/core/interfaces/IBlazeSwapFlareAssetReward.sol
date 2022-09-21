// SPDX-License-Identifier: MIT
pragma solidity >=0.7.5;
pragma abicoder v2;

interface IBlazeSwapFlareAssetReward {
    function flareAssets() external view returns (address[] memory);

    function flareAssetConfigParams() external view returns (uint256, string memory);
}
