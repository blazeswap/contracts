// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import './interfaces/IBlazeSwapBaseFactory.sol';
import './BlazeSwapBasePair.sol';

contract BlazeSwapBaseFactory is IBlazeSwapBaseFactory {
    address public immutable manager;

    mapping(address => mapping(address => address)) public getPair;
    address[] public allPairs;

    constructor(address _manager) {
        require(_manager != address(0), 'BlazeSwap: ZERO_ADDRESS');
        manager = _manager;
    }

    function allPairsLength() external view returns (uint256) {
        return allPairs.length;
    }

    function pairCreationCode() internal pure virtual returns (bytes memory code) {
        code = type(BlazeSwapBasePair).creationCode;
    }

    function initializePair(
        address pair,
        address token0,
        address token1
    ) internal virtual {
        BlazeSwapBasePair(pair).initialize(manager, token0, token1);
    }

    function createPair(address tokenA, address tokenB) external returns (address pair) {
        require(tokenA != tokenB, 'BlazeSwap: IDENTICAL_ADDRESSES');
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(token0 != address(0), 'BlazeSwap: ZERO_ADDRESS');
        require(getPair[token0][token1] == address(0), 'BlazeSwap: PAIR_EXISTS'); // single check is sufficient

        // this way to create a contract (instead of `new`) allows to use deterministic addresses
        bytes32 salt = keccak256(abi.encodePacked(token0, token1));
        bytes memory bytecode = pairCreationCode();
        assembly {
            pair := create2(0, add(bytecode, 32), mload(bytecode), salt)
        }
        initializePair(pair, token0, token1);
        getPair[token0][token1] = pair;
        getPair[token1][token0] = pair; // populate mapping in the reverse direction
        allPairs.push(pair);
        emit PairCreated(token0, token1, pair, allPairs.length);
    }
}
