// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import './interfaces/IConfigurable.sol';

library ConfigurableStorage {
    struct Layout {
        address configSetter;
    }

    bytes32 internal constant STORAGE_SLOT = keccak256('blazeswap.storage.Configuragble');

    function layout() internal pure returns (Layout storage l) {
        bytes32 slot = STORAGE_SLOT;
        assembly {
            l.slot := slot
        }
    }
}

abstract contract Configurable is IConfigurable {
    function initConfigurable(address _configSetter) internal {
        ConfigurableStorage.layout().configSetter = _configSetter;
    }

    function checkConfigSetter() private view {
        require(msg.sender == ConfigurableStorage.layout().configSetter, 'Configurable: FORBIDDEN');
    }

    modifier onlyConfigSetter() {
        checkConfigSetter();
        _;
    }

    function setConfigSetter(address _configSetter) external onlyConfigSetter {
        ConfigurableStorage.layout().configSetter = _configSetter;
    }

    function configSetter() external view returns (address _configSetter) {
        _configSetter = ConfigurableStorage.layout().configSetter;
    }
}
