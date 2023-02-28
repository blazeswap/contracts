// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import '../libraries/FlareLibrary.sol';

contract FlareLibraryTest {
    using FlareLibrary for IFtsoManager;
    using FlareLibrary for IDistributionToDelegators;

    function getDistribution() external view returns (IDistributionToDelegators) {
        return FlareLibrary.getDistribution();
    }

    function getFlareAssetRegistry() external view returns (IFlareAssetRegistry) {
        return FlareLibrary.getFlareAssetRegistry();
    }

    function getFtsoManager() external view returns (IFtsoManager) {
        return FlareLibrary.getFtsoManager();
    }

    function getFtsoRewardManager() external view returns (IFtsoRewardManager) {
        return FlareLibrary.getFtsoRewardManager();
    }

    function getActiveFtsoRewardManagers(
        uint256 backToEpoch
    ) external view returns (FlareLibrary.FtsoRewardManagerWithEpochs[] memory) {
        return FlareLibrary.getActiveFtsoRewardManagers(backToEpoch);
    }

    function getWNat() external view returns (IWNat) {
        return FlareLibrary.getWNat();
    }

    function getCurrentFtsoRewardEpoch() external view returns (uint256) {
        return FlareLibrary.getFtsoManager().getCurrentFtsoRewardEpoch();
    }

    function getActiveFtsoRewardEpochsExclusive(
        uint256 minEpoch
    ) external view returns (FlareLibrary.Range memory epochsRange) {
        return FlareLibrary.getFtsoManager().getActiveFtsoRewardEpochsExclusive(minEpoch);
    }

    function getActiveAirdropMonthsExclusive(
        uint256 minMonth,
        bool toDistributeOnly
    ) external view returns (FlareLibrary.Range memory monthsRange) {
        return FlareLibrary.getDistribution().getActiveAirdropMonthsExclusive(minMonth, toDistributeOnly);
    }
}
