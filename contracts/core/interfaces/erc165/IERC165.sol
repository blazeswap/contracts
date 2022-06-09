// SPDX-License-Identifier: MIT
pragma solidity >=0.7.5;
pragma abicoder v2;

interface IERC165 {
    function supportsInterface(bytes4 interfaceID) external view returns (bool);
}
