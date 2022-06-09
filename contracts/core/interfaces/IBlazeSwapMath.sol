// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity >=0.7.5;
pragma abicoder v2;

interface IBlazeSwapMath {
    function sqrt(uint256 x) external pure returns (uint256 r);

    function mulDiv(
        uint256 x,
        uint256 y,
        uint256 z
    ) external pure returns (uint256 r);

    function mulDivRoundingUp(
        uint256 x,
        uint256 y,
        uint256 z
    ) external pure returns (uint256 r);
}
