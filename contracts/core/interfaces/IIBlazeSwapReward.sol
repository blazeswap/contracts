// SPDX-License-Identifier: BUSL-1.1
pragma solidity >=0.5.0;

import './IIBlazeSwapPluginImpl.sol';

interface IIBlazeSwapReward is IIBlazeSwapPluginImpl {
    function unclaimedRewards() external view returns (uint256);
}
