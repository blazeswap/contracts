// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import '../interfaces/flare/IFlareAssetRegistry.sol';

import './interfaces/IFlareAddressUpdatable.sol';

contract FlareAssetRegistry is IFlareAssetRegistry, IFlareAddressUpdatable {
    mapping(address => bool) public isFlareAsset;
    mapping(address => bytes32) public assetType;
    mapping(address => uint256) public maxDelegatesByPercent;
    mapping(address => address) public incentivePoolFor;

    function addFlareAsset(address token, string memory _type, uint256 _maxDelegatesByPercent) public {
        isFlareAsset[token] = true;
        assetType[token] = keccak256(bytes(_type));
        maxDelegatesByPercent[token] = _maxDelegatesByPercent;
    }

    function addIncentivePoolFor(address token, address pool) external {
        incentivePoolFor[token] = pool;
    }

    function supportsFtsoDelegation(address token) external view returns (bool) {
        require(isFlareAsset[token], 'invalid token address');
        return maxDelegatesByPercent[token] > 0;
    }

    function updateContractAddress(bytes32 _nameHash, address _address) external {
        if (_nameHash == keccak256(abi.encode('WNat'))) {
            addFlareAsset(_address, 'wrapped native', 2);
        }
    }
}
