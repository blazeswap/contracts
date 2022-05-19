// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import '../DelegatedCalls.sol';
import '../libraries/DelegateCallHelper.sol';

contract DelegatedCallsTest is DelegatedCalls {
    function delegated() external view onlyDelegatedCall {}

    function standard() external view onlyStandardCall {}
}

contract DelegatorTest {
    DelegatedCallsTest public c = new DelegatedCallsTest();

    function testStandard(bool delegatedFunc) external view {
        if (delegatedFunc) {
            c.delegated();
        } else {
            c.standard();
        }
    }

    function testDelegated(bool delegatedFunc) external {
        bytes4 funcSelector;
        if (delegatedFunc) {
            funcSelector = DelegatedCallsTest.delegated.selector;
        } else {
            funcSelector = DelegatedCallsTest.standard.selector;
        }
        DelegateCallHelper.delegateAndCheckResult(address(c), abi.encodeWithSelector(funcSelector));
    }
}
