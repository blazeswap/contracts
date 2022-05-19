// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import './DeflatingERC20.sol';

contract DeflatingERC20Test is DeflatingERC20 {
    constructor(uint256 _totalSupply) DeflatingERC20('Deflating Test Token', 'DTT', 18) {
        _mint(msg.sender, _totalSupply);
    }
}
