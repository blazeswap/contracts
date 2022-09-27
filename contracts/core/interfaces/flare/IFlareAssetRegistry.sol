// SPDX-License-Identifier: MIT
pragma solidity >=0.7.5;
pragma abicoder v2;

interface IFlareAssetRegistry {
    function isFlareAsset(address token) external view returns (bool);

    function supportsFtsoDelegation(address token) external view returns (bool);

    function maxDelegatesByPercent(address token) external view returns (uint256);

    function incentivePoolFor(address token) external view returns (address);
}
