// SPDX-License-Identifier: MIT
pragma solidity >=0.7.5;
pragma abicoder v2;

interface IBlazeSwapMulticall {
    function multicall(bytes[] calldata data) external payable returns (bytes[] memory results);
}
