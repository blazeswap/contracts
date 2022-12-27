// SPDX-License-Identifier: MIT
pragma solidity >=0.7.5;
pragma abicoder v2;

interface IFtsoManager {
    function rewardManager() external view returns (address);

    function getCurrentRewardEpoch() external view returns (uint256);

    function getRewardEpochVotePowerBlock(uint256 _rewardEpoch) external view returns (uint256);

    function getRewardEpochToExpireNext() external view returns (uint256); // not currently available on Songbird

    function rewardEpochDurationSeconds() external view returns (uint256);

    function rewardEpochs(
        uint256 _rewardEpochId
    ) external view returns (uint256 _votepowerBlock, uint256 _startBlock, uint256 _startTimestamp);
}
