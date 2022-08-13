// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import '../interfaces/flare/IDistributionTreasury.sol';
import './DistributionToDelegators.sol';

contract DistributionTreasury is IDistributionTreasury {
    address public selectedDistribution;
    address public distributionToDelegators;

    function initialize(address _wNat) external {
        distributionToDelegators = address(new DistributionToDelegators(_wNat));
    }

    function switchToDistributionToDelegators() external {
        selectedDistribution = distributionToDelegators;
    }
}
