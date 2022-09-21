// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity >=0.7.5;
pragma abicoder v2;

import './flare/IFtsoRewardManager.sol';
import './IBlazeSwapBaseManager.sol';
import './Enumerations.sol';

interface IBlazeSwapManager is IBlazeSwapBaseManager {
    event UpdateAssetManagerController(address assetManagerController);
    event AddFtsoRewardManager(address ftsoRewardManager);

    function updateFtsoRewardManagers(uint256 upTo) external;

    function getFtsoRewardManagers() external view returns (IFtsoRewardManager[] memory);

    function getActiveFtsoRewardManagers() external view returns (IFtsoRewardManager[] memory);

    function setRewardsFeeTo(address _rewardsFeeTo) external;

    function rewardsFeeTo() external view returns (address);

    function setFtsoRewardsFeeBips(uint256 _bips) external;

    function ftsoRewardsFeeBips() external view returns (uint256);

    function setFlareAssetRewardsFeeBips(uint256 _bips) external;

    function flareAssetRewardsFeeBips() external view returns (uint256);

    function setAirdropFeeBips(uint256 _bips) external;

    function airdropFeeBips() external view returns (uint256);

    function wNat() external view returns (address);

    function executorManager() external view returns (address);

    function getTokenType(address token) external view returns (TokenType tokenType);

    function delegationPlugin() external view returns (address);

    function ftsoRewardPlugin() external view returns (address);

    function airdropPlugin() external view returns (address);

    function flareAssetRewardPlugin() external view returns (address);

    function setAssetManagerController(address _assetManagerController) external;

    function getLatestAssetManagerController() external view returns (address controller);

    function updateAssetManagerController() external;

    function setAllowFlareAssetPairsWithoutPlugin(bool _allowFlareAssetPairsWithoutPlugin) external;

    function allowFlareAssetPairsWithoutPlugin() external view returns (bool);

    function setDelegationPlugin(address _delegationPlugin) external;

    function setFtsoRewardPlugin(address _ftsoRewardPlugin) external;

    function setAirdropPlugin(address _airdropPlugin) external;

    function setFlareAssetsRewardPlugin(address _flareAssetRewardPlugin) external;

    function flareAssetSupport() external view returns (FlareAssetSupport);
}
