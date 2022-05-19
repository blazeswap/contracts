// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import './IConfigurable.sol';

interface ICentrallyConfigurable {
    function configurable() external view returns (IConfigurable);
}
