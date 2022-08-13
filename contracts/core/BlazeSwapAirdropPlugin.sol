// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import './interfaces/IBlazeSwapAirdropPlugin.sol';
import './BlazeSwapAirdrop.sol';

contract BlazeSwapAirdropPlugin is IBlazeSwapAirdropPlugin {
    address public immutable implementation = address(new BlazeSwapAirdrop());
}
