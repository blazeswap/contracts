// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import './interfaces/flare/IFlareAssetRegistry.sol';
import './interfaces/flare/IFtsoRewardManager.sol';
import './interfaces/IBlazeSwapManager.sol';
import './interfaces/IBlazeSwapPlugin.sol';
import './interfaces/Enumerations.sol';
import './libraries/FlareLibrary.sol';
import './BlazeSwapBaseManager.sol';
import './BlazeSwapExecutorManager.sol';

contract BlazeSwapManager is IBlazeSwapManager, BlazeSwapBaseManager {
    using FlareLibrary for IFlareContractRegistry;

    IFlareContractRegistry public immutable flareContractRegistry;

    address public rewardsFeeTo;

    uint256 public ftsoRewardsFeeBips;
    uint256 public flareAssetRewardsFeeBips;
    uint256 public airdropFeeBips;

    address public immutable wNat;
    address public immutable executorManager;

    address public flareAssetRegistry;

    bool public allowFlareAssetPairsWithoutPlugin;

    address public delegationPlugin;
    address public ftsoRewardPlugin;
    address public flareAssetRewardPlugin;
    address public airdropPlugin;

    constructor(address _configSetter, address _flareContractRegistry) BlazeSwapBaseManager(_configSetter) {
        executorManager = address(new BlazeSwapExecutorManager());
        flareContractRegistry = IFlareContractRegistry(_flareContractRegistry);
        wNat = address(flareContractRegistry.getWNat());
    }

    function setRewardsFeeTo(address _rewardsFeeTo) external onlyConfigSetter {
        rewardsFeeTo = _rewardsFeeTo;
    }

    function setFtsoRewardsFeeBips(uint256 _bips) external onlyConfigSetter {
        require(_bips <= 5_00, 'BlazeSwap: INVALID_FEE');
        ftsoRewardsFeeBips = _bips;
    }

    function setFlareAssetRewardsFeeBips(uint256 _bips) external onlyConfigSetter {
        require(_bips <= 5_00, 'BlazeSwap: INVALID_FEE');
        flareAssetRewardsFeeBips = _bips;
    }

    function setAirdropFeeBips(uint256 _bips) external onlyConfigSetter {
        require(_bips <= 5_00, 'BlazeSwap: INVALID_FEE');
        airdropFeeBips = _bips;
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

    function setAirdropPlugin(address _airdropPlugin) external onlyConfigSetter {
        if (airdropPlugin != address(0)) revertAlreadySet();
        address impl = IBlazeSwapPlugin(_airdropPlugin).implementation();
        require(impl != address(0), 'BlazeSwap: INVALID_PLUGIN');
        airdropPlugin = _airdropPlugin;
    }

    function isFlareAsset(address token) private view returns (bool) {
        return flareAssetRegistry != address(0) && IFlareAssetRegistry(flareAssetRegistry).isFlareAsset(token);
    }

    function isWNat(address token) private view returns (bool) {
        return token == wNat;
    }

    function getTokenType(address token) external view returns (TokenType tokenType) {
        if (isWNat(token)) tokenType = TokenType.WNat;
        else if (isFlareAsset(token)) tokenType = TokenType.FlareAsset;
        else tokenType = TokenType.Generic;
    }

    function setFlareAssetRegistry(address _flareAssetRegistry) external onlyConfigSetter {
        flareAssetRegistry = _flareAssetRegistry;
    }

    function setAllowFlareAssetPairsWithoutPlugin(bool _allowFlareAssetPairsWithoutPlugin) external onlyConfigSetter {
        allowFlareAssetPairsWithoutPlugin = _allowFlareAssetPairsWithoutPlugin;
    }

    function setFlareAssetsRewardPlugin(address _flareAssetRewardPlugin) external onlyConfigSetter {
        if (flareAssetRewardPlugin != address(0)) revertAlreadySet();
        address impl = IBlazeSwapPlugin(_flareAssetRewardPlugin).implementation();
        require(impl != address(0), 'BlazeSwap: INVALID_PLUGIN');
        flareAssetRewardPlugin = _flareAssetRewardPlugin;
        allowFlareAssetPairsWithoutPlugin = false;
    }

    function flareAssetSupport() external view returns (FlareAssetSupport) {
        if (flareAssetRegistry == address(0)) return FlareAssetSupport.None;
        if (flareAssetRewardPlugin != address(0)) return FlareAssetSupport.Full;
        return allowFlareAssetPairsWithoutPlugin ? FlareAssetSupport.Minimal : FlareAssetSupport.None;
    }
}
