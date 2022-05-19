// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity >=0.5.0;

import './IBlazeSwapBaseFactory.sol';

interface IBlazeSwapFactory is IBlazeSwapBaseFactory {
    function isFAssetPairWithoutPlugin(address pair) external view returns (bool);

    function upgradeFAssetPair(address pair) external;
}
