// SPDX-License-Identifier: MIT
pragma solidity >=0.7.5;
pragma abicoder v2;

interface IDistributionToDelegators {
    function votePowerBlockNumbers(uint256 _month) external view returns (uint256[] memory);

    function getClaimableAmount(uint256 _month) external view returns (uint256 _amountWei);

    function getClaimableAmountOf(address account, uint256 _month) external view returns (uint256 _amountWei);

    function claim(address payable _recipient, uint256 _month) external returns (uint256 _amountWei);

    function getCurrentMonth() external view returns (uint256 _currentMonth);

    function getMonthToExpireNext() external view returns (uint256 _monthToExpireNext);

    function secondsTillNextClaim() external view returns (uint256 _timetill);
}
