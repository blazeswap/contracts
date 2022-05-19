// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

library BlazeSwapRewardLibrary {
    function rewardManagerFor(address pair) internal pure returns (address payable rewardManager) {
        rewardManager = payable(address(uint160(uint256(keccak256(abi.encodePacked(hex'd694', pair, hex'01'))))));
    }
}
