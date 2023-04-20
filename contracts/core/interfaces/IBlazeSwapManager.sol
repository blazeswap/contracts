// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity >=0.7.5;
pragma abicoder v2;

import './flare/IFlareContractRegistry.sol';
import './IBlazeSwapBaseManager.sol';

interface IBlazeSwapManager is IBlazeSwapBaseManager {
    enum Allow {
        No,
        YesUpgradable,
        YesNoPluginNeeded
    }

    function setFactory(address _factory) external;

    function factory() external view returns (address);

    function setFtsoRewardsFeeBips(uint256 _bips) external;

    function ftsoRewardsFeeBips() external view returns (uint256);

    function setFlareAssetRewardsFeeBips(uint256 _bips) external;

    function flareAssetRewardsFeeBips() external view returns (uint256);

    function setAirdropFeeBips(uint256 _bips) external;

    function airdropFeeBips() external view returns (uint256);

    function executorManager() external view returns (address);

    function getTokenType(address token) external view returns (bytes32);

    function rewardsPlugin() external view returns (address);

    function delegationPlugin() external view returns (address);

    function ftsoRewardPlugin() external view returns (address);

    function airdropPlugin() external view returns (address);

    function flareAssetRewardPlugin(bytes32 _assetType) external view returns (address);

    function setAllowFlareAssetPairsWithoutPlugin(
        bytes32 _assetType,
        Allow _allowFlareAssetPairsWithoutPlugin
    ) external;

    function allowFlareAssetPairsWithoutPlugin(bytes32 _assetType) external view returns (Allow);

    function setRewardsPlugin(address _rewardsPlugin) external;

    function setDelegationPlugin(address _delegationPlugin) external;

    function setFtsoRewardPlugin(address _ftsoRewardPlugin) external;

    function setAirdropPlugin(address _airdropPlugin) external;

    function setFlareAssetRewardPlugin(bytes32 _assetType, address _flareAssetRewardPlugin) external;

    function setPluginsForPair(address pair, address tokenA, address tokenB) external;

    function isFlareAssetPairWithoutPlugin(address pair) external view returns (bool);

    function upgradeFlareAssetPair(address pair) external;
}
