// SPDX-License-Identifier: MIT
pragma solidity >=0.7.5;
pragma abicoder v2;

interface IPriceSubmitter {
    function getFtsoManager() external view returns (address);
}
