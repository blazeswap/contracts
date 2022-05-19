// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import '../ReentrancyLock.sol';

contract ReentrancyLockTest is ReentrancyLock {
    function reentrantCall() internal {
        ReentrancyLockTest(address(this)).lockedCall(false);
    }

    function lockedCall(bool trigger) external lock {
        if (trigger) reentrantCall();
    }
}
