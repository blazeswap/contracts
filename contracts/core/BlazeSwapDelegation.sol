// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import '../shared/libraries/AddressSet.sol';
import '../shared/libraries/DelegateCallHelper.sol';
import '../shared/Configurable.sol';
import '../shared/DelegatedCalls.sol';
import '../shared/MinimalPayableProxy.sol';
import '../shared/ReentrancyLock.sol';
import './interfaces/IBlazeSwapDelegation.sol';
import './interfaces/IBlazeSwapDelegationPlugin.sol';
import './interfaces/IBlazeSwapFactory.sol';
import './interfaces/IBlazeSwapManager.sol';
import './interfaces/IBlazeSwapPair.sol';
import './interfaces/IBlazeSwapRewards.sol';
import './interfaces/IIBlazeSwapTransferHook.sol';
import './interfaces/flare/IFlareAssetRegistry.sol';
import './interfaces/flare/IWNat.sol';
import './libraries/BlazeSwapRewardLibrary.sol';
import './libraries/FlareLibrary.sol';
import './libraries/Delegator.sol';
import './BlazeSwapPair.sol';
import './BlazeSwapRewards.sol';

library BlazeSwapDelegationStorage {
    bytes32 internal constant STORAGE_SLOT = keccak256('blazeswap.storage.BlazeSwapDelegation');

    struct BlockAndOrigin {
        uint256 blockNum;
        address origin;
    }

    struct Layout {
        IBlazeSwapDelegationPlugin plugin;
        mapping(address => address) providerDelegation; // delegator => provider
        mapping(address => uint256) providerVotes; // provider => votes
        AddressSet.State allProviders;
        BlockAndOrigin lastProvidersChange;
    }

    function layout() internal pure returns (Layout storage l) {
        bytes32 slot = STORAGE_SLOT;
        assembly {
            l.slot := slot
        }
    }
}

contract BlazeSwapDelegation is
    IBlazeSwapDelegation,
    IBlazeSwapPluginImpl,
    IIBlazeSwapTransferHook,
    DelegatedCalls,
    ReentrancyLock
{
    using AddressSet for AddressSet.State;
    using FlareLibrary for IFtsoManager;
    using Delegator for IVPToken;

    function initialize(address _plugin) external onlyDelegatedCall {
        BlazeSwapDelegationStorage.Layout storage l = BlazeSwapDelegationStorage.layout();
        IBlazeSwapDelegationPlugin plugin = IBlazeSwapDelegationPlugin(_plugin);
        l.plugin = plugin;
        address[] memory initialProviders = new address[](1);
        initialProviders[0] = plugin.initialProvider();
        safeChangeProviders(initialProviders);
    }

    function voteOf(address liquidityProvider) external view onlyDelegatedCall returns (address) {
        return BlazeSwapDelegationStorage.layout().providerDelegation[liquidityProvider];
    }

    function providerVotes(address ftsoProvider) external view onlyDelegatedCall returns (uint256) {
        return BlazeSwapDelegationStorage.layout().providerVotes[ftsoProvider];
    }

    function providers(uint256 i) external view onlyDelegatedCall returns (address) {
        return BlazeSwapDelegationStorage.layout().allProviders.list[i];
    }

    function providersCount() external view onlyDelegatedCall returns (uint256) {
        return BlazeSwapDelegationStorage.layout().allProviders.list.length;
    }

    function providersAll() external view onlyDelegatedCall returns (address[] memory) {
        return BlazeSwapDelegationStorage.layout().allProviders.list;
    }

    function providersSubset(
        uint256 offset,
        uint256 count
    ) external view onlyDelegatedCall returns (address[] memory providersPage) {
        address[] storage allProviders = BlazeSwapDelegationStorage.layout().allProviders.list;
        uint256 totalLen = allProviders.length;
        uint256 len;
        if (offset < totalLen) {
            if (offset + count > totalLen) {
                len = totalLen - offset;
            } else {
                len = count;
            }
        }
        providersPage = new address[](len);
        for (uint256 i; i < len; i++) {
            providersPage[i] = allProviders[offset + i];
        }
    }

    function providersWithVotes() external view onlyDelegatedCall returns (address[] memory, uint256[] memory) {
        BlazeSwapDelegationStorage.Layout storage l = BlazeSwapDelegationStorage.layout();
        address[] memory allProviders = l.allProviders.list;
        uint256[] memory allVotes = new uint256[](allProviders.length);
        for (uint256 i; i < allProviders.length; i++) {
            allVotes[i] = l.providerVotes[allProviders[i]];
        }
        return (allProviders, allVotes);
    }

    function providersSubsetWithVotes(
        uint256 offset,
        uint256 count
    ) external view onlyDelegatedCall returns (address[] memory providersPage, uint256[] memory votesPage) {
        BlazeSwapDelegationStorage.Layout storage l = BlazeSwapDelegationStorage.layout();
        address[] storage allProviders = l.allProviders.list;
        uint256 totalLen = allProviders.length;
        uint256 len;
        if (offset < totalLen) {
            if (offset + count > totalLen) {
                len = totalLen - offset;
            } else {
                len = count;
            }
        }
        providersPage = new address[](len);
        votesPage = new uint256[](len);
        for (uint256 i; i < len; i++) {
            address p = allProviders[offset + i];
            providersPage[i] = p;
            votesPage[i] = l.providerVotes[p];
        }
    }

    function transferCallback(address from, address to, uint256 amount) external onlyDelegatedCall {
        BlazeSwapDelegationStorage.Layout storage l = BlazeSwapDelegationStorage.layout();
        if (to == address(0)) {
            // avoid decreasing vote weight in the same transaction that changed providers
            require(
                l.lastProvidersChange.blockNum != block.number || l.lastProvidersChange.origin != tx.origin,
                'BlazeSwap: FLASH_ATTACK'
            );
        }
        moveVotes(l, l.providerDelegation[from], l.providerDelegation[to], amount);
    }

    function moveVotes(
        BlazeSwapDelegationStorage.Layout storage l,
        address fromProvider,
        address toProvider,
        uint256 amount
    ) private {
        if (fromProvider != toProvider && amount > 0) {
            if (fromProvider != address(0)) {
                l.providerVotes[fromProvider] -= amount;
                if (l.providerVotes[fromProvider] == 0) l.allProviders.remove(fromProvider);
            }
            if (toProvider != address(0)) {
                if (l.providerVotes[toProvider] == 0) l.allProviders.add(toProvider);
                l.providerVotes[toProvider] += amount;
            }
        }
    }

    function mostVotedProviders(
        uint256 max
    ) external view onlyDelegatedCall returns (address[] memory, uint256[] memory) {
        BlazeSwapDelegationStorage.Layout storage l = BlazeSwapDelegationStorage.layout();
        uint256 allProvidersLen = l.allProviders.list.length;
        uint256 len = Math.min(max, allProvidersLen);
        address[] memory p = new address[](len);
        uint256[] memory v = new uint256[](len);
        for (uint256 i; i < allProvidersLen; i++) {
            address provider = l.allProviders.list[i];
            uint256 votes = l.providerVotes[provider];
            uint256 j;
            while (j < len && votes <= v[j]) j++;
            if (j < len) {
                for (uint256 k = len - 1; k > j; k--) {
                    p[k] = p[k - 1];
                    v[k] = v[k - 1];
                }
                p[j] = provider;
                v[j] = votes;
            }
        }
        return (p, v);
    }

    function currentProviders()
        external
        view
        onlyDelegatedCall
        returns (address[] memory delegatedProviders, uint256[] memory bips)
    {
        (delegatedProviders, bips, , ) = FlareLibrary.getWNat().delegatesOf(
            address(BlazeSwapRewardsStorage.layout().rewardManager)
        );
    }

    function providersAtEpoch(
        uint256 epoch,
        bool current
    ) private view returns (address[] memory delegatedProviders, uint256[] memory bips) {
        IFtsoManager ftsoManager = FlareLibrary.getFtsoManager();
        if (current) epoch = ftsoManager.getCurrentFtsoRewardEpoch();
        uint256 votePowerBlock = ftsoManager.getRewardEpochVotePowerBlock(epoch);
        (delegatedProviders, bips, , ) = FlareLibrary.getWNat().delegatesOfAt(
            address(BlazeSwapRewardsStorage.layout().rewardManager),
            votePowerBlock
        );
    }

    function providersAtCurrentEpoch() external view onlyDelegatedCall returns (address[] memory, uint256[] memory) {
        return providersAtEpoch(0, true);
    }

    function providersAtEpoch(
        uint256 epoch
    ) external view onlyDelegatedCall returns (address[] memory, uint256[] memory) {
        return providersAtEpoch(epoch, false);
    }

    function checkMostVotedProviders(
        BlazeSwapDelegationStorage.Layout storage l,
        address[] calldata newProviders
    ) private view {
        uint256 len = newProviders.length;
        require(len > 0, 'BlazeSwap: NO_PROVIDERS');
        require(
            len == Math.min(l.allProviders.list.length, l.plugin.maxDelegatesByPercent()),
            'BlazeSwap: PROVIDERS_COUNT'
        );
        uint256 newTotal;
        uint256 prevVotes = type(uint256).max;
        for (uint256 i; i < len; i++) {
            require(newProviders[i] != address(0), 'BlazeSwap: ZERO_ADDRESS');
            uint256 votes = l.providerVotes[newProviders[i]];
            require(votes > 0, 'BlazeSwap: NO_VOTES');
            require(votes <= prevVotes, 'BlazeSwap: NOT_SORTED');
            newTotal += votes;
            prevVotes = votes;
        }
        (address[] memory _delegateAddresses, , , ) = FlareLibrary.getWNat().delegatesOf(
            address(BlazeSwapRewardsStorage.layout().rewardManager)
        );
        uint256 oldTotal;
        for (uint256 i; i < _delegateAddresses.length; i++) {
            oldTotal += l.providerVotes[_delegateAddresses[i]];
        }
        require(newTotal >= oldTotal, 'BlazeSwap: ILLEGAL_CHANGE');
    }

    function voteFor(address provider) external onlyDelegatedCall {
        BlazeSwapDelegationStorage.Layout storage l = BlazeSwapDelegationStorage.layout();
        uint256 balance = IBlazeSwapPair(address(this)).balanceOf(msg.sender);
        address oldProvider = l.providerDelegation[msg.sender];
        l.providerDelegation[msg.sender] = provider;
        moveVotes(l, oldProvider, provider, balance);
    }

    function internalChangeProviders(
        address wNat,
        IFlareAssetRegistry registry,
        address[] memory newProviders,
        address token
    ) private {
        uint256 maxDelegates;
        if (token == wNat) {
            maxDelegates = type(uint256).max; // length already validated in checkMostVotedProviders
        } else if (address(registry) != address(0) && registry.isFlareAsset(token)) {
            maxDelegates = registry.maxDelegatesByPercent(token);
        }
        if (maxDelegates > 0) {
            IVPToken(token).changeProviders(newProviders, maxDelegates);
        }
    }

    function safeChangeProviders(address[] memory newProviders) private {
        BlazeSwapPairStorage.Layout storage pl = BlazeSwapPairStorage.layout();
        address wNat = address(FlareLibrary.getWNat());
        IFlareAssetRegistry registry = FlareLibrary.getFlareAssetRegistry();
        internalChangeProviders(wNat, registry, newProviders, pl.token0);
        internalChangeProviders(wNat, registry, newProviders, pl.token1);
        BlazeSwapRewardsStorage.layout().rewardManager.changeProviders(newProviders);
    }

    function changeProviders(address[] calldata newProviders) external onlyDelegatedCall {
        BlazeSwapDelegationStorage.Layout storage l = BlazeSwapDelegationStorage.layout();
        checkMostVotedProviders(l, newProviders);
        l.lastProvidersChange = BlazeSwapDelegationStorage.BlockAndOrigin(block.number, tx.origin);
        safeChangeProviders(newProviders);
    }

    function pluginSelectors() private pure returns (bytes4[] memory s) {
        s = new bytes4[](14);
        s[0] = IBlazeSwapDelegation.voteOf.selector;
        s[1] = IBlazeSwapDelegation.providerVotes.selector;
        s[2] = IBlazeSwapDelegation.providers.selector;
        s[3] = IBlazeSwapDelegation.providersCount.selector;
        s[4] = IBlazeSwapDelegation.providersAll.selector;
        s[5] = IBlazeSwapDelegation.providersSubset.selector;
        s[6] = IBlazeSwapDelegation.providersWithVotes.selector;
        s[7] = IBlazeSwapDelegation.providersSubsetWithVotes.selector;
        s[8] = IBlazeSwapDelegation.voteFor.selector;
        s[9] = IBlazeSwapDelegation.currentProviders.selector;
        s[10] = IBlazeSwapDelegation.providersAtCurrentEpoch.selector;
        s[11] = IBlazeSwapDelegation.providersAtEpoch.selector;
        s[12] = IBlazeSwapDelegation.mostVotedProviders.selector;
        s[13] = IBlazeSwapDelegation.changeProviders.selector;
    }

    function pluginMetadata() external pure returns (bytes4[] memory selectors, bytes4 interfaceId, uint256 hooksSet) {
        selectors = pluginSelectors();
        interfaceId = type(IBlazeSwapDelegation).interfaceId;
        hooksSet = BlazeSwapPairStorage.TransferHook;
    }
}
