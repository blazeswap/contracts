// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import '../ParentRelation.sol';

contract Child is ParentRelation {
    function test() external view onlyParent returns (uint256) {
        return 1;
    }
}

contract ParentRelationTest {
    Child public c = new Child();

    function test() external view returns (uint256) {
        return c.test();
    }
}
