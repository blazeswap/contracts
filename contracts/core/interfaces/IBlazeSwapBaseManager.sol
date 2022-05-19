// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity >=0.5.0;

import '../../shared/interfaces/IConfigurable.sol';
import './IBlazeSwapMath.sol';

interface IBlazeSwapBaseManager is IConfigurable {
    function mathContext() external returns (IBlazeSwapMath);

    function setTradingFeeTo(address _tradingFeeTo) external;

    function tradingFeeTo() external view returns (address);

    function setTradingFeeSplit(
        address router,
        address _recipient,
        uint256 _bips
    ) external;

    function getTradingFeeSplit(address router) external view returns (address recipient, uint256 bips);
}
