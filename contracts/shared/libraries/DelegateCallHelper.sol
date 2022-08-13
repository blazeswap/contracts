// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

library DelegateCallHelper {
    function delegateAndCheckResult(address recipient, bytes memory data) internal returns (bytes memory) {
        (bool success, bytes memory result) = recipient.delegatecall(data);

        if (!success) {
            if (result.length == 0) revert('DelegateCallHelper: revert with no reason');
            assembly {
                let result_len := mload(result)
                revert(add(32, result), result_len)
            }
        }

        return result;
    }
}
