// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import './interfaces/flare/IAssetManagerController.sol';
import './interfaces/flare/IFtsoRewardManager.sol';
import './interfaces/IBlazeSwapManager.sol';
import './interfaces/IBlazeSwapPlugin.sol';
import './interfaces/Enumerations.sol';
import './libraries/BlazeSwapFlareLibrary.sol';
import './BlazeSwapBaseManager.sol';
import './BlazeSwapExecutorManager.sol';

contract BlazeSwapManager is IBlazeSwapManager, BlazeSwapBaseManager {
    address public rewardsFeeTo;
    bool public rewardsFeeOn;

    address public immutable wNat;
    address public immutable executorManager;

    IFtsoRewardManager[] private ftsoRewardManagers;
    IFtsoRewardManager[] private ftsoRewardManagersTmp;

    address private assetManagerController;

    bool public allowFAssetPairsWithoutPlugin;

    address public delegationPlugin;
    address public ftsoRewardPlugin;
    address public fAssetRewardPlugin;

    constructor(address _configSetter) BlazeSwapBaseManager(_configSetter) {
        executorManager = address(new BlazeSwapExecutorManager());
        IFtsoRewardManager ftsoRewardManager = BlazeSwapFlareLibrary.getFtsoRewardManager(
            BlazeSwapFlareLibrary.getFtsoManager()
        );
        wNat = ftsoRewardManager.wNat();
        ftsoRewardManagers.push(ftsoRewardManager);
        emit AddFtsoRewardManager(address(ftsoRewardManager));
    }

    function getPreviousFtsoRewardManager(IFtsoRewardManager current) private view returns (IFtsoRewardManager) {
        try current.oldFtsoRewardManager() returns (address previous) {
            return IFtsoRewardManager(previous);
        } catch {
            // FtsoRewardManagerV1 without oldFtsoRewardManager
            return IFtsoRewardManager(address(0));
        }
    }

    function updateFtsoRewardManagers() external {
        IFtsoRewardManager lastSaved = ftsoRewardManagers[ftsoRewardManagers.length - 1];
        IFtsoRewardManager current = BlazeSwapFlareLibrary.getFtsoRewardManager(BlazeSwapFlareLibrary.getFtsoManager());
        if (current != lastSaved) {
            do {
                ftsoRewardManagersTmp.push(current);
                IFtsoRewardManager previous = getPreviousFtsoRewardManager(current);
                if (previous == lastSaved || address(previous) == address(0)) break;
                current = previous;
            } while (true);
            for (uint256 i = ftsoRewardManagersTmp.length; i > 0; i--) {
                IFtsoRewardManager ftsoRewardManager = ftsoRewardManagersTmp[i - 1];
                ftsoRewardManagers.push(ftsoRewardManager);
                ftsoRewardManagersTmp.pop();
                emit AddFtsoRewardManager(address(ftsoRewardManager));
            }
        }
    }

    function getFtsoRewardManagers() public view returns (IFtsoRewardManager[] memory managers) {
        IFtsoRewardManager lastSaved = ftsoRewardManagers[ftsoRewardManagers.length - 1];
        IFtsoRewardManager current = BlazeSwapFlareLibrary.getFtsoRewardManager(BlazeSwapFlareLibrary.getFtsoManager());
        if (current == lastSaved) {
            // no changes
            managers = ftsoRewardManagers;
        } else {
            // new ftso reward manager(s), handle up to 2 new
            IFtsoRewardManager[] memory extra = new IFtsoRewardManager[](3);
            uint256 count;
            extra[count] = current;
            do {
                count++;
                require(count < extra.length, 'BlazeSwap: FTSO_REWARD_MANAGERS');
                extra[count] = getPreviousFtsoRewardManager(extra[count - 1]);
            } while (extra[count] != lastSaved && address(extra[count]) != address(0));
            uint256 previousLen = ftsoRewardManagers.length;
            managers = new IFtsoRewardManager[](previousLen + count);
            for (uint256 i; i < previousLen; i++) {
                managers[i] = ftsoRewardManagers[i];
            }
            for (uint256 i; i < count; i++) {
                managers[previousLen + i] = extra[count - i - 1];
            }
        }
    }

    function getActiveFtsoRewardManagers() external view returns (IFtsoRewardManager[] memory managers) {
        IFtsoRewardManager[] memory allManagers = getFtsoRewardManagers();
        bool[] memory enabledStatus = new bool[](allManagers.length);
        uint256 disabledCount;
        for (uint256 i; i < allManagers.length; i++) {
            bool active = allManagers[i].active();
            if (active) {
                enabledStatus[i] = true;
            } else {
                disabledCount++;
            }
        }
        if (disabledCount == 0) {
            managers = allManagers;
        } else {
            managers = new IFtsoRewardManager[](allManagers.length - disabledCount);
            uint256 j;
            for (uint256 i; i < allManagers.length; i++) {
                if (enabledStatus[i]) {
                    managers[j++] = allManagers[i];
                }
            }
        }
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

    function getLatestAssetManagerController() public view returns (address controller) {
        controller = assetManagerController;
        while (controller != address(0)) {
            address replacedBy = IAssetManagerController(controller).replacedBy();
            if (replacedBy == address(0)) break;
            controller = replacedBy;
        }
    }

    function updateAssetManagerController() public {
        address current = assetManagerController;
        address latest = getLatestAssetManagerController();
        if (latest != current) {
            assetManagerController = latest;
            emit UpdateAssetManagerController(latest);
        }
    }

    function assetManagerExists(address _assetManagerController, address _assetManager) private view returns (bool) {
        return IAssetManagerController(_assetManagerController).assetManagerExists(_assetManager);
    }

    function isFAsset(address token) private view returns (bool isFA) {
        (bool success, bytes memory result) = token.staticcall(abi.encodeWithSignature('assetManager()'));
        if (success && result.length == 32) {
            address assetManager = abi.decode(result, (address));
            if (assetManagerController == address(0)) {
                // simplified check
                isFA = assetManager != address(0);
            } else {
                // full verification
                isFA = assetManagerExists(assetManagerController, assetManager);
                if (!isFA) {
                    // recheck in case the controller has been updated
                    isFA = assetManagerExists(getLatestAssetManagerController(), assetManager);
                }
            }
        }
    }

    function isWNat(address token) private view returns (bool) {
        return token == wNat;
    }

    function getTokenType(address token) external view returns (TokenType tokenType) {
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
