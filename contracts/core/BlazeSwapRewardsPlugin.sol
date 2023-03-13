// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import './interfaces/IBlazeSwapRewardsPlugin.sol';
import '../shared/libraries/AddressSet.sol';
import '../shared/CentrallyConfigurable.sol';
import './BlazeSwapRewards.sol';
import './BlazeSwapRewardManager.sol';

contract BlazeSwapRewardsPlugin is IBlazeSwapRewardsPlugin, CentrallyConfigurable {
    using AddressSet for AddressSet.State;

    address public immutable implementation = address(new BlazeSwapRewards());

    address public immutable rewardManager = address(new BlazeSwapRewardManager());

    AddressSet.State private rewardsFeeClaimer;

    address public rewardsFeeTo;

    bool public allowWNatReplacement;

    constructor(address _configurable) {
        initCentrallyConfigurable(_configurable);
    }

    function addRewardsFeeClaimer(address _rewardsFeeClaimer) external onlyConfigSetter {
        rewardsFeeClaimer.add(_rewardsFeeClaimer);
    }

    function removeRewardsFeeClaimer(address _rewardsFeeClaimer) external onlyConfigSetter {
        rewardsFeeClaimer.remove(_rewardsFeeClaimer);
    }

    function rewardsFeeClaimers() external view returns (address[] memory) {
        return rewardsFeeClaimer.list;
    }

    function isRewardsFeeClaimer(address _rewardsFeeClaimer) external view returns (bool) {
        return rewardsFeeClaimer.index[_rewardsFeeClaimer] != 0;
    }

    function setRewardsFeeTo(address _rewardsFeeTo) external onlyConfigSetter {
        rewardsFeeTo = _rewardsFeeTo;
    }

    function setAllowWNatReplacement(bool _allowWNatReplacement) external onlyConfigSetter {
        allowWNatReplacement = _allowWNatReplacement;
    }
}
