// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

library DelegatedCallsStorage {
    struct Layout {
        address me;
    }

    bytes32 internal constant STORAGE_SLOT = keccak256('blazeswap.storage.DelegatedCalls');

    function layout() internal pure returns (Layout storage l) {
        bytes32 slot = STORAGE_SLOT;
        assembly {
            l.slot := slot
        }
    }
}

abstract contract DelegatedCalls {
    constructor() {
        DelegatedCallsStorage.layout().me = address(this);
    }

    function check(bool wantDelegated) private view {
        bool isDelegated = DelegatedCallsStorage.layout().me != address(this);
        if (wantDelegated) {
            require(isDelegated, 'DelegatedCalls: standard call');
        } else {
            require(!isDelegated, 'DelegatedCalls: delegated call');
        }
    }

    modifier onlyDelegatedCall() {
        check(true);
        _;
    }

    modifier onlyStandardCall() {
        check(false);
        _;
    }
}
