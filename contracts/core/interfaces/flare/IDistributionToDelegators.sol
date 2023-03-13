// SPDX-License-Identifier: MIT
pragma solidity >=0.7.5;
pragma abicoder v2;

interface IDistributionToDelegators {
    function votePowerBlockNumbers(uint256 _month, uint256 _index) external view returns (uint256);

    function stopped() external view returns (bool);

    function getClaimableAmount(uint256 _month) external view returns (uint256 _amountWei); // revert if not claimable

    function getClaimableAmountOf(address account, uint256 _month) external view returns (uint256 _amountWei);

    function claim(address _rewardOwner, address _recipient, uint256 _month, bool _wrap) external returns(uint256 _rewardAmount);

    function getCurrentMonth() external view returns (uint256 _currentMonth);

    function getMonthToExpireNext() external view returns (uint256 _monthToExpireNext);

    function getClaimableMonths() external view returns (uint256 _startMonth, uint256 _endMonth); // revert if no claimable months
}
