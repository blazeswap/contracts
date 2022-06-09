// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import './interfaces/IBlazeSwapExecutorManager.sol';

contract BlazeSwapExecutorManager is IBlazeSwapExecutorManager {
    // mapping(reward owner address, executor address) => uint8
    mapping(address => mapping(address => ExecutorPermission)) public executorPermission;

    function setExecutorPermission(address _executor, ExecutorPermission _permission) external {
        require(_executor != msg.sender, 'BlazeSwap: SELF_EXECUTOR');
        executorPermission[msg.sender][_executor] = _permission;
        emit Grant(msg.sender, _executor, _permission);
    }
}
