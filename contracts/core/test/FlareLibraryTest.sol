// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import '../libraries/FlareLibrary.sol';

contract FlareLibraryTest {
    using FlareLibrary for IFlareContractRegistry;
    using FlareLibrary for IFtsoManager;
    using FlareLibrary for IDistributionToDelegators;

    IFlareContractRegistry private immutable registry;

    constructor(address _registry) {
        registry = IFlareContractRegistry(_registry);
    }

    function getDistribution() external view returns (IDistributionToDelegators) {
        return registry.getDistribution();
    }

    function getFlareAssetRegistry() external view returns (IFlareAssetRegistry) {
        return registry.getFlareAssetRegistry();
    }

    function getFtsoManager() external view returns (IFtsoManager) {
        return registry.getFtsoManager();
    }

    function getFtsoRewardManager() external view returns (IFtsoRewardManager) {
        return registry.getFtsoRewardManager();
    }

    function getActiveFtsoRewardManagers(
        uint256 backToEpoch
    ) external view returns (FlareLibrary.FtsoRewardManagerWithEpochs[] memory) {
        return registry.getActiveFtsoRewardManagers(backToEpoch);
    }

    function getWNat() external view returns (IWNat) {
        return registry.getWNat();
    }

    function getCurrentFtsoRewardEpoch() external view returns (uint256) {
        return registry.getFtsoManager().getCurrentFtsoRewardEpoch();
    }

    function getActiveFtsoRewardEpochsExclusive(
        uint256 minEpoch
    ) external view returns (FlareLibrary.Range memory epochsRange) {
        return registry.getFtsoManager().getActiveFtsoRewardEpochsExclusive(minEpoch);
    }

    function getActiveAirdropMonthsExclusive(
        uint256 minMonth,
        bool toDistributeOnly
    ) external view returns (FlareLibrary.Range memory monthsRange) {
        return registry.getDistribution().getActiveAirdropMonthsExclusive(minMonth, toDistributeOnly);
    }
}
