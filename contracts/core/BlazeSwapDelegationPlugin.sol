// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import './interfaces/IBlazeSwapDelegationPlugin.sol';
import '../shared/CentrallyConfigurable.sol';
import './BlazeSwapDelegation.sol';

contract BlazeSwapDelegationPlugin is IBlazeSwapDelegationPlugin, CentrallyConfigurable {
    address public implementation = address(new BlazeSwapDelegation());

    address public initialProvider;

    constructor(address _configurable) {
        initCentrallyConfigurable(_configurable);
    }

    function setInitialProvider(address _initialProvider) external onlyConfigSetter {
        initialProvider = _initialProvider;
    }
}
