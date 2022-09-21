// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity >=0.7.5;
pragma abicoder v2;

enum TokenType {
    Generic,
    WNat,
    FlareAsset
}

enum FlareAssetSupport {
    None,
    Minimal,
    Full
}
