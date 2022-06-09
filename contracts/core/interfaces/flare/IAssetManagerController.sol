// SPDX-License-Identifier: MIT
pragma solidity >=0.7.5;
pragma abicoder v2;

interface IAssetManagerController {
    function assetManagerExists(address _assetManager) external view returns (bool);

    function replacedBy() external view returns (address);
}
