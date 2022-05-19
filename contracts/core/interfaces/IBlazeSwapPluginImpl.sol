// SPDX-License-Identifier: BUSL-1.1
pragma solidity >=0.5.0;

interface IBlazeSwapPluginImpl {
    function pluginMetadata() external pure returns (bytes4[] memory selectors, bytes4 interfaceId);
}
