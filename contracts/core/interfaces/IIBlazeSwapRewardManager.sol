// SPDX-License-Identifier: BUSL-1.1
pragma solidity >=0.7.5;
pragma abicoder v2;

import './IBlazeSwapRewardsPlugin.sol';
import './IBlazeSwapManager.sol';

interface IIBlazeSwapRewardManager {
    function initialize(IBlazeSwapRewardsPlugin plugin) external;

    function changeProviders(address[] calldata providers) external;

    function claimFtsoRewards(uint256[] calldata epochs) external returns (uint256 amount);

    function claimAirdrop(uint256 month) external returns (uint256 amount);

    function rewardsBalance() external view returns (uint256 amount);

    function replaceWNatIfNeeded() external;

    function wrapRewards() external;

    function sendRewards(address to, uint256 amount, bool unwrap) external;

    function withdrawERC20(address token, uint256 amount, address destination) external;

    function withdrawERC721(address token, uint256 id, address destination) external;

    function withdrawERC1155(address token, uint256 id, uint256 amount, address destination) external;
}
