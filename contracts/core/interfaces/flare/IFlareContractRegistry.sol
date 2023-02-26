// SPDX-License-Identifier: MIT
pragma solidity >=0.7.5;
pragma abicoder v2;

interface IFlareContractRegistry {
    function getContractAddressByHash(bytes32 _nameHash) external view returns (address);
}
