// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

library ReentrancyLockStorage {
    struct Layout {
        uint256 status;
    }

    bytes32 internal constant STORAGE_SLOT = keccak256('blazeswap.storage.ReentrancyLock');

    function layout() internal pure returns (Layout storage l) {
        bytes32 slot = STORAGE_SLOT;
        assembly {
            l.slot := slot
        }
    }
}

abstract contract ReentrancyLock {
    function initReentrancyLock() internal {
        ReentrancyLockStorage.layout().status = 1;
    }

    function internalLock() private {
        ReentrancyLockStorage.Layout storage l = ReentrancyLockStorage.layout();
        require(l.status != 2, 'ReentrancyLock: reentrant call');
        l.status = 2;
    }

    function internalUnlock() private {
        ReentrancyLockStorage.layout().status = 1;
    }

    modifier lock() {
        internalLock();
        _;
        internalUnlock();
    }
}
