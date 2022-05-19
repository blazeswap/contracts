// SPDX-License-Identifier: BUSL-1.1
pragma solidity >=0.5.0;

import './IBlazeSwapPlugin.sol';

interface IBlazeSwapDelegationPlugin is IBlazeSwapPlugin {
    function setInitialProvider(address _initialProvider) external;

    function initialProvider() external view returns (address);
}
