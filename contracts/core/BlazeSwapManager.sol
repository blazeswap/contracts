// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import './interfaces/flare/IAssetManagerController.sol';
import './interfaces/IBlazeSwapManager.sol';
import './interfaces/IBlazeSwapPlugin.sol';
import './interfaces/Enumerations.sol';
import './BlazeSwapBaseManager.sol';

contract BlazeSwapManager is IBlazeSwapManager, BlazeSwapBaseManager {
    address public rewardsFeeTo;
    bool public rewardsFeeOn;

    address public immutable wNat;
    address public assetManagerController;

    bool public allowFAssetPairsWithoutPlugin;

    address public delegationPlugin;
    address public ftsoRewardPlugin;
    address public fAssetRewardPlugin;

    constructor(
        address _configSetter,
        address _mathContext,
        address _wNat
    ) BlazeSwapBaseManager(_configSetter, _mathContext) {
        wNat = _wNat;
    }

    function setRewardsFeeTo(address _rewardsFeeTo) external onlyConfigSetter {
        rewardsFeeTo = _rewardsFeeTo;
    }

    function setRewardsFeeOn(bool _rewardsFeeOn) external onlyConfigSetter {
        rewardsFeeOn = _rewardsFeeOn;
    }

    function revertAlreadySet() internal pure {
        revert('BlazeSwap: ALREADY_SET');
    }

    function setDelegationPlugin(address _delegationPlugin) external onlyConfigSetter {
        if (delegationPlugin != address(0)) revertAlreadySet();
        address impl = IBlazeSwapPlugin(_delegationPlugin).implementation();
        require(impl != address(0), 'BlazeSwap: INVALID_PLUGIN');
        delegationPlugin = _delegationPlugin;
    }

    function setFtsoRewardPlugin(address _ftsoRewardPlugin) external onlyConfigSetter {
        if (ftsoRewardPlugin != address(0)) revertAlreadySet();
        address impl = IBlazeSwapPlugin(_ftsoRewardPlugin).implementation();
        require(impl != address(0), 'BlazeSwap: INVALID_PLUGIN');
        ftsoRewardPlugin = _ftsoRewardPlugin;
    }

    function updateAssetManagerController() private {
        while (true) {
            address replacedBy = IAssetManagerController(assetManagerController).replacedBy();
            if (replacedBy == address(0)) break;
            assetManagerController = replacedBy;
        }
    }

    function assetManagerExists(address assetManager) private view returns (bool) {
        return IAssetManagerController(assetManagerController).assetManagerExists(assetManager);
    }

    function isFAsset(address token) private returns (bool isFA) {
        (bool success, bytes memory result) = token.staticcall(abi.encodeWithSignature('assetManager()'));
        if (success && result.length == 32) {
            address assetManager = abi.decode(result, (address));
            if (assetManagerController == address(0)) {
                // simplified check
                isFA = assetManager != address(0);
            } else {
                // full verification
                isFA = assetManagerExists(assetManager);
                if (!isFA) {
                    updateAssetManagerController();
                    isFA = assetManagerExists(assetManager);
                }
            }
        }
    }

    function isWNat(address token) private view returns (bool) {
        return token == wNat;
    }

    function getTokenType(address token) external returns (TokenType tokenType) {
        if (isWNat(token)) tokenType = TokenType.WNat;
        else if (isFAsset(token)) tokenType = TokenType.FAsset;
        else tokenType = TokenType.Generic;
    }

    function setAssetManagerController(address _assetManagerController) external onlyConfigSetter {
        if (assetManagerController != address(0)) revertAlreadySet();
        assetManagerController = _assetManagerController;
    }

    function setAllowFAssetPairsWithoutPlugin(bool _allowFAssetPairsWithoutPlugin) external onlyConfigSetter {
        allowFAssetPairsWithoutPlugin = _allowFAssetPairsWithoutPlugin;
    }

    function setFAssetsRewardPlugin(address _fAssetRewardPlugin) external onlyConfigSetter {
        if (fAssetRewardPlugin != address(0)) revertAlreadySet();
        address impl = IBlazeSwapPlugin(_fAssetRewardPlugin).implementation();
        require(impl != address(0), 'BlazeSwap: INVALID_PLUGIN');
        fAssetRewardPlugin = _fAssetRewardPlugin;
        allowFAssetPairsWithoutPlugin = false;
    }

    function fAssetSupport() external view returns (FAssetSupport) {
        if (assetManagerController == address(0)) return FAssetSupport.None;
        if (fAssetRewardPlugin != address(0)) return FAssetSupport.Full;
        return allowFAssetPairsWithoutPlugin ? FAssetSupport.Minimal : FAssetSupport.None;
    }
}
