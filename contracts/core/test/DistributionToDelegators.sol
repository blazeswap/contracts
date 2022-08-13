// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import '../interfaces/flare/IDistributionToDelegators.sol';
import '../interfaces/flare/IWNat.sol';
import '../../shared/libraries/TransferHelper.sol';

contract DistributionToDelegators is IDistributionToDelegators {
    address public immutable wNat;

    constructor(address _wNat) {
        wNat = _wNat;
    }

    receive() external payable {}
}
