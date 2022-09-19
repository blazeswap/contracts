// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import './interfaces/IBlazeSwapMulticall.sol';

import '../shared/libraries/DelegateCallHelper.sol';

abstract contract BlazeSwapMulticall is IBlazeSwapMulticall {
    function multicall(bytes[] calldata data) external returns (bytes[] memory results) {
        results = new bytes[](data.length);
        for (uint256 i; i < data.length; i++) {
            results[i] = DelegateCallHelper.delegateAndCheckResult(address(this), data[i]);
        }
    }
}
