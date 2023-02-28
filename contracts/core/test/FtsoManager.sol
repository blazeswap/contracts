// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import '../interfaces/flare/IFtsoManager.sol';

import './interfaces/IFlareAddressUpdatable.sol';

contract FtsoManager is IFtsoManager, IFlareAddressUpdatable {
    IFtsoManager public immutable oldFtsoManager;

    address public rewardManager;

    uint256 private currentRewardEpoch;
    mapping(uint256 => uint256) private rewardEpochVotePowerBlock;
    uint256 private rewardEpochToExpireNext;

    bool private initialized;

    constructor(address _oldFtsoManager) {
        oldFtsoManager = IFtsoManager(_oldFtsoManager);
    }

    function startRewardEpoch(uint256 _rewardEpoch, uint256 _votePowerBlock) external {
        rewardEpochVotePowerBlock[_rewardEpoch] = _votePowerBlock;
        currentRewardEpoch = _rewardEpoch;
    }

    function initialize() external {
        initialized = true;
    }

    function getCurrentRewardEpoch() external view returns (uint256) {
        require(initialized, 'Not initialized');
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

    function rewardEpochDurationSeconds() external pure returns (uint256) {
        return 7 days;
    }

    function rewardEpochs(uint256) external pure returns (uint256, uint256, uint256) {
        revert('NOT IMPLEMENTED');
    }

    function updateContractAddress(bytes32 _nameHash, address _address) external {
        if (_nameHash == keccak256(abi.encode('FtsoRewardManager'))) {
            rewardManager = _address;
        }
    }
}
