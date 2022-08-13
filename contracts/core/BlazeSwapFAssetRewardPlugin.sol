// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import './interfaces/IBlazeSwapFAssetRewardPlugin.sol';
import './BlazeSwapFAssetReward.sol';

contract BlazeSwapFAssetRewardPlugin is IBlazeSwapFAssetRewardPlugin {
    address public immutable implementation = address(new BlazeSwapFAssetReward());

    uint256 public immutable testValue1;
    string public testValue2;

    constructor(uint256 _testValue1, string memory _testValue2) {
        testValue1 = _testValue1;
        testValue2 = _testValue2;
    }
}
