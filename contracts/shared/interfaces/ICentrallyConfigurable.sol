// SPDX-License-Identifier: MIT
pragma solidity >=0.7.5;
pragma abicoder v2;

import './IConfigurable.sol';

interface ICentrallyConfigurable {
    function configurable() external view returns (IConfigurable);
}
