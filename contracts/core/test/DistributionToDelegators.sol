// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import '../interfaces/flare/IDistributionToDelegators.sol';
import '../interfaces/flare/IWNat.sol';
import '../../shared/libraries/TransferHelper.sol';

contract DistributionToDelegators is IDistributionToDelegators {
    address public immutable wNat;

    uint256 public getCurrentMonth;
    uint256 public getMonthToExpireNext;

    struct Airdrop {
        uint256 month;
        uint256 value;
        bool claimed;
    }
    mapping(address => Airdrop[]) private airdrops;
    mapping(uint256 => uint256[]) public votePowerBlocks;

    constructor(address _wNat) {
        wNat = _wNat;
    }

    receive() external payable {}

    function setVotePowerBlockNumbers(uint256 _month, uint256[] calldata _blocks) external {
        votePowerBlocks[_month] = _blocks;
        getCurrentMonth = _month + 1;
    }

    function addAirdrop(address _beneficiary, uint256 _month, uint256 _amount) external payable {
        airdrops[_beneficiary].push(Airdrop(_month, _amount, false));
    }

    function setMonthToExpireNext(uint256 _month) external {
        getMonthToExpireNext = _month;
    }

    function votePowerBlockNumbers(uint256 _month) external view returns (uint256[] memory) {
        return votePowerBlocks[_month];
    }

    function getClaimableAmount(uint256 _month) external view returns (uint256 _amountWei) {
        return getClaimableAmountOf(msg.sender, _month);
    }

    function getClaimableAmountOf(address account, uint256 _month) public view returns (uint256 _amountWei) {
        for (uint256 i; i < airdrops[account].length; i++) {
            Airdrop storage a = airdrops[account][i];
            if (a.month == _month && a.month < getCurrentMonth && a.value > 0 && !a.claimed) {
                _amountWei += a.value;
            }
        }
    }

    function claim(address payable _recipient, uint256 _month) external returns (uint256 _amountWei) {
        for (uint256 i; i < airdrops[msg.sender].length; i++) {
            Airdrop storage a = airdrops[msg.sender][i];
            if (a.month == _month && a.month < getCurrentMonth && a.value > 0 && !a.claimed) {
                _amountWei += a.value;
                a.claimed = true;
            }
        }
        if (_amountWei > 0) {
            require(address(this).balance >= _amountWei, 'Insufficient balance');
            TransferHelper.safeTransferNAT(_recipient, _amountWei);
        }
    }

    function secondsTillNextClaim() external pure returns (uint256 _timetill) {
        _timetill = 0;
    }
}
