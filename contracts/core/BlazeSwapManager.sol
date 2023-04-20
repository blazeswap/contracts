// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import './interfaces/flare/IFlareAssetRegistry.sol';
import './interfaces/flare/IFtsoRewardManager.sol';
import './interfaces/IBlazeSwapManager.sol';
import './interfaces/IBlazeSwapPlugin.sol';
import './libraries/FlareLibrary.sol';
import './BlazeSwapBaseManager.sol';
import './BlazeSwapExecutorManager.sol';
import './BlazeSwapPair.sol';

contract BlazeSwapManager is IBlazeSwapManager, BlazeSwapBaseManager {
    bytes32 private constant TYPE_GENERIC = 0;
    bytes32 private constant TYPE_WNAT = keccak256(bytes('wrapped native'));

    address public factory;

    uint256 public ftsoRewardsFeeBips;
    uint256 public flareAssetRewardsFeeBips;
    uint256 public airdropFeeBips;

    address public immutable executorManager;

    address public rewardsPlugin;
    address public delegationPlugin;
    address public ftsoRewardPlugin;
    address public airdropPlugin;

    mapping(bytes32 => Allow) public allowFlareAssetPairsWithoutPlugin;
    mapping(bytes32 => address) public flareAssetRewardPlugin;
    mapping(address => bool) public isFlareAssetPairWithoutPlugin;

    function revertAlreadySet() internal pure {
        revert('BlazeSwap: ALREADY_SET');
    }

    constructor(address _configSetter) BlazeSwapBaseManager(_configSetter) {
        executorManager = address(new BlazeSwapExecutorManager());
    }

    function setFactory(address _factory) external onlyConfigSetter {
        if (factory != address(0)) revertAlreadySet();
        factory = _factory;
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

    function setRewardsPlugin(address _rewardsPlugin) external onlyConfigSetter {
        if (rewardsPlugin != address(0)) revertAlreadySet();
        address impl = IBlazeSwapPlugin(_rewardsPlugin).implementation();
        require(impl != address(0), 'BlazeSwap: INVALID_PLUGIN');
        rewardsPlugin = _rewardsPlugin;
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

    function getAssetType(address token) private view returns (bytes32 assetType) {
        IFlareAssetRegistry registry = FlareLibrary.getFlareAssetRegistry();
        if (address(registry) != address(0)) assetType = registry.assetType(token);
    }

    function isWNat(address token) private view returns (bool) {
        return token == address(FlareLibrary.getWNat());
    }

    function getTokenType(address token) public view returns (bytes32) {
        return isWNat(token) ? TYPE_WNAT : getAssetType(token);
    }

    function setAllowFlareAssetPairsWithoutPlugin(
        bytes32 _assetType,
        Allow _allowFlareAssetPairsWithoutPlugin
    ) external onlyConfigSetter {
        if (flareAssetRewardPlugin[_assetType] != address(0)) revertAlreadySet();
        allowFlareAssetPairsWithoutPlugin[_assetType] = _allowFlareAssetPairsWithoutPlugin;
    }

    function setFlareAssetRewardPlugin(bytes32 _assetType, address _flareAssetRewardPlugin) external onlyConfigSetter {
        if (flareAssetRewardPlugin[_assetType] != address(0)) revertAlreadySet();
        address impl = IBlazeSwapPlugin(_flareAssetRewardPlugin).implementation();
        require(impl != address(0), 'BlazeSwap: INVALID_PLUGIN');
        flareAssetRewardPlugin[_assetType] = _flareAssetRewardPlugin;
        allowFlareAssetPairsWithoutPlugin[_assetType] = Allow.No;
    }

    function setPluginsForPair(address pair, address tokenA, address tokenB) external {
        require(msg.sender == factory, 'BlazeSwap: FORBIDDEN');
        bytes32 typeA = getTokenType(tokenA);
        bytes32 typeB = getTokenType(tokenB);
        BlazeSwapPair p = BlazeSwapPair(pair);
        p.addPlugin(rewardsPlugin);
        if (typeA != TYPE_GENERIC || typeB != TYPE_GENERIC) {
            p.addPlugin(delegationPlugin);
            if (typeA == TYPE_WNAT || typeB == TYPE_WNAT) {
                p.addPlugin(ftsoRewardPlugin);
                if ((block.chainid == 14 || block.chainid == 114) && IBlazeSwapPlugin(airdropPlugin).active()) {
                    p.addPlugin(airdropPlugin);
                }
            }
            if (typeA != TYPE_GENERIC && typeA != TYPE_WNAT) addFlareAssetPlugin(p, typeA, false);
            if (typeB != TYPE_GENERIC && typeB != TYPE_WNAT) addFlareAssetPlugin(p, typeB, false);
        }
    }

    function addFlareAssetPlugin(BlazeSwapPair p, bytes32 assetType, bool update) private {
        address plugin = flareAssetRewardPlugin[assetType];
        if (plugin != address(0)) {
            if (IBlazeSwapPlugin(airdropPlugin).active()) p.addPlugin(plugin);
        } else if (allowFlareAssetPairsWithoutPlugin[assetType] == Allow.YesUpgradable) {
            isFlareAssetPairWithoutPlugin[address(p)] = true;
        } else if (allowFlareAssetPairsWithoutPlugin[assetType] == Allow.No && !update) {
            revert('BlazeSwap: FASSET_UNSUPPORTED');
        }
    }

    function upgradeFlareAssetPair(address pair) external {
        require(isFlareAssetPairWithoutPlugin[pair], 'BlazeSwap: UPGRADE_NOT_NEEDED');
        isFlareAssetPairWithoutPlugin[pair] = false;
        BlazeSwapPair p = BlazeSwapPair(pair);
        bytes32 typeA = getTokenType(p.token0());
        bytes32 typeB = getTokenType(p.token1());
        if (typeA != TYPE_GENERIC && typeA != TYPE_WNAT) addFlareAssetPlugin(p, typeA, true);
        if (typeB != TYPE_GENERIC && typeB != TYPE_WNAT) addFlareAssetPlugin(p, typeB, true);
    }
}
