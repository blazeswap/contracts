// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import './interfaces/IBlazeSwapDelegationPlugin.sol';
import '../shared/CentrallyConfigurable.sol';
import './BlazeSwapDelegation.sol';

contract BlazeSwapDelegationPlugin is IBlazeSwapDelegationPlugin, CentrallyConfigurable {
    address public immutable implementation = address(new BlazeSwapDelegation());

    bool public active = true;

    address public initialProvider;

    uint256 public maxDelegatesByPercent;

    constructor(address _configurable) {
        initCentrallyConfigurable(_configurable);
    }

    function setInitialProvider(address _initialProvider) external onlyConfigSetter {
        require(_initialProvider != address(0));
        initialProvider = _initialProvider;
    }

    function setMaxDelegatesByPercent(uint256 _maxDelegatesByPercent) external onlyConfigSetter {
        require(_maxDelegatesByPercent > 0);
        maxDelegatesByPercent = _maxDelegatesByPercent;
    }
}
