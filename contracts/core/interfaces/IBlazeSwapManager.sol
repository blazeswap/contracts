// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity >=0.7.5;
pragma abicoder v2;

import './flare/IFtsoRewardManager.sol';
import './IBlazeSwapBaseManager.sol';
import './Enumerations.sol';

interface IBlazeSwapManager is IBlazeSwapBaseManager {
    event UpdateAssetManagerController(address assetManagerController);
    event AddFtsoRewardManager(address ftsoRewardManager);

    function updateFtsoRewardManagers() external;

    function getFtsoRewardManagers() external view returns (IFtsoRewardManager[] memory);

    function setRewardsFeeTo(address _rewardsFeeTo) external;

    function rewardsFeeTo() external view returns (address);

    function setRewardsFeeOn(bool _rewardsFeeOn) external;

    function rewardsFeeOn() external view returns (bool);

    function wNat() external view returns (address);

    function executorManager() external view returns (address);

    function getTokenType(address token) external view returns (TokenType tokenType);

    function delegationPlugin() external view returns (address);

    function ftsoRewardPlugin() external view returns (address);

    function fAssetRewardPlugin() external view returns (address);

    function setAssetManagerController(address _assetManagerController) external;

    function getLatestAssetManagerController() external view returns (address controller);

    function updateAssetManagerController() external;

    function setAllowFAssetPairsWithoutPlugin(bool _allowFAssetPairsWithoutPlugin) external;

    function allowFAssetPairsWithoutPlugin() external view returns (bool);

    function setDelegationPlugin(address _delegationPlugin) external;

    function setFtsoRewardPlugin(address _ftsoRewardPlugin) external;

    function setFAssetsRewardPlugin(address _fAssetRewardPlugin) external;

    function fAssetSupport() external view returns (FAssetSupport);
}
