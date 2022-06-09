// SPDX-License-Identifier: MIT
pragma solidity >=0.7.5;
pragma abicoder v2;

interface IConfigurable {
    function configSetter() external view returns (address);

    function setConfigSetter(address _configSetter) external;
}
