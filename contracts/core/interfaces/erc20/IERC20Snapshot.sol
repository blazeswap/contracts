// SPDX-License-Identifier: MIT
pragma solidity >=0.5.0;

interface IERC20Snapshot {
    function totalSupplyAt(uint256 block) external view returns (uint256);

    function balanceOfAt(address owner, uint256 block) external view returns (uint256);
}
