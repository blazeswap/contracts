// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import '../Configurable.sol';

contract ConfigurableTest is Configurable {
    uint256 public value;

    constructor() {
        initConfigurable(msg.sender);
    }

    function setValue(uint256 _value) external onlyConfigSetter {
        value = _value;
    }
}
