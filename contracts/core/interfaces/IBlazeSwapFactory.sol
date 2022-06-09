// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity >=0.7.5;
pragma abicoder v2;

import './IBlazeSwapBaseFactory.sol';

interface IBlazeSwapFactory is IBlazeSwapBaseFactory {
    function isFAssetPairWithoutPlugin(address pair) external view returns (bool);

    function upgradeFAssetPair(address pair) external;
}
