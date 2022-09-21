// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import './interfaces/IBlazeSwapFlareAssetRewardPlugin.sol';
import './BlazeSwapFlareAssetReward.sol';

contract BlazeSwapFlareAssetRewardPlugin is IBlazeSwapFlareAssetRewardPlugin {
    address public immutable implementation = address(new BlazeSwapFlareAssetReward());

    uint256 public immutable testValue1;
    string public testValue2;

    constructor(uint256 _testValue1, string memory _testValue2) {
        testValue1 = _testValue1;
        testValue2 = _testValue2;
    }
}
