// SPDX-License-Identifier: BUSL-1.1
pragma solidity >=0.7.5;
pragma abicoder v2;

import './IBlazeSwapPlugin.sol';

interface IBlazeSwapFlareAssetRewardPlugin is IBlazeSwapPlugin {
    function testValue1() external view returns (uint256);

    function testValue2() external view returns (string memory);
}
