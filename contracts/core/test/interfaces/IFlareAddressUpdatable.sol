// SPDX-License-Identifier: MIT
pragma solidity >=0.7.5;
pragma abicoder v2;

interface IFlareAddressUpdatable {
    function updateContractAddress(bytes32 _nameHash, address _address) external;
}
