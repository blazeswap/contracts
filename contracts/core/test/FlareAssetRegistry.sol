// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import '../interfaces/flare/IFlareAssetRegistry.sol';

import './interfaces/IFlareAddressUpdatable.sol';

contract FlareAssetRegistry is IFlareAssetRegistry, IFlareAddressUpdatable {
    // TODO support type
    mapping(address => bool) public isFlareAsset;
    mapping(address => uint256) public maxDelegatesByPercent;
    mapping(address => address) public incentivePoolFor;

    function addFlareAsset(address token, uint256 _maxDelegatesByPercent) public {
        isFlareAsset[token] = true;
        maxDelegatesByPercent[token] = _maxDelegatesByPercent;
    }

    function addIncentivePoolFor(address token, address pool) external {
        incentivePoolFor[token] = pool;
    }

    function supportsFtsoDelegation(address token) external view returns (bool) {
        return maxDelegatesByPercent[token] > 0;
    }

    function updateContractAddress(bytes32 _nameHash, address _address) external {
        if (_nameHash == keccak256(abi.encode('WNat'))) {
            addFlareAsset(_address, 2);
        }
    }
}
