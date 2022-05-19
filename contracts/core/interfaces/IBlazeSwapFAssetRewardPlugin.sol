// SPDX-License-Identifier: BUSL-1.1
pragma solidity >=0.5.0;

import './IBlazeSwapPlugin.sol';

interface IBlazeSwapFAssetRewardPlugin is IBlazeSwapPlugin {
    function testValue1() external view returns (uint256);

    function testValue2() external view returns (string memory);
}
