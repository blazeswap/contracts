// SPDX-License-Identifier: BUSL-1.1
pragma solidity >=0.7.5;
pragma abicoder v2;

interface IBlazeSwapRewards {
    function withdrawRewardFees(bool wrapped) external returns (uint256 rewardFees);

    function withdrawERC20(address token, uint256 amount, address destination) external;

    function withdrawERC721(address token, uint256 id, address destination) external;

    function withdrawERC1155(address token, uint256 id, uint256 amount, address destination) external;
}
