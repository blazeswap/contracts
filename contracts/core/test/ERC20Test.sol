// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import './ERC20.sol';

contract ERC20Test is ERC20 {
    constructor(uint256 _totalSupply) ERC20('Test Token', 'TT', 18) {
        _mint(msg.sender, _totalSupply);
    }
}
