// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import '../shared/libraries/TransferHelper.sol';
import '../shared/ParentRelation.sol';
import './interfaces/flare/IWNat.sol';
import './libraries/BlazeSwapFlareLibrary.sol';
import './libraries/Delegator.sol';

contract BlazeSwapRewardManager is ParentRelation {
    using Delegator for IWNat;

    IWNat private immutable wNat;

    constructor(IWNat _wNat) {
        wNat = _wNat;
    }

    receive() external payable {}

    function changeProviders(address[2] memory providers) external onlyParent {
        wNat.changeProviders(providers);
    }

    function claimFtsoRewards(uint256[] calldata epochs) external returns (uint256 amount) {
        amount = BlazeSwapFlareLibrary.getFtsoRewardManager(BlazeSwapFlareLibrary.getFtsoManager()).claimReward(
            payable(this),
            epochs
        );
        wrapRewards();
    }

    function wrapRewards() public {
        wNat.depositTo{value: address(this).balance}(address(this));
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
