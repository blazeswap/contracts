// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import '../interfaces/flare/IFlareContractRegistry.sol';

import './interfaces/IFlareAddressUpdatable.sol';

contract FlareContractRegistry is IFlareContractRegistry {
    mapping(bytes32 => address) private contracts;

    function encode(string memory _value) internal pure returns (bytes32) {
        return keccak256(abi.encode(_value));
    }

    function setContractAddress(
        string memory _name,
        address _address,
        IFlareAddressUpdatable[] memory _contractsToUpdate
    ) external {
        bytes32 nameHash = encode(_name);
        contracts[nameHash] = _address;
        for (uint256 i; i < _contractsToUpdate.length; i++) {
            _contractsToUpdate[i].updateContractAddress(nameHash, _address);
        }
    }

    function getContractAddressByHash(bytes32 _nameHash) external view returns (address) {
        return contracts[_nameHash];
    }

    function getContractAddressByName(string calldata _name) external view returns (address) {
        return contracts[encode(_name)];
    }
}
