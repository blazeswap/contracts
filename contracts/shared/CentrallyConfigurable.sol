// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import './interfaces/ICentrallyConfigurable.sol';

library CentrallyConfigurableStorage {
    struct Layout {
        IConfigurable configurable;
    }

    bytes32 internal constant STORAGE_SLOT = keccak256('blazeswap.storage.CentrallyConfiguragble');

    function layout() internal pure returns (Layout storage l) {
        bytes32 slot = STORAGE_SLOT;
        assembly {
            l.slot := slot
        }
    }
}

abstract contract CentrallyConfigurable is ICentrallyConfigurable {
    function initCentrallyConfigurable(address _configurable) internal {
        CentrallyConfigurableStorage.layout().configurable = IConfigurable(_configurable);
    }

    function checkConfigSetter() private view {
        require(
            msg.sender == CentrallyConfigurableStorage.layout().configurable.configSetter(),
            'CentrallyConfigurable: FORBIDDEN'
        );
    }

    modifier onlyConfigSetter() {
        checkConfigSetter();
        _;
    }

    function configurable() external view returns (IConfigurable) {
        return CentrallyConfigurableStorage.layout().configurable;
    }
}
