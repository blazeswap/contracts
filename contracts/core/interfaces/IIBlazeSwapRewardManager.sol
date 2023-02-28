// SPDX-License-Identifier: BUSL-1.1
pragma solidity >=0.7.5;
pragma abicoder v2;

interface IIBlazeSwapRewardManager {
    function initialize() external;

    function changeProviders(address[] calldata providers) external;

    function claimFtsoRewards(uint256[] calldata epochs) external returns (uint256 amount);

    function claimAirdrop(uint256 month) external returns (uint256 amount);

    function wrapRewards() external;

    function sendRewards(address to, uint256 amount, bool unwrap) external;
}
