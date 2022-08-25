// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import '../shared/libraries/DelegateCallHelper.sol';
import '../shared/Configurable.sol';
import '../shared/DelegatedCalls.sol';
import '../shared/ReentrancyLock.sol';
import './interfaces/IBlazeSwapDelegation.sol';
import './interfaces/IBlazeSwapDelegationPlugin.sol';
import './interfaces/IBlazeSwapFactory.sol';
import './interfaces/IBlazeSwapManager.sol';
import './interfaces/IBlazeSwapPair.sol';
import './interfaces/IIBlazeSwapDelegation.sol';
import './interfaces/IIBlazeSwapReward.sol';
import './interfaces/flare/IWNat.sol';
import './libraries/BlazeSwapRewardLibrary.sol';
import './libraries/Delegator.sol';
import './BlazeSwapRewardManager.sol';
import './BlazeSwapPair.sol';

library BlazeSwapDelegationStorage {
    bytes32 internal constant STORAGE_SLOT = keccak256('blazeswap.storage.BlazeSwapDelegation');

    struct BlockAndOrigin {
        uint256 blockNum;
        address origin;
    }

    struct Layout {
        // gas savings
        IBlazeSwapPair pair;
        IBlazeSwapManager manager;
        IWNat wNat;
        address payable rewardManager;
        mapping(address => address) providerDelegation; // delegator => provider
        mapping(address => uint256) providerVotes; // provider => votes
        address[] allProviders;
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
    IIBlazeSwapDelegation,
    DelegatedCalls,
    ReentrancyLock,
    Configurable
{
    using Delegator for IVPToken;

    function initialize(address plugin) external onlyDelegatedCall {
        BlazeSwapDelegationStorage.Layout storage l = BlazeSwapDelegationStorage.layout();
        IBlazeSwapPair pair = IBlazeSwapPair(payable(address(this)));
        l.pair = pair;
        IBlazeSwapManager manager = IBlazeSwapManager(pair.manager());
        l.manager = manager;
        IWNat wNat = IWNat(manager.wNat());
        l.wNat = wNat;
        l.rewardManager = payable(new BlazeSwapRewardManager(wNat, manager));
        changeProviders(l, [IBlazeSwapDelegationPlugin(plugin).initialProvider(), address(0)]);
    }

    function voteOf(address liquidityProvider) external view onlyDelegatedCall returns (address) {
        return BlazeSwapDelegationStorage.layout().providerDelegation[liquidityProvider];
    }

    function providerVotes(address ftsoProvider) external view onlyDelegatedCall returns (uint256) {
        return BlazeSwapDelegationStorage.layout().providerVotes[ftsoProvider];
    }

    function providers(uint256 i) external view onlyDelegatedCall returns (address) {
        return BlazeSwapDelegationStorage.layout().allProviders[i];
    }

    function providersCount() external view onlyDelegatedCall returns (uint256) {
        return BlazeSwapDelegationStorage.layout().allProviders.length;
    }

    function providersAll() external view onlyDelegatedCall returns (address[] memory) {
        return BlazeSwapDelegationStorage.layout().allProviders;
    }

    function providersSubset(uint256 offset, uint256 count)
        external
        view
        onlyDelegatedCall
        returns (address[] memory providersPage)
    {
        address[] storage allProviders = BlazeSwapDelegationStorage.layout().allProviders;
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
        address[] memory allProviders = l.allProviders;
        uint256[] memory allVotes = new uint256[](allProviders.length);
        for (uint256 i; i < allProviders.length; i++) {
            allVotes[i] = l.providerVotes[allProviders[i]];
        }
        return (allProviders, allVotes);
    }

    function providersSubsetWithVotes(uint256 offset, uint256 count)
        external
        view
        onlyDelegatedCall
        returns (address[] memory providersPage, uint256[] memory votesPage)
    {
        BlazeSwapDelegationStorage.Layout storage l = BlazeSwapDelegationStorage.layout();
        address[] storage allProviders = l.allProviders;
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

    function addProvider(BlazeSwapDelegationStorage.Layout storage l, address provider) private {
        l.allProviders.push(provider);
    }

    function removeProvider(BlazeSwapDelegationStorage.Layout storage l, address provider) private {
        for (uint256 i; i < l.allProviders.length; i++) {
            if (l.allProviders[i] == provider) {
                if (i < l.allProviders.length - 1) l.allProviders[i] = l.allProviders[l.allProviders.length - 1];
                l.allProviders.pop();
                return;
            }
        }
    }

    function transferDelegatorVotes(
        address from,
        address to,
        uint256 amount
    ) external onlyDelegatedCall {
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
                if (l.providerVotes[fromProvider] == 0) removeProvider(l, fromProvider);
            }
            if (toProvider != address(0)) {
                if (l.providerVotes[toProvider] == 0) addProvider(l, toProvider);
                l.providerVotes[toProvider] += amount;
            }
        }
    }

    function mostVotedProviders() external view onlyDelegatedCall returns (address[2] memory) {
        BlazeSwapDelegationStorage.Layout storage l = BlazeSwapDelegationStorage.layout();
        address[2] memory p;
        uint256[2] memory v;
        for (uint256 i; i < l.allProviders.length; i++) {
            address provider = l.allProviders[i];
            uint256 votes = l.providerVotes[provider];
            if (votes > v[0] || votes > v[1]) {
                if (v[0] <= v[1]) {
                    p[0] = provider;
                    v[0] = votes;
                } else {
                    p[1] = provider;
                    v[1] = votes;
                }
            }
        }
        return p;
    }

    function revertInvalidProviders() private pure {
        revert('BlazeSwap: INVALID_PROVIDERS');
    }

    function currentProviders() external view returns (address[] memory) {
        BlazeSwapDelegationStorage.Layout storage l = BlazeSwapDelegationStorage.layout();
        (address[] memory delegatedProviders, , , ) = l.wNat.delegatesOf(l.rewardManager);
        return delegatedProviders;
    }

    function checkMostVotedProviders(BlazeSwapDelegationStorage.Layout storage l, address[2] calldata newProviders)
        private
        view
    {
        if (newProviders[0] == address(0) || newProviders[0] == newProviders[1]) revertInvalidProviders();
        if (newProviders[1] == address(0) && l.allProviders.length != 1) revertInvalidProviders();
        (address[] memory _delegateAddresses, , , ) = l.wNat.delegatesOf(l.rewardManager);
        uint256 oldTotal;
        for (uint256 i; i < _delegateAddresses.length; i++) {
            oldTotal += l.providerVotes[_delegateAddresses[i]];
        }
        uint256 newTotal;
        for (uint256 i; i < newProviders.length; i++) {
            if (newProviders[i] == address(0)) continue;
            uint256 votes = l.providerVotes[newProviders[i]];
            if (votes == 0) revertInvalidProviders();
            newTotal += votes;
        }
        if (newTotal <= oldTotal) revertInvalidProviders();
    }

    function voteFor(address provider) external {
        BlazeSwapDelegationStorage.Layout storage l = BlazeSwapDelegationStorage.layout();
        uint256 balance = l.pair.balanceOf(msg.sender);
        address oldProvider = l.providerDelegation[msg.sender];
        l.providerDelegation[msg.sender] = provider;
        moveVotes(l, oldProvider, provider, balance);
    }

    function changeProviders(BlazeSwapDelegationStorage.Layout storage l, address[2] memory newProviders) private {
        BlazeSwapPairStorage.Layout storage p = BlazeSwapPairStorage.layout();
        if (p.type0 != TokenType.Generic) {
            IVPToken(p.token0).changeProviders(newProviders);
        }
        if (p.type1 != TokenType.Generic) {
            IVPToken(p.token1).changeProviders(newProviders);
        }
        BlazeSwapRewardManager(payable(l.rewardManager)).changeProviders(newProviders);
    }

    function changeProviders(address[2] calldata newProviders) external onlyDelegatedCall {
        BlazeSwapDelegationStorage.Layout storage l = BlazeSwapDelegationStorage.layout();
        checkMostVotedProviders(l, newProviders);
        l.lastProvidersChange = BlazeSwapDelegationStorage.BlockAndOrigin(block.number, tx.origin);
        changeProviders(l, newProviders);
    }

    function withdrawRewardFees() external lock {
        address[] storage plugins = BlazeSwapPairStorage.layout().pluginImpls;
        BlazeSwapDelegationStorage.Layout storage l = BlazeSwapDelegationStorage.layout();
        IWNat wNat = l.wNat; // gas savings
        address payable rewardManager = l.rewardManager; // gas savings
        uint256 totalRewards;
        for (uint256 i = 1; i < plugins.length; i++) {
            bytes memory result = DelegateCallHelper.delegateAndCheckResult(
                plugins[i],
                abi.encodeWithSelector(IIBlazeSwapReward.unclaimedRewards.selector)
            );
            totalRewards += abi.decode(result, (uint256));
        }
        uint256 balance = wNat.balanceOf(rewardManager);
        uint256 extraBalance = balance - totalRewards;
        if (extraBalance > 0) {
            address feeTo = l.manager.rewardsFeeTo();
            require(feeTo != address(0), 'BlazeSwap: ZERO_ADDRESS');
            BlazeSwapRewardManager(rewardManager).sendRewards(feeTo, extraBalance, false);
        }
    }

    function pluginSelectors() private pure returns (bytes4[] memory s) {
        s = new bytes4[](13);
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
        s[10] = IBlazeSwapDelegation.mostVotedProviders.selector;
        s[11] = IBlazeSwapDelegation.changeProviders.selector;
        s[12] = IBlazeSwapDelegation.withdrawRewardFees.selector;
    }

    function pluginMetadata() external pure returns (bytes4[] memory selectors, bytes4 interfaceId) {
        selectors = pluginSelectors();
        interfaceId = type(IBlazeSwapDelegation).interfaceId;
    }
}
