// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import '../interfaces/flare/IAssetManagerController.sol';

contract AssetManagerController is IAssetManagerController {
    address public replacedBy;
    mapping(address => bool) public assetManagerExists;

    function addAssetManager(address _assetManager) external {
        assetManagerExists[_assetManager] = true;
    }

    function replaceWith(address replacement) external {
        replacedBy = replacement;
    }
}
