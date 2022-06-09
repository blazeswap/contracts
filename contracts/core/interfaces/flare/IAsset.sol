// SPDX-License-Identifier: MIT
pragma solidity >=0.7.5;
pragma abicoder v2;

interface IAsset {
    function assetManager() external view returns (address);
}
