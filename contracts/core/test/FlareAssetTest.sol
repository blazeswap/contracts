// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import './FlareAsset.sol';

contract FlareAssetTest is FlareAsset {
    constructor(uint256 _totalSupply) FlareAsset('Test FlareAsset', 'TFA', 18) {
        _mint(msg.sender, _totalSupply);
    }
}
