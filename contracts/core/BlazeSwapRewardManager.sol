// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import '../shared/libraries/TransferHelper.sol';
import '../shared/ParentRelation.sol';
import './interfaces/flare/IWNat.sol';
import './interfaces/IBlazeSwapManager.sol';
import './libraries/BlazeSwapFlareLibrary.sol';
import './libraries/Delegator.sol';

contract BlazeSwapRewardManager is ParentRelation {
    using Delegator for IWNat;

    IWNat private immutable wNat;
    IBlazeSwapManager private immutable manager;

    constructor(IWNat _wNat, IBlazeSwapManager _manager) {
        wNat = _wNat;
        manager = _manager;
    }

    receive() external payable {}

    function changeProviders(address[2] calldata providers) external onlyParent {
        wNat.changeProviders(providers);
    }

    function claimFtsoRewards(uint256[] calldata epochs) external returns (uint256 amount) {
        IFtsoRewardManager[] memory ftsoRewardManagers = manager.getFtsoRewardManagers();
        for (uint256 i; i < ftsoRewardManagers.length; i++) {
            try
                BlazeSwapFlareLibrary.getFtsoRewardManager(BlazeSwapFlareLibrary.getFtsoManager()).claimReward(
                    payable(this),
                    epochs
                )
            returns (uint256 partialAmount) {
                amount += partialAmount;
            } catch {
                // ignore errors
            }
        }
        wrapRewards();
    }

    function wrapRewards() public {
        if (address(this).balance > 0) wNat.depositTo{value: address(this).balance}(address(this));
    }

    // re-entrancy check in parent
    function sendRewards(
        address to,
        uint256 amount,
        bool unwrap
    ) external onlyParent {
        if (unwrap) {
            wNat.withdraw(amount);
            TransferHelper.safeTransferNAT(to, amount);
        } else {
            wNat.transfer(to, amount);
        }
    }
}
