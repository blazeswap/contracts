// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import './interfaces/IBlazeSwapExecutorManager.sol';
import './interfaces/IBlazeSwapAirdrop.sol';
import './interfaces/IBlazeSwapPair.sol';
import './interfaces/IIBlazeSwapRewardsHook.sol';
import './interfaces/IIBlazeSwapRewardManager.sol';

import '../shared/DelegatedCalls.sol';
import '../shared/ReentrancyLock.sol';

import './libraries/BlazeSwapRewardLibrary.sol';
import './libraries/FlareLibrary.sol';
import './libraries/Math.sol';

import './BlazeSwapPair.sol';

library BlazeSwapAirdropStorage {
    bytes32 internal constant STORAGE_SLOT = keccak256('blazeswap.storage.BlazeSwapAirdrop');

    struct Airdrop {
        uint256[] votePowerBlocks;
        uint256[] wNatBalances;
        uint256[] poolBalances;
        uint256 remainingAmount;
        uint256 remainingWeight;
    }

    struct Layout {
        IBlazeSwapExecutorManager executorManager;
        uint256 nextMonthToDistribute;
        mapping(uint256 => Airdrop) pendingAirdrops;
        mapping(address => mapping(uint256 => uint256)) claimedAirdrops;
    }

    function layout() internal pure returns (Layout storage l) {
        bytes32 slot = STORAGE_SLOT;
        assembly {
            l.slot := slot
        }
    }
}

contract BlazeSwapAirdrop is
    IBlazeSwapAirdrop,
    IBlazeSwapPluginImpl,
    IIBlazeSwapRewardsHook,
    ReentrancyLock,
    DelegatedCalls
{
    using FlareLibrary for IDistributionToDelegators;

    uint256 private constant NUMBER_OF_VOTE_POWER_BLOCKS = 3;

    function initialize(address) external onlyDelegatedCall {
        BlazeSwapAirdropStorage.Layout storage l = BlazeSwapAirdropStorage.layout();
        l.executorManager = IBlazeSwapExecutorManager(BlazeSwapPairStorage.layout().manager.executorManager());
        l.nextMonthToDistribute = FlareLibrary.getDistribution().getCurrentMonth();
    }

    function applyFee(uint256 amount, uint256 bips) private pure returns (uint256) {
        return bips > 0 ? (amount * (100_00 - bips)) / 100_00 : amount; // cannot overflow, fee round up
    }

    function adjustAirdropAmount(
        IDistributionToDelegators distribution,
        uint256 month,
        uint256 totalAmount,
        uint256 airdropsFeeBips,
        address beneficiary
    ) private view returns (uint256 amount) {
        IWNat wNat = FlareLibrary.getWNat();
        uint256 votePower;
        uint256 beneficiaryVotePower;
        for (uint256 i; i < NUMBER_OF_VOTE_POWER_BLOCKS; i++) {
            uint256 votePowerBlock = distribution.votePowerBlockNumbers(month, i);
            uint256 wNatBalance = wNat.balanceOfAt(address(this), votePowerBlock);
            uint256 poolBalance = IBlazeSwapPair(address(this)).totalSupplyAt(votePowerBlock);
            uint256 beneficiaryBalance = IBlazeSwapPair(address(this)).balanceOfAt(beneficiary, votePowerBlock);
            if (poolBalance > 0) {
                beneficiaryVotePower += (beneficiaryBalance * wNatBalance) / poolBalance; // this cannot overflow
                votePower += wNatBalance;
            }
        }
        if (beneficiaryVotePower > 0 && votePower > 0) {
            amount = applyFee(totalAmount, airdropsFeeBips);
            amount = (amount * beneficiaryVotePower) / votePower; // this cannot overflow
        }
    }

    function monthsWithUndistributedAirdrop(
        address beneficiary
    )
        external
        view
        onlyDelegatedCall
        returns (uint256[] memory months, uint256[] memory amounts, uint256[] memory totalAmounts)
    {
        IDistributionToDelegators distribution = FlareLibrary.getDistribution();
        if (address(distribution) != address(0)) {
            FlareLibrary.Range memory monthsRange = distribution.getActiveAirdropMonthsExclusive(
                BlazeSwapAirdropStorage.layout().nextMonthToDistribute,
                true
            );
            uint256 airdropFeeBips = BlazeSwapPairStorage.layout().manager.airdropFeeBips();
            months = new uint256[](monthsRange.len);
            amounts = new uint256[](monthsRange.len);
            totalAmounts = new uint256[](monthsRange.len);
            uint256 count;
            for (uint256 month = monthsRange.start; month < monthsRange.end; month++) {
                totalAmounts[count] = distribution.getClaimableAmount(month);
                if (totalAmounts[count] > 0) {
                    if (beneficiary != address(0)) {
                        amounts[count] = adjustAirdropAmount(
                            distribution,
                            month,
                            totalAmounts[count],
                            airdropFeeBips,
                            beneficiary
                        );
                    }
                    months[count++] = month;
                }
            }
            uint256 toDrop = monthsRange.len - count;
            if (toDrop > 0) {
                assembly {
                    // reduce array lengths
                    mstore(months, sub(mload(months), toDrop))
                    mstore(amounts, sub(mload(amounts), toDrop))
                    mstore(totalAmounts, sub(mload(totalAmounts), toDrop))
                }
            }
        }
    }

    function distributeAirdrop(uint256 untilMonth) external lock onlyDelegatedCall {
        IDistributionToDelegators distribution = FlareLibrary.getDistribution();
        if (address(distribution) != address(0)) {
            BlazeSwapAirdropStorage.Layout storage l = BlazeSwapAirdropStorage.layout();
            uint256 endMonthExclusive = untilMonth + 1;
            FlareLibrary.Range memory monthsRange = distribution.getActiveAirdropMonthsExclusive(
                BlazeSwapAirdropStorage.layout().nextMonthToDistribute,
                true
            );
            if (endMonthExclusive > monthsRange.end) endMonthExclusive = monthsRange.end;
            IWNat wNat = FlareLibrary.getWNat();
            address payable rewardManagerAddress = BlazeSwapRewardLibrary.rewardManagerFor(address(this));
            uint256 airdropFeeBips = BlazeSwapPairStorage.layout().manager.airdropFeeBips();
            uint256 totalAmount;
            for (uint256 month = monthsRange.start; month < endMonthExclusive; month++) {
                uint256 monthAmount = distribution.claim(address(this), rewardManagerAddress, month, false);
                if (monthAmount > 0) {
                    totalAmount += monthAmount;
                    uint256[] memory votePowerBlocks = new uint256[](NUMBER_OF_VOTE_POWER_BLOCKS);
                    uint256[] memory wNatBalances = new uint256[](NUMBER_OF_VOTE_POWER_BLOCKS);
                    uint256[] memory poolBalances = new uint256[](NUMBER_OF_VOTE_POWER_BLOCKS);
                    uint256 votePower;
                    for (uint256 i; i < NUMBER_OF_VOTE_POWER_BLOCKS; i++) {
                        uint256 votePowerBlock = distribution.votePowerBlockNumbers(month, i);
                        votePowerBlocks[i] = votePowerBlock;
                        wNatBalances[i] = wNat.balanceOfAt(address(this), votePowerBlock);
                        poolBalances[i] = IBlazeSwapPair(address(this)).totalSupplyAt(votePowerBlock);
                        votePower += wNatBalances[i];
                    }
                    uint256 airdropAmount = applyFee(monthAmount, airdropFeeBips);
                    if (airdropAmount > 0) {
                        l.pendingAirdrops[month] = BlazeSwapAirdropStorage.Airdrop(
                            votePowerBlocks,
                            wNatBalances,
                            poolBalances,
                            airdropAmount,
                            votePower
                        );
                    }
                    l.nextMonthToDistribute = month + 1;
                    emit IBlazeSwapAirdrop.AirdropDistributed(month, airdropAmount, msg.sender);
                }
            }
            // wrap FTSO airdrops and send them to reward manager
            assert(rewardManagerAddress.balance >= totalAmount);
            IIBlazeSwapRewardManager(rewardManagerAddress).wrapRewards();
        }
    }

    function getAirdropProRata(
        uint256 month,
        address beneficiary
    ) private view returns (uint256 weight, uint256 amount) {
        BlazeSwapAirdropStorage.Layout storage l = BlazeSwapAirdropStorage.layout();
        if (l.claimedAirdrops[beneficiary][month] == 0) {
            BlazeSwapAirdropStorage.Airdrop storage airdrop = l.pendingAirdrops[month];
            if (airdrop.remainingWeight > 0) {
                for (uint256 j; j < airdrop.votePowerBlocks.length; j++) {
                    if (airdrop.poolBalances[j] > 0) {
                        uint256 beneficiaryBalance = IBlazeSwapPair(address(this)).balanceOfAt(
                            beneficiary,
                            airdrop.votePowerBlocks[j]
                        );
                        weight += (beneficiaryBalance * airdrop.wNatBalances[j]) / airdrop.poolBalances[j]; // this cannot overflow
                    }
                }
                amount = (airdrop.remainingAmount * weight) / airdrop.remainingWeight; // this cannot overflow
            }
        }
    }

    function monthsWithUnclaimedAirdrop(
        address beneficiary
    ) external view onlyDelegatedCall returns (uint256[] memory months, uint256[] memory amounts) {
        IDistributionToDelegators distribution = FlareLibrary.getDistribution();
        if (address(distribution) != address(0)) {
            FlareLibrary.Range memory monthsRange = distribution.getActiveAirdropMonthsExclusive(0, false);
            months = new uint256[](monthsRange.len);
            amounts = new uint256[](monthsRange.len);
            uint256 count;
            for (uint256 month = monthsRange.start; month < monthsRange.end; month++) {
                (, uint256 amount) = getAirdropProRata(month, beneficiary);
                if (amount > 0) {
                    // add airdrops
                    months[count] = month;
                    amounts[count] = amount;
                    count++;
                }
            }
            uint256 toDrop = monthsRange.len - count;
            if (toDrop > 0) {
                assembly {
                    // reduce array lengths
                    mstore(months, sub(mload(months), toDrop))
                    mstore(amounts, sub(mload(amounts), toDrop))
                }
            }
        }
    }

    function claimAirdrop(address beneficiary, address to, uint256 month, address executor) private returns (uint256) {
        BlazeSwapAirdropStorage.Layout storage l = BlazeSwapAirdropStorage.layout();
        (uint256 weight, uint256 amount) = getAirdropProRata(month, beneficiary);
        if (amount > 0) {
            BlazeSwapAirdropStorage.Airdrop storage airdrop = l.pendingAirdrops[month];
            // set claimed
            l.claimedAirdrops[beneficiary][month] = amount;
            airdrop.remainingAmount -= amount;
            airdrop.remainingWeight -= weight;
            emit AirdropClaimed(beneficiary, to, month, amount, executor);
        }
        return amount;
    }

    function claimAirdrops(
        uint256[] calldata months,
        address beneficiary,
        address to,
        address executor,
        bool wrapped
    ) private {
        IDistributionToDelegators distribution = FlareLibrary.getDistribution();
        if (address(distribution) != address(0)) {
            FlareLibrary.Range memory monthsRange = distribution.getActiveAirdropMonthsExclusive(0, false);
            uint256 totalAmount;
            for (uint256 i; i < months.length; i++) {
                uint256 month = months[i];
                if (month >= monthsRange.start && month < monthsRange.end) {
                    totalAmount += claimAirdrop(beneficiary, to, month, executor);
                }
            }
            if (totalAmount > 0) {
                IIBlazeSwapRewardManager(BlazeSwapRewardLibrary.rewardManagerFor(address(this))).sendRewards(
                    to,
                    totalAmount,
                    !wrapped
                );
            }
        }
    }

    function claimAirdrops(uint256[] calldata months, address to, bool wrapped) external lock onlyDelegatedCall {
        claimAirdrops(months, msg.sender, to, msg.sender, wrapped);
    }

    function claimAirdropsByExecutor(
        uint256[] calldata months,
        address beneficiary,
        address to,
        bool wrapped
    ) external lock onlyDelegatedCall {
        BlazeSwapAirdropStorage.Layout storage l = BlazeSwapAirdropStorage.layout();
        ExecutorPermission perm = l.executorManager.executorPermission(beneficiary, msg.sender);
        require(
            perm == ExecutorPermission.AnyAddress ||
                (perm == ExecutorPermission.OwnerOnly && to == beneficiary) ||
                msg.sender == beneficiary,
            'BlazeSwap: FORBIDDEN'
        );
        claimAirdrops(months, beneficiary, to, msg.sender, wrapped);
    }

    function claimedAirdrops(
        address beneficiary,
        uint256 month
    ) external view onlyDelegatedCall returns (uint256 amount) {
        amount = BlazeSwapAirdropStorage.layout().claimedAirdrops[beneficiary][month];
    }

    function unclaimedRewards() public view onlyDelegatedCall returns (uint256 totalRewards) {
        IDistributionToDelegators distribution = FlareLibrary.getDistribution();
        if (address(distribution) != address(0)) {
            BlazeSwapAirdropStorage.Layout storage l = BlazeSwapAirdropStorage.layout();
            FlareLibrary.Range memory monthsRange = distribution.getActiveAirdropMonthsExclusive(0, false);
            for (uint256 month = monthsRange.start; month < monthsRange.end; month++) {
                totalRewards += l.pendingAirdrops[month].remainingAmount;
            }
        }
    }

    function pluginSelectors() private pure returns (bytes4[] memory s) {
        s = new bytes4[](6);
        s[0] = IBlazeSwapAirdrop.monthsWithUndistributedAirdrop.selector;
        s[1] = IBlazeSwapAirdrop.distributeAirdrop.selector;
        s[2] = IBlazeSwapAirdrop.monthsWithUnclaimedAirdrop.selector;
        s[3] = IBlazeSwapAirdrop.claimAirdrops.selector;
        s[4] = IBlazeSwapAirdrop.claimAirdropsByExecutor.selector;
        s[5] = IBlazeSwapAirdrop.claimedAirdrops.selector;
    }

    function pluginMetadata() external pure returns (bytes4[] memory selectors, bytes4 interfaceId, uint256 hooksSet) {
        selectors = pluginSelectors();
        interfaceId = type(IBlazeSwapAirdrop).interfaceId;
        hooksSet = BlazeSwapPairStorage.RewardsHook;
    }
}
