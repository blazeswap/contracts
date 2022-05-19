// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity >=0.5.0;

import './IBlazeSwapBaseManager.sol';
import './Enumerations.sol';

interface IBlazeSwapManager is IBlazeSwapBaseManager {
    function setRewardsFeeTo(address _rewardsFeeTo) external;

    function rewardsFeeTo() external view returns (address);

    function setRewardsFeeOn(bool _rewardsFeeOn) external;

    function rewardsFeeOn() external view returns (bool);

    function wNat() external view returns (address);

    function getTokenType(address token) external returns (TokenType tokenType);

    function delegationPlugin() external view returns (address);

    function ftsoRewardPlugin() external view returns (address);

    function fAssetRewardPlugin() external view returns (address);

    function setAssetManagerController(address _assetManagerController) external;

    function assetManagerController() external view returns (address);

    function setAllowFAssetPairsWithoutPlugin(bool _allowFAssetPairsWithoutPlugin) external;

    function allowFAssetPairsWithoutPlugin() external view returns (bool);

    function setDelegationPlugin(address _delegationPlugin) external;

    function setFtsoRewardPlugin(address _ftsoRewardPlugin) external;

    function setFAssetsRewardPlugin(address _fAssetRewardPlugin) external;

    function fAssetSupport() external view returns (FAssetSupport);
}
