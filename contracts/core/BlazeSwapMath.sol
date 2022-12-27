// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import '../shared/libraries/Babylonian.sol';
import '../shared/libraries/FullMath.sol';

contract BlazeSwapMath {
    function sqrt(uint256 x) external pure returns (uint256 r) {
        r = Babylonian.sqrt(x);
    }

    function mulDiv(uint256 x, uint256 y, uint256 z) external pure returns (uint256 r) {
        r = FullMath.mulDiv(x, y, z);
    }

    function mulDivRoundingUp(uint256 x, uint256 y, uint256 z) external pure returns (uint256 r) {
        r = FullMath.mulDivRoundingUp(x, y, z);
    }
}
