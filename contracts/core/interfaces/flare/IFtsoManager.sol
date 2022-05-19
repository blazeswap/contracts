// SPDX-License-Identifier: MIT
pragma solidity >=0.5.0;

interface IFtsoManager {
    function rewardManager() external view returns (address);

    function getCurrentRewardEpoch() external view returns (uint256);

    function getRewardEpochVotePowerBlock(uint256 _rewardEpoch) external view returns (uint256);

    function getRewardEpochToExpireNext() external view returns (uint256);
}
