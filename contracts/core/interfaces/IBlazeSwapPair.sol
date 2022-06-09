// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity >=0.7.5;
pragma abicoder v2;

import './eip2535/IDiamondCut.sol';
import './eip2535/IDiamondLoupe.sol';
import './erc20/IERC20Snapshot.sol';
import './erc165/IERC165.sol';
import './IBlazeSwapBasePair.sol';
import './IBlazeSwapMulticall.sol';
import './Enumerations.sol';

interface IBlazeSwapPair is
    IBlazeSwapBasePair,
    IBlazeSwapMulticall,
    IERC20Snapshot,
    IERC165,
    IDiamondLoupe,
    IDiamondCut
{
    function type0() external view returns (TokenType);

    function type1() external view returns (TokenType);
}
