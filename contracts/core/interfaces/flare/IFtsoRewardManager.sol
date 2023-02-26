// SPDX-License-Identifier: MIT
pragma solidity >=0.7.5;
pragma abicoder v2;

interface IFtsoRewardManager {
    function active() external view returns (bool);

    function wNat() external view returns (address);

    function getInitialRewardEpoch() external view returns (uint256);

    function getEpochsWithUnclaimedRewards(address _beneficiary) external view returns (uint256[] memory _epochIds);

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
        );

    function claimReward(
        address payable _recipient,
        uint256[] calldata _rewardEpochs
    ) external returns (uint256 _rewardAmount);

    function oldFtsoRewardManager() external view returns (address);

    function getUnclaimedReward(
        uint256 _rewardEpoch,
        address _dataProvider
    ) external view returns (uint256 _amount, uint256 _weight);

    function getDataProviderCurrentFeePercentage(address _dataProvider) external view returns (uint256);

    function getDataProviderScheduledFeePercentageChanges(
        address _dataProvider
    )
        external
        view
        returns (uint256[] memory _feePercentageBIPS, uint256[] memory _validFromEpoch, bool[] memory _fixed);
}
