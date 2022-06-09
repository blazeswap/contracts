// SPDX-License-Identifier: BUSL-1.1
pragma solidity >=0.7.5;
pragma abicoder v2;

enum ExecutorPermission {
    None,
    OwnerOnly,
    AnyAddress
}

interface IBlazeSwapExecutorManager {
    event Grant(address indexed owner, address indexed executor, ExecutorPermission permission);

    function executorPermission(address rewardOwnerAddress, address executorAddress)
        external
        view
        returns (ExecutorPermission);

    function setExecutorPermission(address _executor, ExecutorPermission _permission) external;
}
