// SPDX-License-Identifier: BUSL-1.1
pragma solidity >=0.7.5;
pragma abicoder v2;

interface IBlazeSwapPlugin {
    function implementation() external view returns (address);
}
