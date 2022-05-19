// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import '../CentrallyConfigurable.sol';

contract CentrallyConfigurableTest is CentrallyConfigurable {
    uint256 public value;

    constructor(address _configurable) {
        initCentrallyConfigurable(_configurable);
    }

    function setValue(uint256 _value) external onlyConfigSetter {
        value = _value;
    }
}
