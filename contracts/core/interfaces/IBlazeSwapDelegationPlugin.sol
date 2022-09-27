// SPDX-License-Identifier: BUSL-1.1
pragma solidity >=0.7.5;
pragma abicoder v2;

import './IBlazeSwapPlugin.sol';

interface IBlazeSwapDelegationPlugin is IBlazeSwapPlugin {
    function setInitialProvider(address _initialProvider) external;

    function initialProvider() external view returns (address);

    function setMaxDelegatesByPercent(uint256 _maxDelegatesByPercent) external;

    function maxDelegatesByPercent() external view returns (uint256);
}
