// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import '../BlazeSwapERC20.sol';

contract BlazeSwapERC20Test is BlazeSwapERC20 {
    constructor(uint256 _totalSupply) {
        _mint(msg.sender, _totalSupply);
    }
}
