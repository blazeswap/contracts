// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IConfigurable {
    function configSetter() external view returns (address);

    function setConfigSetter(address _configSetter) external;
}
