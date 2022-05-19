// SPDX-License-Identifier: MIT
pragma solidity >=0.5.0;

interface IFtsoRewardManager {
    function wNat() external view returns (address);

    function getEpochsWithUnclaimedRewards(address _beneficiary) external view returns (uint256[] memory _epochIds);

    function getStateOfRewards(address _beneficiary, uint256 _rewardEpoch)
        external
        view
        returns (
            address[] memory _dataProviders,
            uint256[] memory _rewardAmounts,
            bool[] memory _claimed,
            bool _claimable
        );

    function claimReward(address payable _recipient, uint256[] memory _rewardEpochs)
        external
        returns (uint256 _rewardAmount);
}
