// SPDX-License-Identifier: MIT
pragma solidity >=0.7.5;
pragma abicoder v2;

interface IDistributionTreasury {
    function selectedDistribution() external view returns (address);

    function distributionToDelegators() external view returns (address);
}
