// SPDX-License-Identifier: BUSL-1.1
pragma solidity >=0.7.5;
pragma abicoder v2;

import './IBlazeSwapPlugin.sol';

interface IBlazeSwapRewardsPlugin is IBlazeSwapPlugin {
    function rewardManager() external view returns (address);

    function addRewardsFeeClaimer(address _rewardsFeeClaimer) external;

    function removeRewardsFeeClaimer(address _rewardsFeeClaimer) external;

    function rewardsFeeClaimers() external view returns (address[] memory);

    function isRewardsFeeClaimer(address _rewardsFeeClaimer) external view returns (bool);

    function setRewardsFeeTo(address _rewardsFeeTo) external;

    function rewardsFeeTo() external view returns (address);

    function setAllowWNatReplacement(bool _allowWNatReplacement) external;

    function allowWNatReplacement() external view returns (bool);
}
