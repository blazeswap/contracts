// SPDX-License-Identifier: MIT
pragma solidity >=0.5.0;

interface IBlazeSwapMulticall {
    function multicall(bytes[] calldata data) external payable returns (bytes[] memory results);
}
