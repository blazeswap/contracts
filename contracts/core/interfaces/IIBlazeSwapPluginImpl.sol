// SPDX-License-Identifier: BUSL-1.1
pragma solidity >=0.5.0;

import './IBlazeSwapPluginImpl.sol';

interface IIBlazeSwapPluginImpl is IBlazeSwapPluginImpl {
    function initialize(address plugin) external;
}
