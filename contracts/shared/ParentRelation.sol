// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

library ParentRelationStorage {
    struct Layout {
        address parent;
    }

    bytes32 internal constant STORAGE_SLOT = keccak256('blazeswap.storage.ParentRelation');

    function layout() internal pure returns (Layout storage l) {
        bytes32 slot = STORAGE_SLOT;
        assembly {
            l.slot := slot
        }
    }
}

abstract contract ParentRelation {
    constructor() {
        initParentRelation(msg.sender);
    }

    function initParentRelation(address _parent) internal {
        ParentRelationStorage.layout().parent = _parent;
    }

    function checkParent() private view {
        require(ParentRelationStorage.layout().parent == msg.sender, 'ParentRelation: FORBIDDEN');
    }

    modifier onlyParent() {
        checkParent();
        _;
    }
}
