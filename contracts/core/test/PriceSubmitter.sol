// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import '../interfaces/flare/IPriceSubmitter.sol';
import './FtsoManager.sol';

contract PriceSubmitter is IPriceSubmitter {
    address private ftsoManager;

    function initialize(address _wNat) external {
        ftsoManager = address(new FtsoManager(_wNat));
    }

    function getFtsoManager() external view returns (address) {
        return ftsoManager;
    }
}
