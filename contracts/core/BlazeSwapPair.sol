// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import './BlazeSwapBasePair.sol';
import './BlazeSwapERC20Snapshot.sol';
import './BlazeSwapMulticall.sol';

import './interfaces/flare/IFtsoManager.sol';
import './interfaces/IBlazeSwapDelegation.sol';
import './interfaces/IBlazeSwapFactory.sol';
import './interfaces/IBlazeSwapManager.sol';
import './interfaces/IBlazeSwapPair.sol';
import './interfaces/IBlazeSwapPlugin.sol';
import './interfaces/IIBlazeSwapPluginImpl.sol';
import './interfaces/IIBlazeSwapTransferHook.sol';

library BlazeSwapPairStorage {
    struct Layout {
        IBlazeSwapManager manager; // duplicated for easy/local access by plugins
        address token0; // duplicated for easy/local access by plugins
        address token1; // duplicated for easy/local access by plugins
        mapping(bytes4 => bool) supportedInterfaces;
        mapping(bytes4 => address) pluginSelector;
        address[] pluginImpls;
        address[] transferPluginImpls;
        address[] rewardsPluginImpls;
    }

    bytes32 internal constant STORAGE_SLOT = keccak256('blazeswap.storage.BlazeSwapPair');

    function layout() internal pure returns (Layout storage l) {
        bytes32 slot = STORAGE_SLOT;
        assembly {
            l.slot := slot
        }
    }

    uint256 internal constant TransferHook = 1 << 0;
    uint256 internal constant RewardsHook = 1 << 1;
}

contract BlazeSwapPair is IBlazeSwapPair, BlazeSwapBasePair, BlazeSwapERC20Snapshot, BlazeSwapMulticall {
    constructor() {
        BlazeSwapPairStorage.Layout storage l = BlazeSwapPairStorage.layout();
        l.supportedInterfaces[type(IDiamondLoupe).interfaceId] = true;
        l.supportedInterfaces[type(IERC165).interfaceId] = true;
        l.supportedInterfaces[type(IERC20).interfaceId] = true;
        l.supportedInterfaces[type(IERC20Metadata).interfaceId] = true;
        l.supportedInterfaces[type(IERC20Permit).interfaceId] = true;
        l.supportedInterfaces[type(IERC20Snapshot).interfaceId] = true;
        l.supportedInterfaces[type(IBlazeSwapMulticall).interfaceId] = true;
        l.supportedInterfaces[type(IBlazeSwapBasePair).interfaceId] = true;
    }

    function initialize(address _manager, address _token0, address _token1) public override onlyParent {
        super.initialize(_manager, _token0, _token1);
        BlazeSwapPairStorage.Layout storage l = BlazeSwapPairStorage.layout();
        l.manager = IBlazeSwapManager(_manager);
        l.token0 = _token0;
        l.token1 = _token1;
    }

    function addPlugin(address _plugin) external {
        require(msg.sender == manager, 'BlazeSwap: FORBIDDEN');
        BlazeSwapPairStorage.Layout storage l = BlazeSwapPairStorage.layout();
        IBlazeSwapPlugin plugin = IBlazeSwapPlugin(_plugin);
        if (address(plugin) != address(0)) {
            address impl = plugin.implementation();
            (bytes4[] memory selectors, bytes4 interfaceId, uint256 hooksSet) = IBlazeSwapPluginImpl(impl)
                .pluginMetadata();
            if (l.supportedInterfaces[interfaceId]) return; // plugin already added
            l.pluginImpls.push(impl);
            if (hooksSet & BlazeSwapPairStorage.TransferHook != 0) l.transferPluginImpls.push(impl);
            if (hooksSet & BlazeSwapPairStorage.RewardsHook != 0) l.rewardsPluginImpls.push(impl);
            for (uint256 i; i < selectors.length; i++) {
                require(l.pluginSelector[selectors[i]] == address(0));
                l.pluginSelector[selectors[i]] = impl;
            }
            FacetCut[] memory fc = new FacetCut[](1);
            fc[0] = FacetCut(impl, FacetCutAction.Add, selectors);
            bytes memory functionData = abi.encodeWithSelector(IIBlazeSwapPluginImpl.initialize.selector, _plugin);
            emit DiamondCut(fc, impl, functionData);
            l.supportedInterfaces[interfaceId] = true;
            DelegateCallHelper.delegateAndCheckResult(impl, functionData);
        }
    }

    // prettier-ignore
    fallback(bytes calldata _input) external returns (bytes memory result) {
        address plugin = BlazeSwapPairStorage.layout().pluginSelector[msg.sig];
        require(plugin != address(0), 'BlazeSwap: INVALID_FUNCTION');
        result = DelegateCallHelper.delegateAndCheckResult(plugin, _input);
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override(BlazeSwapERC20, BlazeSwapERC20Snapshot) {
        super._beforeTokenTransfer(from, to, amount);
        // move votes
        BlazeSwapPairStorage.Layout storage l = BlazeSwapPairStorage.layout();
        for (uint256 i; i < l.transferPluginImpls.length; i++) {
            address plugin = l.transferPluginImpls[i];
            DelegateCallHelper.delegateAndCheckResult(
                plugin,
                abi.encodeWithSelector(IIBlazeSwapTransferHook.transferCallback.selector, from, to, amount)
            );
        }
    }

    function supportsInterface(bytes4 interfaceID) external view returns (bool supported) {
        supported = BlazeSwapPairStorage.layout().supportedInterfaces[interfaceID];
    }

    function facets() external view returns (Facet[] memory facets_) {
        BlazeSwapPairStorage.Layout storage l = BlazeSwapPairStorage.layout();
        uint256 length = l.pluginImpls.length;
        facets_ = new Facet[](length);
        for (uint256 i; i < length; i++) {
            address plugin = l.pluginImpls[i];
            (bytes4[] memory selectors, , ) = IBlazeSwapPluginImpl(plugin).pluginMetadata();
            facets_[i] = Facet(plugin, selectors);
        }
    }

    function facetFunctionSelectors(address _facet) external view returns (bytes4[] memory facetFunctionSelectors_) {
        BlazeSwapPairStorage.Layout storage l = BlazeSwapPairStorage.layout();
        uint256 length = l.pluginImpls.length;
        for (uint256 i; i < length; i++) {
            if (l.pluginImpls[i] == _facet) {
                (facetFunctionSelectors_, , ) = IBlazeSwapPluginImpl(_facet).pluginMetadata();
                break;
            }
        }
    }

    function facetAddresses() external view returns (address[] memory facetAddresses_) {
        facetAddresses_ = BlazeSwapPairStorage.layout().pluginImpls;
    }

    function facetAddress(bytes4 _functionSelector) external view returns (address facetAddress_) {
        facetAddress_ = BlazeSwapPairStorage.layout().pluginSelector[_functionSelector];
    }
}
