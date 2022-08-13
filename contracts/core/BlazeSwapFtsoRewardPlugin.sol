// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import './interfaces/IBlazeSwapFtsoRewardPlugin.sol';
import './BlazeSwapFtsoReward.sol';

contract BlazeSwapFtsoRewardPlugin is IBlazeSwapFtsoRewardPlugin {
    address public immutable implementation = address(new BlazeSwapFtsoReward());
}
