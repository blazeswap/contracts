// SPDX-License-Identifier: MIT
pragma solidity >=0.5.0;

interface IAssetManagerController {
    function assetManagerExists(address _assetManager) external view returns (bool);

    function replacedBy() external view returns (address);
}
