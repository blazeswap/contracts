// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import './interfaces/IBlazeSwapExecutorManager.sol';
import './interfaces/IBlazeSwapFtsoReward.sol';
import './interfaces/IBlazeSwapPair.sol';
import './interfaces/IIBlazeSwapReward.sol';

import '../shared/DelegatedCalls.sol';
import '../shared/ReentrancyLock.sol';

import './libraries/BlazeSwapFlareLibrary.sol';
import './libraries/BlazeSwapRewardLibrary.sol';
import './libraries/Math.sol';

import './BlazeSwapDelegation.sol';

library BlazeSwapFtsoRewardStorage {
    bytes32 internal constant STORAGE_SLOT = keccak256('blazeswap.storage.BlazeSwapFtsoReward');

    struct FtsoReward {
        uint256 votePowerBlock;
        uint256 remainingAmount;
        uint256 remainingWeight;
    }

    struct Layout {
        IBlazeSwapExecutorManager executorManager;
        mapping(uint256 => FtsoReward) pendingRewards;
        mapping(address => mapping(uint256 => uint256)) claimedRewards;
    }

    function layout() internal pure returns (Layout storage l) {
        bytes32 slot = STORAGE_SLOT;
        assembly {
            l.slot := slot
        }
    }
}

contract BlazeSwapFtsoReward is IBlazeSwapFtsoReward, IIBlazeSwapReward, ReentrancyLock, DelegatedCalls {
    function initialize(address) external onlyDelegatedCall {
        BlazeSwapDelegationStorage.Layout storage s = BlazeSwapDelegationStorage.layout();
        BlazeSwapFtsoRewardStorage.Layout storage l = BlazeSwapFtsoRewardStorage.layout();
        l.executorManager = IBlazeSwapExecutorManager(s.manager.executorManager());
    }

    function applyFee(uint256 amount) private pure returns (uint256) {
        return (amount * 981) / 1000; // 1.9% fee (cannot overflow)
    }

    function distributeFtsoRewards(uint256[] calldata epochs) external lock onlyDelegatedCall {
        BlazeSwapDelegationStorage.Layout storage s = BlazeSwapDelegationStorage.layout();
        BlazeSwapFtsoRewardStorage.Layout storage l = BlazeSwapFtsoRewardStorage.layout();
        IFtsoManager ftsoManager = BlazeSwapFlareLibrary.getFtsoManager();
        IFtsoRewardManager[] memory ftsoRewardManagers = s.manager.getFtsoRewardManagers();
        bool rewardsFeeOn = s.manager.rewardsFeeOn();
        uint256 totalRewards;
        address payable rewardManagerAddress = BlazeSwapRewardLibrary.rewardManagerFor(address(this));
        for (uint256 i; i < epochs.length; i++) {
            uint256 epoch = epochs[i];
            uint256 votePowerBlock = ftsoManager.getRewardEpochVotePowerBlock(epoch);
            uint256 votePower = IBlazeSwapPair(address(this)).totalSupplyAt(votePowerBlock);
            uint256[] memory singleEpoch = new uint256[](1);
            singleEpoch[0] = epoch;
            uint256 epochRewards;
            for (uint256 j; j < ftsoRewardManagers.length; j++) {
                if (ftsoRewardManagers[j].active()) {
                    epochRewards += ftsoRewardManagers[j].claimReward(rewardManagerAddress, singleEpoch);
                }
            }
            if (epochRewards > 0) {
                totalRewards += epochRewards;
                if (rewardsFeeOn) {
                    epochRewards = applyFee(epochRewards);
                }
                if (epochRewards > 0) {
                    l.pendingRewards[epoch] = BlazeSwapFtsoRewardStorage.FtsoReward(
                        votePowerBlock,
                        epochRewards,
                        votePower
                    );
                }
                emit IBlazeSwapFtsoReward.FtsoRewardsDistributed(epoch, epochRewards, msg.sender);
            }
        }
        // wrap FTSO rewards and send them to reward manager
        if (totalRewards > 0) {
            assert(rewardManagerAddress.balance >= totalRewards);
            BlazeSwapRewardManager(rewardManagerAddress).wrapRewards();
        }
    }

    function accruingFtsoRewards(address beneficiary) external view onlyDelegatedCall returns (uint256 amount) {
        BlazeSwapDelegationStorage.Layout storage s = BlazeSwapDelegationStorage.layout();
        IFtsoManager ftsoManager = BlazeSwapFlareLibrary.getFtsoManager();
        IFtsoRewardManager[] memory ftsoRewardManagers = s.manager.getFtsoRewardManagers();
        uint256 epoch = ftsoManager.getCurrentRewardEpoch();
        bool rewardsFeeOn = s.manager.rewardsFeeOn();
        uint256 votePowerBlock = ftsoManager.getRewardEpochVotePowerBlock(epoch);
        uint256 votePower = IBlazeSwapPair(address(this)).totalSupplyAt(votePowerBlock);
        uint256 beneficiaryVotePower = (beneficiary != address(0))
            ? IBlazeSwapPair(address(this)).balanceOfAt(beneficiary, votePowerBlock)
            : votePower;
        if (beneficiaryVotePower > 0 && votePower > 0) {
            for (uint256 i; i < ftsoRewardManagers.length; i++) {
                if (ftsoRewardManagers[i].active()) {
                    (, uint256[] memory rewardAmounts, , ) = ftsoRewardManagers[i].getStateOfRewards(
                        address(this),
                        epoch
                    );
                    for (uint256 j; j < rewardAmounts.length; j++) {
                        amount += rewardAmounts[j];
                    }
                }
            }
            if (rewardsFeeOn) {
                amount = applyFee(amount);
            }
            amount = (amount * beneficiaryVotePower) / votePower; // this cannot overflow
        }
    }

    function epochsWithUndistributedFtsoRewards(IFtsoRewardManager[] memory ftsoRewardManagers)
        private
        view
        returns (uint256[] memory epochs)
    {
        uint256[][] memory allEpochs = new uint256[][](ftsoRewardManagers.length);
        uint256 maxLen;
        for (uint256 i; i < ftsoRewardManagers.length; i++) {
            if (ftsoRewardManagers[i].active()) {
                allEpochs[i] = ftsoRewardManagers[i].getEpochsWithUnclaimedRewards(address(this));
                maxLen += allEpochs[i].length;
            }
        }
        epochs = new uint256[](maxLen);
        uint256 count;
        for (uint256 i; i < ftsoRewardManagers.length; i++) {
            uint256[] memory epochsSubset = allEpochs[i];
            for (uint256 j; j < epochsSubset.length; j++) {
                uint256 curEpoch = epochsSubset[j];
                uint256 k;
                // it might be enough to check the last one, but perform a full scan for safety
                while (k < count && epochs[k] != curEpoch) k++;
                if (k == count) {
                    // add epoch
                    epochs[count++] = curEpoch;
                }
            }
        }
        uint256 toDrop = maxLen - count;
        if (toDrop > 0) {
            assembly {
                // reduce array lengths
                mstore(epochs, sub(mload(epochs), toDrop))
            }
        }
    }

    function epochsWithUndistributedFtsoRewards(address beneficiary)
        external
        view
        onlyDelegatedCall
        returns (uint256[] memory epochs, uint256[] memory amounts)
    {
        BlazeSwapDelegationStorage.Layout storage s = BlazeSwapDelegationStorage.layout();
        IFtsoManager ftsoManager = BlazeSwapFlareLibrary.getFtsoManager();
        IFtsoRewardManager[] memory ftsoRewardManagers = s.manager.getFtsoRewardManagers();
        epochs = epochsWithUndistributedFtsoRewards(ftsoRewardManagers);
        amounts = new uint256[](epochs.length);
        bool rewardsFeeOn = s.manager.rewardsFeeOn();
        for (uint256 i; i < epochs.length; i++) {
            uint256 epoch = epochs[i];
            uint256 votePowerBlock = ftsoManager.getRewardEpochVotePowerBlock(epoch);
            uint256 votePower = IBlazeSwapPair(address(this)).totalSupplyAt(votePowerBlock);
            uint256 beneficiaryVotePower = (beneficiary != address(0))
                ? IBlazeSwapPair(address(this)).balanceOfAt(beneficiary, votePowerBlock)
                : votePower;
            if (beneficiaryVotePower > 0 && votePower > 0) {
                for (uint256 j; j < ftsoRewardManagers.length; j++) {
                    if (ftsoRewardManagers[j].active()) {
                        (, uint256[] memory rewardAmounts, , ) = ftsoRewardManagers[j].getStateOfRewards(
                            address(this),
                            epoch
                        );
                        for (uint256 k; k < rewardAmounts.length; k++) {
                            amounts[i] += rewardAmounts[k];
                        }
                    }
                }
                if (rewardsFeeOn) {
                    amounts[i] = applyFee(amounts[i]);
                }
                amounts[i] = (amounts[i] * beneficiaryVotePower) / votePower; // this cannot overflow
            }
        }
    }

    function epochsWithUnclaimedFtsoRewards(address beneficiary)
        external
        view
        onlyDelegatedCall
        returns (uint256[] memory epochs, uint256[] memory amounts)
    {
        BlazeSwapFtsoRewardStorage.Layout storage l = BlazeSwapFtsoRewardStorage.layout();
        IFtsoManager ftsoManager = BlazeSwapFlareLibrary.getFtsoManager();
        uint256 currentRewardEpoch = ftsoManager.getCurrentRewardEpoch();
        uint256 firstRewardEpoch = ftsoManager.getRewardEpochToExpireNext();
        uint256 scanLen = currentRewardEpoch - firstRewardEpoch;
        epochs = new uint256[](scanLen);
        amounts = new uint256[](scanLen);
        uint256 count;
        for (uint256 epoch = firstRewardEpoch; epoch < currentRewardEpoch; epoch++) {
            BlazeSwapFtsoRewardStorage.FtsoReward storage rewards = l.pendingRewards[epoch];
            // no (remaining) rewards
            if (rewards.remainingAmount == 0 || rewards.remainingWeight == 0) continue;
            // already claimed
            if (l.claimedRewards[beneficiary][epoch] > 0) continue;
            uint256 weight = IBlazeSwapPair(address(this)).balanceOfAt(beneficiary, rewards.votePowerBlock);
            // not entitled
            if (weight == 0) continue;
            uint256 amount = (rewards.remainingAmount * weight) / rewards.remainingWeight; // this cannot overflow
            // too small amount
            if (amount == 0) continue;
            // add rewards
            epochs[count] = epoch;
            amounts[count] = amount;
            count++;
        }
        uint256 toDrop = scanLen - count;
        if (toDrop > 0) {
            assembly {
                // reduce array lengths
                mstore(epochs, sub(mload(epochs), toDrop))
                mstore(amounts, sub(mload(amounts), toDrop))
            }
        }
    }

    function claimFtsoRewards(
        BlazeSwapFtsoRewardStorage.Layout storage l,
        address beneficiary,
        address to,
        uint256 epoch,
        address executor
    ) private returns (uint256 amount) {
        BlazeSwapFtsoRewardStorage.FtsoReward storage rewards = l.pendingRewards[epoch];
        // no (remaining) rewards
        if (rewards.remainingAmount == 0 || rewards.remainingWeight == 0) return 0;
        // already claimed
        if (l.claimedRewards[beneficiary][epoch] > 0) return 0;
        uint256 weight = IBlazeSwapPair(address(this)).balanceOfAt(beneficiary, rewards.votePowerBlock);
        // not entitled
        if (weight == 0) return 0;
        amount = (rewards.remainingAmount * weight) / rewards.remainingWeight; // this cannot overflow
        // too small amount
        if (amount == 0) return 0;
        // set claimed
        l.claimedRewards[beneficiary][epoch] = amount;
        rewards.remainingAmount -= amount;
        rewards.remainingWeight -= weight;
        emit FtsoRewardsClaimed(beneficiary, to, epoch, amount, executor);
    }

    function claimFtsoRewards(
        BlazeSwapFtsoRewardStorage.Layout storage l,
        uint256[] calldata epochs,
        address beneficiary,
        address to,
        address executor,
        bool wrapped
    ) private {
        IFtsoManager ftsoManager = BlazeSwapFlareLibrary.getFtsoManager();
        uint256 currentRewardEpoch = ftsoManager.getCurrentRewardEpoch();
        uint256 firstRewardEpoch = ftsoManager.getRewardEpochToExpireNext();

        uint256 totalRewards;
        for (uint256 i; i < epochs.length; i++) {
            uint256 epoch = epochs[i];
            if (epoch >= firstRewardEpoch && epoch < currentRewardEpoch) {
                totalRewards += claimFtsoRewards(l, beneficiary, to, epochs[i], executor);
            }
        }
        if (totalRewards > 0) {
            BlazeSwapRewardManager(BlazeSwapRewardLibrary.rewardManagerFor(address(this))).sendRewards(
                to,
                totalRewards,
                !wrapped
            );
        }
    }

    function claimFtsoRewards(
        uint256[] calldata epochs,
        address to,
        bool wrapped
    ) external lock onlyDelegatedCall {
        BlazeSwapFtsoRewardStorage.Layout storage l = BlazeSwapFtsoRewardStorage.layout();
        claimFtsoRewards(l, epochs, msg.sender, to, msg.sender, wrapped);
    }

    function claimFtsoRewardsByExecutor(
        uint256[] calldata epochs,
        address beneficiary,
        address to,
        bool wrapped
    ) external lock onlyDelegatedCall {
        BlazeSwapFtsoRewardStorage.Layout storage l = BlazeSwapFtsoRewardStorage.layout();
        ExecutorPermission perm = l.executorManager.executorPermission(beneficiary, msg.sender);
        require(
            perm == ExecutorPermission.AnyAddress ||
                (perm == ExecutorPermission.OwnerOnly && to == beneficiary) ||
                msg.sender == beneficiary,
            'BlazeSwap: FORBIDDEN'
        );
        claimFtsoRewards(l, epochs, beneficiary, to, msg.sender, wrapped);
    }

    function claimedFtsoRewards(address beneficiary, uint256 epoch)
        external
        view
        onlyDelegatedCall
        returns (uint256 amount)
    {
        amount = BlazeSwapFtsoRewardStorage.layout().claimedRewards[beneficiary][epoch];
    }

    function unclaimedRewards() public view onlyDelegatedCall returns (uint256 totalRewards) {
        BlazeSwapFtsoRewardStorage.Layout storage l = BlazeSwapFtsoRewardStorage.layout();
        IFtsoManager ftsoManager = BlazeSwapFlareLibrary.getFtsoManager();
        uint256 currentRewardEpoch = ftsoManager.getCurrentRewardEpoch();
        uint256 firstRewardEpoch = ftsoManager.getRewardEpochToExpireNext();
        for (uint256 epoch = firstRewardEpoch; epoch < currentRewardEpoch; epoch++) {
            totalRewards += l.pendingRewards[epoch].remainingAmount;
        }
    }

    function pluginSelectors() private pure returns (bytes4[] memory s) {
        s = new bytes4[](7);
        s[0] = IBlazeSwapFtsoReward.accruingFtsoRewards.selector;
        s[1] = IBlazeSwapFtsoReward.epochsWithUndistributedFtsoRewards.selector;
        s[2] = IBlazeSwapFtsoReward.distributeFtsoRewards.selector;
        s[3] = IBlazeSwapFtsoReward.epochsWithUnclaimedFtsoRewards.selector;
        s[4] = IBlazeSwapFtsoReward.claimFtsoRewards.selector;
        s[5] = IBlazeSwapFtsoReward.claimFtsoRewardsByExecutor.selector;
        s[6] = IBlazeSwapFtsoReward.claimedFtsoRewards.selector;
    }

    function pluginMetadata() external pure returns (bytes4[] memory selectors, bytes4 interfaceId) {
        selectors = pluginSelectors();
        interfaceId = type(IBlazeSwapFtsoReward).interfaceId;
    }
}
