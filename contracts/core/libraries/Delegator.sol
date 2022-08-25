// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import '../interfaces/flare/IVPToken.sol';

library Delegator {
    function delegate(IVPToken token, address[2] memory newProviders) internal {
        uint256 bips = (newProviders[1] != address(0)) ? 50_00 : 100_00;
        for (uint256 i = 0; i < newProviders.length; i++) {
            address provider = newProviders[i];
            if (provider != address(0)) {
                token.delegate(provider, bips);
            }
        }
    }

    function changeProviders(IVPToken token, address[2] memory newProviders) internal {
        token.undelegateAll();
        delegate(token, newProviders);
    }
}
