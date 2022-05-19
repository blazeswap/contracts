// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

library DelegateCallHelper {
    function delegateAndCheckResult(address recipient, bytes memory data) internal returns (bytes memory) {
        (bool success, bytes memory result) = recipient.delegatecall(data);

        if (!success) {
            // https://ethereum.stackexchange.com/a/83577
            if (result.length < 68) revert('DelegateCallHelper: revert with no reason');
            assembly {
                result := add(result, 0x04)
            }
            revert(abi.decode(result, (string)));
        }

        return result;
    }
}
