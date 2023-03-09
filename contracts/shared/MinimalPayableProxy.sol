// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import './libraries/DelegateCallHelper.sol';

contract MinimalPayableProxy {
    address public immutable implementation;

    constructor(address _implementation) {
        implementation = _implementation;
    }

    receive() external payable {
        // do nothing, allow to receive NAT via address.transfer()
    }

    /*
    fallback() external payable {
        address impl = implementation;
        // delegate to implementation contract
        assembly {
            calldatacopy(0, 0, calldatasize())
            let result := delegatecall(gas(), impl, 0, calldatasize(), 0, 0)
            let size := returndatasize()
            returndatacopy(0, 0, size)

            switch result
            case 0 {
                revert(0, size)
            }
            default {
                return(0, size)
            }
        }
    }
    */

    // prettier-ignore
    fallback(bytes calldata _input) external returns (bytes memory result) {
        result = DelegateCallHelper.delegateAndCheckResult(implementation, _input);
    }
}
