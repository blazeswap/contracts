// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import '../interfaces/flare/IFtsoManager.sol';
import './FtsoRewardManager.sol';

contract FtsoManager is IFtsoManager {
    address public rewardManager;

    uint256 private currentRewardEpoch;
    mapping(uint256 => uint256) private rewardEpochVotePowerBlock;
    uint256 private rewardEpochToExpireNext;

    constructor(address _wNat) {
        rewardManager = address(new FtsoRewardManager(_wNat, address(0)));
    }

    function replaceRewardManager() external {
        rewardManager = address(new FtsoRewardManager(FtsoRewardManager(payable(rewardManager)).wNat(), rewardManager));
    }

    function addRewardEpoch(uint256 _rewardEpoch, uint256 _votePowerBlock) external {
        rewardEpochVotePowerBlock[_rewardEpoch] = _votePowerBlock;
        currentRewardEpoch = _rewardEpoch;
    }

    function getCurrentRewardEpoch() external view returns (uint256) {
        return currentRewardEpoch;
    }

    function getRewardEpochVotePowerBlock(uint256 _rewardEpoch) external view returns (uint256) {
        return rewardEpochVotePowerBlock[_rewardEpoch];
    }

    function setRewardEpochToExpireNext(uint256 _rewardEpoch) external {
        rewardEpochToExpireNext = _rewardEpoch;
    }

    function getRewardEpochToExpireNext() external view returns (uint256) {
        return rewardEpochToExpireNext;
    }
}
