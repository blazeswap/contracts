// SPDX-License-Identifier: MIT
pragma solidity >=0.7.5;
pragma abicoder v2;

interface IDistributionToDelegators {
    function votePowerBlockNumbers(uint256 _month) external view returns (uint256[] memory);

    function stopped() external view returns (bool);

    function getClaimableAmount(uint256 _month) external view returns (uint256 _amountWei); // revert if not claimable

    function getClaimableAmountOf(address account, uint256 _month) external view returns (uint256 _amountWei);

    function claim(address payable _recipient, uint256 _month) external returns (uint256 _amountWei);

    function getCurrentMonth() external view returns (uint256 _currentMonth);

    function getMonthToExpireNext() external view returns (uint256 _monthToExpireNext);

    function getClaimableMonths() external view returns (uint256 _startMonth, uint256 _endMonth); // revert if no claimable months
}
