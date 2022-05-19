// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import './interfaces/IBlazeSwapBaseManager.sol';
import '../shared/Configurable.sol';

contract BlazeSwapBaseManager is IBlazeSwapBaseManager, Configurable {
    IBlazeSwapMath public mathContext;

    address public tradingFeeTo;

    struct FeeRecipient {
        address recipient;
        uint256 bips;
    }
    mapping(address => FeeRecipient) private tradingFeeSplit;

    constructor(address _configSetter, address _mathContext) {
        initConfigurable(_configSetter);
        mathContext = IBlazeSwapMath(_mathContext);
    }

    function setTradingFeeTo(address _tradingFeeTo) external onlyConfigSetter {
        tradingFeeTo = _tradingFeeTo;
    }

    function setTradingFeeSplit(
        address router,
        address _recipient,
        uint256 _bips
    ) external onlyConfigSetter {
        require(_bips <= 100_00, 'BlazeSwap: OVERFLOW');
        tradingFeeSplit[router] = FeeRecipient(_recipient, _bips);
    }

    function getTradingFeeSplit(address router) external view returns (address recipient, uint256 bips) {
        FeeRecipient storage fr = tradingFeeSplit[router];
        return (fr.recipient, fr.bips);
    }
}
