// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import './interfaces/IBlazeSwapFactory.sol';
import './BlazeSwapBaseFactory.sol';
import './BlazeSwapPair.sol';

contract BlazeSwapFactory is IBlazeSwapFactory, BlazeSwapBaseFactory {
    mapping(address => bool) public isFlareAssetPairWithoutPlugin;

    constructor(address _manager) BlazeSwapBaseFactory(_manager) {}

    function pairCreationCode() internal pure virtual override returns (bytes memory code) {
        code = type(BlazeSwapPair).creationCode;
    }

    function initializePair(address pair, address token0, address token1) internal virtual override {
        super.initializePair(pair, token0, token1);
        IBlazeSwapManager m = IBlazeSwapManager(manager);
        BlazeSwapPair p = BlazeSwapPair(payable(pair));
        TokenType type0 = m.getTokenType(token0);
        TokenType type1 = m.getTokenType(token1);
        p.initialize(manager, token0, token1, type0, type1);
        if (type0 != TokenType.Generic || type1 != TokenType.Generic) {
            // the following code assumes that the delegation and ftsoRewards
            // plugins are available from the beginning
            p.addPlugin(m.delegationPlugin());
            if (type0 == TokenType.WNat || type1 == TokenType.WNat) {
                p.addPlugin(m.ftsoRewardPlugin());
                if (block.chainid == 14 || block.chainid == 114) {
                    p.addPlugin(m.airdropPlugin());
                }
            }
            if (type0 == TokenType.FlareAsset || type1 == TokenType.FlareAsset) {
                FlareAssetSupport flareAssetSupport = m.flareAssetSupport();
                if (flareAssetSupport == FlareAssetSupport.Full) {
                    p.addPlugin(m.flareAssetRewardPlugin());
                } else if (flareAssetSupport == FlareAssetSupport.Minimal) {
                    isFlareAssetPairWithoutPlugin[pair] = true;
                } else {
                    revert('BlazeSwap: FASSET_UNSUPPORTED');
                }
            }
        }
    }

    function upgradeFlareAssetPair(address pair) external {
        IBlazeSwapManager m = IBlazeSwapManager(manager);
        address plugin = m.flareAssetRewardPlugin();
        require(plugin != address(0) && isFlareAssetPairWithoutPlugin[pair], 'BlazeSwap: UPGRADE_NOT_NEEDED');
        isFlareAssetPairWithoutPlugin[pair] = false;
        BlazeSwapPair(payable(pair)).addPlugin(plugin);
    }
}
