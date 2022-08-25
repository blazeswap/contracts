// SPDX-License-Identifier: MIT
pragma solidity >=0.7.5;
pragma abicoder v2;

interface IBlazeSwapAirdrop {
    event AirdropDistributed(uint256 month, uint256 amount, address distributor);
    event AirdropClaimed(address indexed beneficiary, address to, uint256 month, uint256 amount, address executor);

    function distributeAirdrop(uint256 month) external;

    function monthsWithUndistributedAirdrop(
        address beneficiary
    ) external view returns (uint256[] memory months, uint256[] memory amounts, uint256[] memory totalAmounts);

    function monthsWithUnclaimedAirdrop(
        address beneficiary
    ) external view returns (uint256[] memory months, uint256[] memory amounts);

    function claimAirdrops(uint256[] calldata months, address to, bool wrapped) external;

    function claimAirdropsByExecutor(uint256[] calldata months, address beneficiary, address to, bool wrapped) external;

    function claimedAirdrops(address beneficiary, uint256 month) external view returns (uint256);
}
