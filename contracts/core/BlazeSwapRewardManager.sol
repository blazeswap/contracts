// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import '../shared/libraries/TransferHelper.sol';
import '../shared/ParentRelation.sol';
import './interfaces/flare/IWNat.sol';
import './interfaces/IBlazeSwapManager.sol';
import './interfaces/IBlazeSwapDelegationPlugin.sol';
import './interfaces/IIBlazeSwapRewardManager.sol';
import './libraries/Delegator.sol';
import './libraries/FlareLibrary.sol';

contract BlazeSwapRewardManager is IIBlazeSwapRewardManager, ParentRelation {
    using FlareLibrary for IFlareContractRegistry;
    using FlareLibrary for IFtsoManager;
    using Delegator for IWNat;

    IWNat private immutable wNat;
    IFlareContractRegistry private immutable registry;

    uint256 private nextEpochToDistribute;

    constructor(IFlareContractRegistry _registry) {
        registry = _registry;
        wNat = registry.getWNat();
        nextEpochToDistribute = registry.getFtsoManager().getCurrentFtsoRewardEpoch() + 1;
    }

    receive() external payable {}

    function changeProviders(address[] calldata providers) external onlyParent {
        wNat.changeProviders(providers, type(uint256).max);
    }

    function claimFtsoRewards(uint256[] calldata epochs) external returns (uint256 amount) {
        if (epochs.length == 0) return 0;
        uint256 maxEpoch = epochs[epochs.length - 1];
        for (uint256 i = epochs.length - 1; i > 0; i--) {
            uint256 epoch = epochs[i - 1];
            if (epoch > maxEpoch) maxEpoch = epoch;
        }
        maxEpoch++; // exclusive upper boundary

        FlareLibrary.Range memory epochsRange = registry.getFtsoManager().getActiveFtsoRewardEpochsExclusive(nextEpochToDistribute);

        if (maxEpoch > epochsRange.end) maxEpoch = epochsRange.end;
        FlareLibrary.FtsoRewardManagerWithEpochs[] memory ftsoRewardManagers = registry.getActiveFtsoRewardManagers(
            epochsRange.start > nextEpochToDistribute ? epochsRange.start : nextEpochToDistribute
        );
        for (uint256 i = ftsoRewardManagers.length; i > 0; i--) {
            FlareLibrary.FtsoRewardManagerWithEpochs memory ftsoRewardManager = ftsoRewardManagers[i - 1];
            if (ftsoRewardManager.initialRewardEpoch < maxEpoch) {
                uint256[] memory singleEpoch = new uint256[](1);
                singleEpoch[0] = (ftsoRewardManager.lastRewardEpoch < maxEpoch)
                    ? ftsoRewardManager.lastRewardEpoch
                    : maxEpoch - 1;
                amount += ftsoRewardManager.rewardManager.claimReward(payable(this), singleEpoch);
                if (singleEpoch[0] >= nextEpochToDistribute) {
                    nextEpochToDistribute = singleEpoch[0] + 1;
                }
            }
        }
        wrapRewards();
    }

    function claimAirdrop(uint256 month) external returns (uint256 amount) {
        IDistributionToDelegators distribution = registry.getDistribution();
        if (address(distribution) != address(0)) {
            amount = distribution.claim(payable(this), month);
        }
        wrapRewards();
    }

    function wrapRewards() public {
        if (address(this).balance > 0) wNat.depositTo{value: address(this).balance}(address(this));
    }

    // re-entrancy check in parent
    function sendRewards(address to, uint256 amount, bool unwrap) external onlyParent {
        if (unwrap) {
            wNat.withdraw(amount);
            TransferHelper.safeTransferNAT(to, amount);
        } else {
            wNat.transfer(to, amount);
        }
    }
}
