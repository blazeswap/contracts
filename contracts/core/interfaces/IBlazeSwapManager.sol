// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity >=0.7.5;
pragma abicoder v2;

import './flare/IFlareContractRegistry.sol';
import './IBlazeSwapBaseManager.sol';
import './Enumerations.sol';

interface IBlazeSwapManager is IBlazeSwapBaseManager {
    function flareContractRegistry() external returns (IFlareContractRegistry);

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

    function setFlareAssetRegistry(address _flareAssetRegistry) external;

    function flareAssetRegistry() external view returns (address registry);

    function setAllowFlareAssetPairsWithoutPlugin(bool _allowFlareAssetPairsWithoutPlugin) external;

    function allowFlareAssetPairsWithoutPlugin() external view returns (bool);

    function setDelegationPlugin(address _delegationPlugin) external;

    function setFtsoRewardPlugin(address _ftsoRewardPlugin) external;

    function setAirdropPlugin(address _airdropPlugin) external;

    function setFlareAssetsRewardPlugin(address _flareAssetRewardPlugin) external;

    function flareAssetSupport() external view returns (FlareAssetSupport);
}
