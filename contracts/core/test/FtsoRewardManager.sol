// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import '../interfaces/flare/IFtsoRewardManager.sol';
import '../interfaces/flare/IFtsoManager.sol';
import '../interfaces/flare/IWNat.sol';
import '../../shared/libraries/TransferHelper.sol';

import './interfaces/IFlareAddressUpdatable.sol';

contract FtsoRewardManager is IFtsoRewardManager, IFlareAddressUpdatable {
    IFtsoManager private ftsoManager;

    bool public active;
    uint256 public getInitialRewardEpoch;

    address public wNat;
    address public immutable oldFtsoRewardManager;

    struct Reward {
        uint256 epochId;
        uint256 value;
        bool claimed;
    }
    mapping(address => Reward[]) private rewards;

    constructor(address _oldFtsoRewardManager) {
        oldFtsoRewardManager = _oldFtsoRewardManager;
    }

    receive() external payable {}

    function initialize() external {
        getInitialRewardEpoch = ftsoManager.getCurrentRewardEpoch();
    }

    function activate() external {
        active = true;
    }

    function deactivate() external {
        active = false;
    }

    function addRewards(address _beneficiary, uint256 _epochId, uint256 _bips) external payable {
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

    function getStateOfRewards(
        address _beneficiary,
        uint256 _rewardEpoch
    )
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

    function claimReward(
        address payable _recipient,
        uint256[] calldata _rewardEpochs
    ) external returns (uint256 _rewardAmount) {
        require(active, 'NOT ACTIVE');
        uint256 maxRewardEpoch;
        for (uint256 i; i < _rewardEpochs.length; i++) {
            if (maxRewardEpoch < _rewardEpochs[i]) {
                maxRewardEpoch = _rewardEpochs[i];
            }
        }
        uint256 nextEpochToExpire = ftsoManager.getRewardEpochToExpireNext();
        uint256 currentEpoch = ftsoManager.getCurrentRewardEpoch();
        for (uint256 i; i < rewards[msg.sender].length; i++) {
            Reward storage r = rewards[msg.sender][i];
            if (
                r.epochId >= nextEpochToExpire &&
                r.epochId < currentEpoch &&
                r.epochId <= maxRewardEpoch &&
                r.value > 0 &&
                !r.claimed
            ) {
                _rewardAmount += r.value;
                r.claimed = true;
            }
        }
        if (_rewardAmount > 0) {
            require(address(this).balance >= _rewardAmount, 'Insufficient balance');
            TransferHelper.safeTransferNAT(_recipient, _rewardAmount);
        }
    }

    function getUnclaimedReward(uint256, address) external pure returns (uint256, uint256) {
        revert('NOT IMPLEMENTED');
    }

    function getDataProviderCurrentFeePercentage(address) external pure returns (uint256) {
        return 20_00;
    }

    function getDataProviderScheduledFeePercentageChanges(
        address
    )
        external
        pure
        returns (uint256[] memory _feePercentageBIPS, uint256[] memory _validFromEpoch, bool[] memory _fixed)
    {}

    function updateContractAddress(bytes32 _nameHash, address _address) external {
        if (_nameHash == keccak256(abi.encode('WNat'))) {
            wNat = _address;
        } else if (_nameHash == keccak256(abi.encode('FtsoManager'))) {
            ftsoManager = IFtsoManager(_address);
        }
    }
}
