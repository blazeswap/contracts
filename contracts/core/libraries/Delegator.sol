// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import '../interfaces/flare/IVPToken.sol';
import '../libraries/Math.sol';

library Delegator {
    function delegate(
        IVPToken token,
        address[] memory newProviders,
        uint256 maxDelegates
    ) internal {
        uint256 len = Math.min(newProviders.length, maxDelegates);
        uint256 bips = 100_00 / len;
        require(bips > 0);
        token.delegate(newProviders[0], 100_00 - bips * (len - 1));
        for (uint256 i = 1; i < len; i++) {
            token.delegate(newProviders[i], bips);
        }
        (, , uint256 count, ) = token.delegatesOf(address(this));
        require(count == len, 'BlazeSwap: DUPLICATED_PROVIDERS');
    }

    function changeProviders(
        IVPToken token,
        address[] memory newProviders,
        uint256 maxDelegates
    ) internal {
        token.undelegateAll();
        delegate(token, newProviders, maxDelegates);
    }
}
