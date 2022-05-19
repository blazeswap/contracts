// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import './interfaces/IBlazeSwapFactory.sol';
import './interfaces/IBlazeSwapFAssetReward.sol';
import './interfaces/IBlazeSwapFAssetRewardPlugin.sol';
import './interfaces/IBlazeSwapPair.sol';
import './interfaces/IIBlazeSwapReward.sol';

import '../shared/libraries/TransferHelper.sol';
import '../shared/DelegatedCalls.sol';
import '../shared/ReentrancyLock.sol';

import './libraries/BlazeSwapFlareLibrary.sol';
import './libraries/BlazeSwapRewardLibrary.sol';
import './libraries/Math.sol';

import './BlazeSwapDelegation.sol';

library BlazeSwapFAssetRewardStorage {
    bytes32 internal constant STORAGE_SLOT = keccak256('blazeswap.storage.BlazeSwapFAssetReward');

    struct FAssetReward {
        uint256[] votePowerBlock;
        uint256 remainingAmount;
        uint256 remainingWeight;
    }

    struct Layout {
        address[] fAsset;
        mapping(uint256 => FAssetReward) pendingRewards;
        mapping(address => mapping(uint256 => uint256)) claimedRewards;
        uint256 testValue1;
        string testValue2;
    }

    function layout() internal pure returns (Layout storage l) {
        bytes32 slot = STORAGE_SLOT;
        assembly {
            l.slot := slot
        }
    }
}

contract BlazeSwapFAssetReward is IBlazeSwapFAssetReward, IIBlazeSwapReward, ReentrancyLock, DelegatedCalls {
    function initialize(address _plugin) external onlyDelegatedCall {
        IBlazeSwapFAssetRewardPlugin plugin = IBlazeSwapFAssetRewardPlugin(_plugin);

        BlazeSwapPairStorage.Layout storage s = BlazeSwapPairStorage.layout();
        BlazeSwapFAssetRewardStorage.Layout storage l = BlazeSwapFAssetRewardStorage.layout();
        if (s.type0 == TokenType.FAsset) {
            l.fAsset.push(s.token0);
        }
        if (s.type1 == TokenType.FAsset) {
            l.fAsset.push(s.token1);
        }
        l.testValue1 = plugin.testValue1() * 2;
        l.testValue2 = plugin.testValue2();
    }

    function fAssets() external view onlyDelegatedCall returns (address[] memory) {
        return BlazeSwapFAssetRewardStorage.layout().fAsset;
    }

    function fAssetConfigParams() external view onlyDelegatedCall returns (uint256, string memory) {
        BlazeSwapFAssetRewardStorage.Layout storage l = BlazeSwapFAssetRewardStorage.layout();
        return (l.testValue1, l.testValue2);
    }

    function unclaimedRewards() public view onlyDelegatedCall returns (uint256 totalRewards) {}

    function pluginSelectors() private pure returns (bytes4[] memory s) {
        s = new bytes4[](3);
        s[0] = IBlazeSwapFAssetReward.fAssets.selector;
        s[1] = IBlazeSwapFAssetReward.fAssetConfigParams.selector;
    }

    function pluginMetadata() external pure returns (bytes4[] memory selectors, bytes4 interfaceId) {
        selectors = pluginSelectors();
        interfaceId = type(IBlazeSwapFAssetReward).interfaceId;
    }
}
