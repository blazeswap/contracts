// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import './FAsset.sol';

contract FAssetTest is FAsset {
    constructor(address _assetManager, uint256 _totalSupply) FAsset('Test FAsset', 'TFA', 18, _assetManager) {
        _mint(msg.sender, _totalSupply);
    }
}
