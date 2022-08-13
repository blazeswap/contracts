// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import './interfaces/IBlazeSwapExecutorManager.sol';
import './interfaces/IBlazeSwapAirdrop.sol';
import './interfaces/IBlazeSwapPair.sol';
import './interfaces/IIBlazeSwapReward.sol';

import '../shared/DelegatedCalls.sol';
import '../shared/ReentrancyLock.sol';

import './libraries/BlazeSwapFlareLibrary.sol';
import './libraries/BlazeSwapRewardLibrary.sol';
import './libraries/Math.sol';

import './BlazeSwapDelegation.sol';

contract BlazeSwapAirdrop is IBlazeSwapAirdrop, IIBlazeSwapReward, ReentrancyLock, DelegatedCalls {
    function initialize(address) external onlyDelegatedCall {}

    function test() external onlyDelegatedCall {}

    function unclaimedRewards() public view onlyDelegatedCall returns (uint256 totalRewards) {}

    function pluginSelectors() private pure returns (bytes4[] memory s) {
        s = new bytes4[](0);
    }

    function pluginMetadata() external pure returns (bytes4[] memory selectors, bytes4 interfaceId) {
        selectors = pluginSelectors();
        interfaceId = type(IBlazeSwapAirdrop).interfaceId;
    }
}
