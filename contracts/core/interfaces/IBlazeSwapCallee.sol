// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity >=0.5.0;

interface IBlazeSwapCallee {
    function blazeSwapCall(
        address sender,
        uint256 amount0,
        uint256 amount1,
        bytes calldata data
    ) external;
}
