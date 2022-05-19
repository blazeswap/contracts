// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import '../interfaces/flare/IPriceSubmitter.sol';
import '../interfaces/flare/IFtsoManager.sol';
import '../interfaces/flare/IFtsoRewardManager.sol';
import '../interfaces/flare/IWNat.sol';

library BlazeSwapFlareLibrary {
    IPriceSubmitter private constant priceSubmitter = IPriceSubmitter(0x1000000000000000000000000000000000000003);

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
