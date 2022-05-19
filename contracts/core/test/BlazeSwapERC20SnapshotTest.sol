// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import '../BlazeSwapERC20Snapshot.sol';

contract BlazeSwapERC20SnapshotTest is BlazeSwapERC20Snapshot {
    constructor(uint256 _totalSupply) {
        _mint(msg.sender, _totalSupply);
    }

    function burn(uint256 _amount) external {
        _burn(msg.sender, _amount);
    }
}
