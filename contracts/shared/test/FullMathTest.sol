// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import '../libraries/FullMath.sol';

contract FullMathTest {
    function mulDiv(uint256 x, uint256 y, uint256 z) external pure returns (uint256) {
        return FullMath.mulDiv(x, y, z);
    }

    function mulDivRoundingUp(uint256 x, uint256 y, uint256 z) external pure returns (uint256) {
        return FullMath.mulDivRoundingUp(x, y, z);
    }
}
