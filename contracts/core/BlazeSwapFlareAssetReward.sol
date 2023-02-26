// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import './interfaces/IBlazeSwapFactory.sol';
import './interfaces/IBlazeSwapFlareAssetReward.sol';
import './interfaces/IBlazeSwapFlareAssetRewardPlugin.sol';
import './interfaces/IBlazeSwapPair.sol';
import './interfaces/IIBlazeSwapReward.sol';

import '../shared/libraries/TransferHelper.sol';
import '../shared/DelegatedCalls.sol';
import '../shared/ReentrancyLock.sol';

import './libraries/BlazeSwapRewardLibrary.sol';
import './libraries/Math.sol';

import './BlazeSwapDelegation.sol';

library BlazeSwapFlareAssetRewardStorage {
    bytes32 internal constant STORAGE_SLOT = keccak256('blazeswap.storage.BlazeSwapFlareAssetReward');

    struct FlareAssetReward {
        uint256[] votePowerBlock;
        uint256 remainingAmount;
        uint256 remainingWeight;
    }

    struct Layout {
        address[] flareAsset;
        mapping(uint256 => FlareAssetReward) pendingRewards;
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

contract BlazeSwapFlareAssetReward is IBlazeSwapFlareAssetReward, IIBlazeSwapReward, ReentrancyLock, DelegatedCalls {
    function initialize(address _plugin) external onlyDelegatedCall {
        IBlazeSwapFlareAssetRewardPlugin plugin = IBlazeSwapFlareAssetRewardPlugin(_plugin);

        BlazeSwapPairStorage.Layout storage s = BlazeSwapPairStorage.layout();
        BlazeSwapFlareAssetRewardStorage.Layout storage l = BlazeSwapFlareAssetRewardStorage.layout();
        if (s.type0 == TokenType.FlareAsset) {
            l.flareAsset.push(s.token0);
        }
        if (s.type1 == TokenType.FlareAsset) {
            l.flareAsset.push(s.token1);
        }
        l.testValue1 = plugin.testValue1() * 2;
        l.testValue2 = plugin.testValue2();
    }

    function flareAssets() external view onlyDelegatedCall returns (address[] memory) {
        return BlazeSwapFlareAssetRewardStorage.layout().flareAsset;
    }

    function flareAssetConfigParams() external view onlyDelegatedCall returns (uint256, string memory) {
        BlazeSwapFlareAssetRewardStorage.Layout storage l = BlazeSwapFlareAssetRewardStorage.layout();
        return (l.testValue1, l.testValue2);
    }

    function unclaimedRewards() public view onlyDelegatedCall returns (uint256 totalRewards) {}

    function pluginSelectors() private pure returns (bytes4[] memory s) {
        s = new bytes4[](3);
        s[0] = IBlazeSwapFlareAssetReward.flareAssets.selector;
        s[1] = IBlazeSwapFlareAssetReward.flareAssetConfigParams.selector;
    }

    function pluginMetadata() external pure returns (bytes4[] memory selectors, bytes4 interfaceId) {
        selectors = pluginSelectors();
        interfaceId = type(IBlazeSwapFlareAssetReward).interfaceId;
    }
}
