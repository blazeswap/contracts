// SPDX-License-Identifier: MIT
pragma solidity >=0.7.5;
pragma abicoder v2;

interface IBlazeSwapFtsoReward {
    event FtsoRewardsDistributed(uint256 epoch, uint256 amount, address distributor);
    event FtsoRewardsClaimed(address indexed beneficiary, address to, uint256 epoch, uint256 amount, address executor);

    function accruingFtsoRewards(address beneficiary) external view returns (uint256 amount);

    function distributeFtsoRewards(uint256[] calldata epoch) external;

    function epochsWithUndistributedFtsoRewards(address beneficiary)
        external
        view
        returns (uint256[] memory epochs, uint256[] memory amounts);

    function epochsWithUnclaimedFtsoRewards(address beneficiary)
        external
        view
        returns (uint256[] memory epochs, uint256[] memory amounts);

    function claimFtsoRewards(
        uint256[] calldata epochs,
        address to,
        bool wrapped
    ) external;

    function claimFtsoRewardsByExecutor(
        uint256[] calldata epochs,
        address beneficiary,
        address to,
        bool wrapped
    ) external;

    function claimedFtsoRewards(address beneficiary, uint256 epoch) external view returns (uint256);
}
