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
        mapping(uint256 => bool) distributedRewardEpochs;
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
    struct EpochsRange {
        uint256 start;
        uint256 end;
        uint256 len;
    }

    function initialize(address) external onlyDelegatedCall {
        BlazeSwapDelegationStorage.Layout storage s = BlazeSwapDelegationStorage.layout();
        BlazeSwapFtsoRewardStorage.Layout storage l = BlazeSwapFtsoRewardStorage.layout();
        l.executorManager = IBlazeSwapExecutorManager(s.manager.executorManager());
    }

    function applyFee(uint256 amount, uint256 bips) private pure returns (uint256) {
        return bips > 0 ? (amount * (100_00 - bips)) / 100_00 : amount; // cannot overflow, fee round up
    }

    function getActiveRewardEpochsExclusive(IFtsoManager ftsoManager)
        private
        view
        returns (EpochsRange memory epochsRange)
    {
        uint256 firstActiveEpoch;
        try ftsoManager.getRewardEpochToExpireNext() returns (uint256 epoch) {
            firstActiveEpoch = epoch;
        } catch {
            // FtsoManagerV1 without getRewardEpochToExpireNext
            firstActiveEpoch = IFtsoRewardManager(ftsoManager.rewardManager()).getRewardEpochToExpireNext();
        }
        uint256 currentEpoch = ftsoManager.getCurrentRewardEpoch();
        epochsRange = EpochsRange(firstActiveEpoch, currentEpoch, currentEpoch - firstActiveEpoch);
    }

    function adjustRewardAmount(
        IFtsoManager ftsoManager,
        uint256 epoch,
        uint256 totalAmount,
        uint256 rewardsFeeBips,
        address beneficiary
    ) private view returns (uint256 amount) {
        uint256 votePowerBlock = ftsoManager.getRewardEpochVotePowerBlock(epoch);
        uint256 votePower = IBlazeSwapPair(address(this)).totalSupplyAt(votePowerBlock);
        uint256 beneficiaryVotePower = IBlazeSwapPair(address(this)).balanceOfAt(beneficiary, votePowerBlock);
        if (beneficiaryVotePower > 0 && votePower > 0) {
            amount = applyFee(totalAmount, rewardsFeeBips);
            amount = (amount * beneficiaryVotePower) / votePower; // this cannot overflow
        }
    }

    function accruingFtsoRewards(address beneficiary) external view onlyDelegatedCall returns (uint256 amount) {
        BlazeSwapDelegationStorage.Layout storage s = BlazeSwapDelegationStorage.layout();
        IFtsoManager ftsoManager = BlazeSwapFlareLibrary.getFtsoManager();
        IFtsoRewardManager[] memory ftsoRewardManagers = s.manager.getFtsoRewardManagers();
        uint256 epoch = ftsoManager.getCurrentRewardEpoch();
        uint256 rewardsFeeBips = s.manager.ftsoRewardsFeeBips();
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
            amount = applyFee(amount, rewardsFeeBips);
            amount = (amount * beneficiaryVotePower) / votePower; // this cannot overflow
        }
    }

    function epochsWithUndistributedFtsoRewards(address beneficiary)
        external
        view
        onlyDelegatedCall
        returns (
            uint256[] memory epochs,
            uint256[] memory amounts,
            uint256[] memory totalAmounts
        )
    {
        IFtsoRewardManager[] memory ftsoRewardManagers;
        uint256 rewardsFeeBips;
        {
            // avoid stack too deep error
            BlazeSwapDelegationStorage.Layout storage s = BlazeSwapDelegationStorage.layout();
            ftsoRewardManagers = s.manager.getActiveFtsoRewardManagers();
            rewardsFeeBips = s.manager.ftsoRewardsFeeBips();
        }
        IFtsoManager ftsoManager = BlazeSwapFlareLibrary.getFtsoManager();
        EpochsRange memory epochsRange = getActiveRewardEpochsExclusive(ftsoManager);
        epochs = new uint256[](epochsRange.len);
        amounts = new uint256[](epochsRange.len);
        totalAmounts = new uint256[](epochsRange.len);
        uint256 count;
        for (uint256 epoch = epochsRange.start; epoch < epochsRange.end; epoch++) {
            if (BlazeSwapFtsoRewardStorage.layout().distributedRewardEpochs[epoch]) continue;
            for (uint256 j; j < ftsoRewardManagers.length; j++) {
                (, uint256[] memory rewardAmounts, bool[] memory claimed, bool claimable) = ftsoRewardManagers[j]
                    .getStateOfRewards(address(this), epoch);
                if (claimable) {
                    for (uint256 k; k < rewardAmounts.length; k++) {
                        if (!claimed[k]) {
                            totalAmounts[count] += rewardAmounts[k];
                        }
                    }
                }
            }
            if (totalAmounts[count] > 0) {
                if (beneficiary != address(0)) {
                    amounts[count] = adjustRewardAmount(
                        ftsoManager,
                        epoch,
                        totalAmounts[count],
                        rewardsFeeBips,
                        beneficiary
                    );
                }
                epochs[count++] = epoch;
            }
        }
        uint256 toDrop = epochsRange.len - count;
        if (toDrop > 0) {
            assembly {
                // reduce array lengths
                mstore(epochs, sub(mload(epochs), toDrop))
                mstore(amounts, sub(mload(amounts), toDrop))
                mstore(totalAmounts, sub(mload(totalAmounts), toDrop))
            }
        }
    }

    function distributeFtsoRewards(uint256[] calldata epochs) external lock onlyDelegatedCall {
        BlazeSwapDelegationStorage.Layout storage s = BlazeSwapDelegationStorage.layout();
        BlazeSwapFtsoRewardStorage.Layout storage l = BlazeSwapFtsoRewardStorage.layout();
        IFtsoManager ftsoManager = BlazeSwapFlareLibrary.getFtsoManager();
        IFtsoRewardManager[] memory ftsoRewardManagers = s.manager.getActiveFtsoRewardManagers();
        uint256 rewardsFeeBips = s.manager.ftsoRewardsFeeBips();
        uint256 totalRewards;
        address payable rewardManagerAddress = BlazeSwapRewardLibrary.rewardManagerFor(address(this));
        for (uint256 i; i < epochs.length; i++) {
            uint256 epoch = epochs[i];
            if (l.distributedRewardEpochs[epoch]) continue;
            uint256 votePowerBlock = ftsoManager.getRewardEpochVotePowerBlock(epoch);
            uint256 votePower = IBlazeSwapPair(address(this)).totalSupplyAt(votePowerBlock);
            uint256[] memory singleEpoch = new uint256[](1);
            singleEpoch[0] = epoch;
            uint256 epochRewards;
            for (uint256 j; j < ftsoRewardManagers.length; j++) {
                epochRewards += ftsoRewardManagers[j].claimReward(rewardManagerAddress, singleEpoch);
            }
            if (epochRewards > 0) {
                totalRewards += epochRewards;
                epochRewards = applyFee(epochRewards, rewardsFeeBips);
                if (epochRewards > 0) {
                    l.pendingRewards[epoch] = BlazeSwapFtsoRewardStorage.FtsoReward(
                        votePowerBlock,
                        epochRewards,
                        votePower
                    );
                }
                l.distributedRewardEpochs[epoch] = true;
                emit IBlazeSwapFtsoReward.FtsoRewardsDistributed(epoch, epochRewards, msg.sender);
            }
        }
        // wrap FTSO rewards and send them to reward manager
        if (totalRewards > 0) {
            assert(rewardManagerAddress.balance >= totalRewards);
            IIBlazeSwapRewardManager(rewardManagerAddress).wrapRewards();
        }
    }

    function getFtsoRewardsProRata(
        BlazeSwapFtsoRewardStorage.Layout storage l,
        uint256 epoch,
        address beneficiary
    ) private view returns (uint256 weight, uint256 amount) {
        if (l.claimedRewards[beneficiary][epoch] == 0) {
            BlazeSwapFtsoRewardStorage.FtsoReward storage rewards = l.pendingRewards[epoch];
            if (rewards.remainingWeight > 0) {
                weight = IBlazeSwapPair(address(this)).balanceOfAt(beneficiary, rewards.votePowerBlock);
                amount = (rewards.remainingAmount * weight) / rewards.remainingWeight; // this cannot overflow
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
        EpochsRange memory epochsRange = getActiveRewardEpochsExclusive(ftsoManager);
        epochs = new uint256[](epochsRange.len);
        amounts = new uint256[](epochsRange.len);
        uint256 count;
        for (uint256 epoch = epochsRange.start; epoch < epochsRange.end; epoch++) {
            (, uint256 amount) = getFtsoRewardsProRata(l, epoch, beneficiary);
            if (amount > 0) {
                // add rewards
                epochs[count] = epoch;
                amounts[count] = amount;
                count++;
            }
        }
        uint256 toDrop = epochsRange.len - count;
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
    ) private returns (uint256) {
        (uint256 weight, uint256 amount) = getFtsoRewardsProRata(l, epoch, beneficiary);
        if (amount > 0) {
            BlazeSwapFtsoRewardStorage.FtsoReward storage rewards = l.pendingRewards[epoch];
            // set claimed
            l.claimedRewards[beneficiary][epoch] = amount;
            rewards.remainingAmount -= amount;
            rewards.remainingWeight -= weight;
            emit FtsoRewardsClaimed(beneficiary, to, epoch, amount, executor);
        }
        return amount;
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
        EpochsRange memory epochsRange = getActiveRewardEpochsExclusive(ftsoManager);

        uint256 totalRewards;
        for (uint256 i; i < epochs.length; i++) {
            uint256 epoch = epochs[i];
            if (epoch >= epochsRange.start && epoch < epochsRange.end) {
                totalRewards += claimFtsoRewards(l, beneficiary, to, epochs[i], executor);
            }
        }
        if (totalRewards > 0) {
            IIBlazeSwapRewardManager(BlazeSwapRewardLibrary.rewardManagerFor(address(this))).sendRewards(
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
        EpochsRange memory epochsRange = getActiveRewardEpochsExclusive(ftsoManager);
        for (uint256 epoch = epochsRange.start; epoch < epochsRange.end; epoch++) {
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
