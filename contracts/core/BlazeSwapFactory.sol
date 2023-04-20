// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import './interfaces/IBlazeSwapFactory.sol';
import './BlazeSwapBaseFactory.sol';
import './BlazeSwapPair.sol';

contract BlazeSwapFactory is IBlazeSwapFactory, BlazeSwapBaseFactory {
    constructor(address _manager) BlazeSwapBaseFactory(_manager) {}

    function pairCreationCode() internal pure virtual override returns (bytes memory code) {
        code = type(BlazeSwapPair).creationCode;
    }

    function initializePair(address pair, address token0, address token1) internal virtual override {
        super.initializePair(pair, token0, token1);
        IBlazeSwapManager m = IBlazeSwapManager(manager);
        m.setPluginsForPair(pair, token0, token1);
    }
}
