// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import '../interfaces/flare/IFtsoRewardManager.sol';
import '../interfaces/flare/IFtsoManager.sol';
import '../interfaces/flare/IWNat.sol';
import '../../shared/libraries/TransferHelper.sol';

import './WNAT.sol';

contract FtsoRewardManager is IFtsoRewardManager {
    IFtsoManager private immutable ftsoManager;

    address public immutable wNat;

    struct Reward {
        uint256 epochId;
        uint256 value;
        bool claimed;
    }
    mapping(address => Reward[]) private rewards;

    constructor(address _wNat) {
        ftsoManager = IFtsoManager(msg.sender);
        wNat = _wNat;
    }

    receive() external payable {}

    function addRewards(
        address _beneficiary,
        uint256 _epochId,
        uint256 _bips
    ) external payable {
        uint256 votePowerBlock = ftsoManager.getRewardEpochVotePowerBlock(_epochId);
        uint256 balance = IWNat(wNat).balanceOfAt(_beneficiary, votePowerBlock);
        rewards[_beneficiary].push(Reward(_epochId, (balance * _bips) / 100_00, false));
    }

    function getEpochsWithUnclaimedRewards(address _beneficiary) external view returns (uint256[] memory _epochIds) {
        uint256 nextEpochToExpire = ftsoManager.getRewardEpochToExpireNext();
        uint256 currentEpoch = ftsoManager.getCurrentRewardEpoch();
        uint256 count;
        for (uint256 i; i < rewards[_beneficiary].length; i++) {
            Reward storage r = rewards[_beneficiary][i];
            if (r.epochId >= nextEpochToExpire && r.epochId < currentEpoch && r.value > 0 && !r.claimed) {
                count++;
            }
        }
        _epochIds = new uint256[](count);
        count = 0;
        for (uint256 i; i < rewards[_beneficiary].length; i++) {
            Reward storage r = rewards[_beneficiary][i];
            if (r.epochId >= nextEpochToExpire && r.epochId < currentEpoch && r.value > 0 && !r.claimed) {
                _epochIds[count++] = rewards[_beneficiary][i].epochId;
            }
        }
    }

    function getStateOfRewards(address _beneficiary, uint256 _rewardEpoch)
        external
        view
        returns (
            address[] memory _dataProviders,
            uint256[] memory _rewardAmounts,
            bool[] memory _claimed,
            bool _claimable
        )
    {
        uint256 nextEpochToExpire = ftsoManager.getRewardEpochToExpireNext();
        uint256 currentEpoch = ftsoManager.getCurrentRewardEpoch();
        if (_rewardEpoch >= nextEpochToExpire) {
            for (uint256 i; i < rewards[_beneficiary].length; i++) {
                Reward storage r = rewards[_beneficiary][i];
                if (r.epochId == _rewardEpoch) {
                    _dataProviders = new address[](1);
                    _rewardAmounts = new uint256[](1);
                    _claimed = new bool[](1);
                    _rewardAmounts[0] = r.value;
                    _claimed[0] = r.claimed;
                }
            }
        }
        _claimable = _rewardEpoch >= nextEpochToExpire && _rewardEpoch < currentEpoch;
    }

    function claimReward(address payable _recipient, uint256[] memory _rewardEpochs)
        external
        returns (uint256 _rewardAmount)
    {
        uint256 nextEpochToExpire = ftsoManager.getRewardEpochToExpireNext();
        uint256 currentEpoch = ftsoManager.getCurrentRewardEpoch();
        for (uint256 i; i < rewards[msg.sender].length; i++) {
            Reward storage r = rewards[msg.sender][i];
            if (r.epochId >= nextEpochToExpire && r.epochId < currentEpoch && r.value > 0 && !r.claimed) {
                for (uint256 j; j < _rewardEpochs.length; j++) {
                    if (_rewardEpochs[j] == r.epochId) {
                        _rewardAmount += r.value;
                        r.claimed = true;
                    }
                }
            }
        }
        if (_rewardAmount > 0) {
            require(address(this).balance >= _rewardAmount, 'Insufficient balance');
            TransferHelper.safeTransferNAT(_recipient, _rewardAmount);
        }
    }
}
