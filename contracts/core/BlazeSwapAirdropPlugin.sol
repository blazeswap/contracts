// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import './interfaces/IBlazeSwapAirdropPlugin.sol';
import './BlazeSwapAirdrop.sol';

contract BlazeSwapAirdropPlugin is IBlazeSwapAirdropPlugin {
    address public immutable implementation = address(new BlazeSwapAirdrop());

    function active() external view returns (bool) {
        IDistributionToDelegators distribution = FlareLibrary.getDistribution();
        if (address(distribution) != address(0)) {
            try distribution.getClaimableMonths() returns (uint256, uint256) {
                return true;
            } catch Error(string memory reason) {
                if (keccak256(bytes(reason)) == keccak256('no month claimable')) return true; // distribution not started yet
            } catch {}
        }
        return false;
    }
}
