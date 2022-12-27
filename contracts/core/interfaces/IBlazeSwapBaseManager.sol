// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity >=0.7.5;
pragma abicoder v2;

import '../../shared/interfaces/IConfigurable.sol';

interface IBlazeSwapBaseManager is IConfigurable {
    function mathContext() external returns (address);

    function setTradingFeeTo(address _tradingFeeTo) external;

    function tradingFeeTo() external view returns (address);

    function setTradingFeeSplit(address router, address _recipient, uint256 _bips) external;

    function getTradingFeeSplit(address router) external view returns (address recipient, uint256 bips);
}
