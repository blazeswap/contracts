// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import '../libraries/AddressStringUtil.sol';

contract AddressStringUtilTest {
    function toAsciiString(address addr, uint256 len) external pure returns (string memory) {
        return AddressStringUtil.toAsciiString(addr, len);
    }
}
