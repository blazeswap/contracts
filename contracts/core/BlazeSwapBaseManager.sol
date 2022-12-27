// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import './interfaces/IBlazeSwapBaseManager.sol';
import '../shared/Configurable.sol';
import './BlazeSwapMath.sol';

contract BlazeSwapBaseManager is IBlazeSwapBaseManager, Configurable {
    address public immutable mathContext;

    address public tradingFeeTo;

    struct FeeRecipient {
        address recipient;
        uint256 bips;
    }
    mapping(address => FeeRecipient) private tradingFeeSplit;

    constructor(address _configSetter) {
        require(_configSetter != address(0), 'BlazeSwap: ZERO_ADDRESS');
        initConfigurable(_configSetter);
        mathContext = address(new BlazeSwapMath());
    }

    function setTradingFeeTo(address _tradingFeeTo) external onlyConfigSetter {
        tradingFeeTo = _tradingFeeTo;
    }

    function setTradingFeeSplit(address router, address _recipient, uint256 _bips) external onlyConfigSetter {
        require(_bips <= 100_00, 'BlazeSwap: OVERFLOW');
        tradingFeeSplit[router] = FeeRecipient(_recipient, _bips);
    }

    function getTradingFeeSplit(address router) external view returns (address recipient, uint256 bips) {
        FeeRecipient storage fr = tradingFeeSplit[router];
        return (fr.recipient, fr.bips);
    }
}
