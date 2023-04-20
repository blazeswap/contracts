// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import '../shared/libraries/TransferHelper.sol';
import '../shared/DelegatedCalls.sol';
import '../shared/ParentRelation.sol';
import './interfaces/erc721/IERC721.sol';
import './interfaces/erc1155/IERC1155.sol';
import './interfaces/flare/IWNat.sol';
import './interfaces/IBlazeSwapRewardsPlugin.sol';
import './interfaces/IIBlazeSwapRewardManager.sol';
import './libraries/Delegator.sol';
import './libraries/FlareLibrary.sol';

contract BlazeSwapRewardManager is IIBlazeSwapRewardManager, DelegatedCalls, ParentRelation {
    using FlareLibrary for IFtsoManager;
    using Delegator for IWNat;

    bool private initialized;

    IBlazeSwapRewardsPlugin private rewardsPlugin;

    IWNat private wNat;

    uint256 private nextEpochToDistribute;

    function checkRewardsFeeClaimer() private view {
        require(rewardsPlugin.isRewardsFeeClaimer(msg.sender), 'BlazeSwapRewardManager: FORBIDDEN');
    }

    modifier onlyRewardsFeeClaimer() {
        checkRewardsFeeClaimer();
        _;
    }

    function checkUnmanagedToken(address token) private view {
        require(token != address(wNat), 'BlazeSwapRewardManager: WNAT');
    }

    modifier onlyUnmanagedToken(address token) {
        checkUnmanagedToken(token);
        _;
    }

    function initialize(IBlazeSwapRewardsPlugin _rewardsPlugin) external onlyDelegatedCall {
        require(!initialized, 'BlazeSwapRewardManager: INITIALIZED');
        initParentRelation(msg.sender);
        rewardsPlugin = _rewardsPlugin;
        wNat = FlareLibrary.getWNat();
        nextEpochToDistribute = FlareLibrary.getFtsoManager().getCurrentFtsoRewardEpoch() + 1;
        initialized = true;
    }

    receive() external payable onlyDelegatedCall {}

    function changeProviders(address[] calldata providers) external onlyDelegatedCall onlyParent {
        wNat.changeProviders(providers, type(uint256).max);
        replaceWNatIfNeeded();
    }

    function claimFtsoRewards(
        uint256[] calldata epochs
    ) external onlyDelegatedCall onlyRewardsFeeClaimer returns (uint256 amount) {
        if (epochs.length == 0) return 0;
        uint256 maxEpoch = epochs[epochs.length - 1];
        for (uint256 i = epochs.length - 1; i > 0; i--) {
            uint256 epoch = epochs[i - 1];
            if (epoch > maxEpoch) maxEpoch = epoch;
        }
        maxEpoch++; // exclusive upper boundary

        FlareLibrary.Range memory epochsRange = FlareLibrary.getFtsoManager().getActiveFtsoRewardEpochsExclusive(
            nextEpochToDistribute
        );

        if (maxEpoch > epochsRange.end) maxEpoch = epochsRange.end;
        FlareLibrary.FtsoRewardManagerWithEpochs[] memory ftsoRewardManagers = FlareLibrary.getActiveFtsoRewardManagers(
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

    function replaceWNatIfNeeded() public onlyDelegatedCall {
        if (rewardsPlugin.allowWNatReplacement()) {
            IWNat latest = FlareLibrary.getWNat();
            if (latest != wNat) {
                uint256 balance = wNat.balanceOf(address(this));
                wNat.withdraw(balance);
                latest.deposit{value: balance}();
                require(latest.balanceOf(address(this)) >= balance, 'BlazeSwapRewardManager: BALANCE');
                (address[] memory providers, , , ) = wNat.delegatesOf(address(this));
                latest.changeProviders(providers, type(uint256).max);
                wNat = latest;
            }
        }
    }

    function claimAirdrop(uint256 month) external onlyDelegatedCall onlyRewardsFeeClaimer returns (uint256 amount) {
        IDistributionToDelegators distribution = FlareLibrary.getDistribution();
        if (address(distribution) != address(0)) {
            amount = distribution.claim(address(this), payable(this), month, false);
        }
        wrapRewards();
    }

    function rewardsBalance() external view onlyDelegatedCall returns (uint256 amount) {
        amount = wNat.balanceOf(address(this));
    }

    function wrapRewards() public onlyDelegatedCall {
        if (address(this).balance > 0) wNat.deposit{value: address(this).balance}();
        replaceWNatIfNeeded();
    }

    // re-entrancy check in parent
    function sendRewards(address to, uint256 amount, bool unwrap) external onlyDelegatedCall onlyParent {
        replaceWNatIfNeeded();
        if (unwrap) {
            wNat.withdraw(amount);
            TransferHelper.safeTransferNAT(to, amount);
        } else {
            wNat.transfer(to, amount);
        }
    }

    function withdrawERC20(
        address token,
        uint256 amount,
        address destination
    ) external onlyDelegatedCall onlyRewardsFeeClaimer onlyUnmanagedToken(token) {
        IERC20(token).transfer(destination, amount);
    }

    function withdrawERC721(
        address token,
        uint256 id,
        address destination
    ) external onlyDelegatedCall onlyRewardsFeeClaimer onlyUnmanagedToken(token) {
        IERC721(token).transferFrom(address(this), destination, id);
    }

    function withdrawERC1155(
        address token,
        uint256 id,
        uint256 amount,
        address destination
    ) external onlyDelegatedCall onlyRewardsFeeClaimer onlyUnmanagedToken(token) {
        IERC1155(token).safeTransferFrom(address(this), destination, id, amount, '');
    }
}
