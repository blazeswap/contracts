// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import '../interfaces/flare/IDistributionTreasury.sol';
import '../interfaces/flare/IDistributionToDelegators.sol';
import '../interfaces/flare/IPriceSubmitter.sol';
import '../interfaces/flare/IFtsoManager.sol';
import '../interfaces/flare/IFtsoRewardManager.sol';
import '../interfaces/flare/IWNat.sol';

library BlazeSwapFlareLibrary {
    IPriceSubmitter private constant priceSubmitter = IPriceSubmitter(0x1000000000000000000000000000000000000003);
    IDistributionTreasury private constant distributionTreasury =
        IDistributionTreasury(0x1000000000000000000000000000000000000004);

    function getDistribution() internal view returns (IDistributionToDelegators distribution) {
        address curDistribution = distributionTreasury.selectedDistribution();
        if (curDistribution != address(0) && curDistribution == distributionTreasury.distributionToDelegators()) {
            distribution = IDistributionToDelegators(curDistribution);
        }
    }

    function getFtsoManager() internal view returns (IFtsoManager) {
        return IFtsoManager(priceSubmitter.getFtsoManager());
    }

    function getFtsoRewardManager(IFtsoManager ftsoManager) internal view returns (IFtsoRewardManager) {
        return IFtsoRewardManager(ftsoManager.rewardManager());
    }

    function getWNat(IFtsoRewardManager ftsoRewardManager) internal view returns (IWNat) {
        return IWNat(ftsoRewardManager.wNat());
    }
}
