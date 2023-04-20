// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import '../shared/DelegatedCalls.sol';
import '../shared/MinimalPayableProxy.sol';
import '../shared/ReentrancyLock.sol';
import './interfaces/erc721/IERC721.sol';
import './interfaces/erc1155/IERC1155.sol';
import './interfaces/IBlazeSwapRewards.sol';
import './interfaces/IBlazeSwapRewardsPlugin.sol';
import './interfaces/IIBlazeSwapRewardsHook.sol';
import './interfaces/IIBlazeSwapRewardManager.sol';
import './BlazeSwapPair.sol';

library BlazeSwapRewardsStorage {
    bytes32 internal constant STORAGE_SLOT = keccak256('blazeswap.storage.BlazeSwapRewards');

    struct Layout {
        IBlazeSwapRewardsPlugin rewardsPlugin;
        IIBlazeSwapRewardManager rewardManager;
    }

    function layout() internal pure returns (Layout storage l) {
        bytes32 slot = STORAGE_SLOT;
        assembly {
            l.slot := slot
        }
    }
}

contract BlazeSwapRewards is IBlazeSwapRewards, IBlazeSwapPluginImpl, DelegatedCalls, ReentrancyLock {
    function checkRewardsFeeClaimer() private view {
        require(BlazeSwapRewardsStorage.layout().rewardsPlugin.isRewardsFeeClaimer(msg.sender), 'BlazeSwap: FORBIDDEN');
    }

    modifier onlyRewardsFeeClaimer() {
        checkRewardsFeeClaimer();
        _;
    }

    function checkUnmanagedToken(address token) private view {
        BlazeSwapPairStorage.Layout storage pl = BlazeSwapPairStorage.layout();
        require(token != pl.token0 && token != pl.token1 && token != address(this), 'BlazeSwap: TOKEN');
    }

    modifier onlyUnmanagedToken(address token) {
        checkUnmanagedToken(token);
        _;
    }

    function initialize(address _plugin) external onlyDelegatedCall {
        BlazeSwapRewardsStorage.Layout storage l = BlazeSwapRewardsStorage.layout();
        l.rewardsPlugin = IBlazeSwapRewardsPlugin(_plugin);
        l.rewardManager = IIBlazeSwapRewardManager(address(new MinimalPayableProxy(l.rewardsPlugin.rewardManager())));
        l.rewardManager.initialize(l.rewardsPlugin);
    }

    function withdrawRewardFees(
        bool wrapped
    ) external onlyDelegatedCall onlyRewardsFeeClaimer lock returns (uint256 rewardFees) {
        address[] storage plugins = BlazeSwapPairStorage.layout().rewardsPluginImpls;
        BlazeSwapRewardsStorage.Layout storage l = BlazeSwapRewardsStorage.layout();
        IIBlazeSwapRewardManager rewardManager = l.rewardManager; // gas savings
        uint256 totalRewards;
        for (uint256 i; i < plugins.length; i++) {
            bytes memory result = DelegateCallHelper.delegateAndCheckResult(
                plugins[i],
                abi.encodeWithSelector(IIBlazeSwapRewardsHook.unclaimedRewards.selector)
            );
            totalRewards += abi.decode(result, (uint256));
        }
        uint256 balance = rewardManager.rewardsBalance();
        rewardFees = balance - totalRewards;
        if (rewardFees > 0) {
            address feeTo = BlazeSwapRewardsStorage.layout().rewardsPlugin.rewardsFeeTo();
            require(feeTo != address(0), 'BlazeSwap: ZERO_ADDRESS');
            rewardManager.sendRewards(feeTo, rewardFees, !wrapped);
        }
    }

    function withdrawERC20(
        address token,
        uint256 amount,
        address destination
    ) external onlyDelegatedCall onlyRewardsFeeClaimer onlyUnmanagedToken(token) {
        IERC20(token).transfer(destination, amount);
    }

    function withdrawERC721(
        address token,
        uint256 id,
        address destination
    ) external onlyDelegatedCall onlyRewardsFeeClaimer onlyUnmanagedToken(token) {
        IERC721(token).transferFrom(address(this), destination, id);
    }

    function withdrawERC1155(
        address token,
        uint256 id,
        uint256 amount,
        address destination
    ) external onlyDelegatedCall onlyRewardsFeeClaimer onlyUnmanagedToken(token) {
        IERC1155(token).safeTransferFrom(address(this), destination, id, amount, '');
    }

    function pluginSelectors() private pure returns (bytes4[] memory s) {
        s = new bytes4[](4);
        s[0] = IBlazeSwapRewards.withdrawRewardFees.selector;
        s[1] = IBlazeSwapRewards.withdrawERC20.selector;
        s[2] = IBlazeSwapRewards.withdrawERC721.selector;
        s[3] = IBlazeSwapRewards.withdrawERC1155.selector;
    }

    function pluginMetadata() external pure returns (bytes4[] memory selectors, bytes4 interfaceId, uint256 hooksSet) {
        selectors = pluginSelectors();
        interfaceId = type(IBlazeSwapRewards).interfaceId;
        hooksSet = 0; // no hooks
    }
}
