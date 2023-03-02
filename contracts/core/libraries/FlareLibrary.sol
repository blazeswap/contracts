// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import '../interfaces/flare/IDistributionToDelegators.sol';
import '../interfaces/flare/IFlareAssetRegistry.sol';
import '../interfaces/flare/IFlareContractRegistry.sol';
import '../interfaces/flare/IFtsoManager.sol';
import '../interfaces/flare/IFtsoRewardManager.sol';
import '../interfaces/flare/IWNat.sol';

library FlareLibrary {
    IFlareContractRegistry private constant registry =
        IFlareContractRegistry(0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019);

    bytes32 private constant DistributionToDelegatorsHash = keccak256(abi.encode('DistributionToDelegators'));
    bytes32 private constant FlareAssetRegistryHash = keccak256(abi.encode('FlareAssetRegistry'));
    bytes32 private constant FtsoManagerHash = keccak256(abi.encode('FtsoManager'));
    bytes32 private constant FtsoRewardManagerHash = keccak256(abi.encode('FtsoRewardManager'));
    bytes32 private constant WNatHash = keccak256(abi.encode('WNat'));

    struct FtsoRewardManagerWithEpochs {
        IFtsoRewardManager rewardManager;
        uint256 initialRewardEpoch;
        uint256 lastRewardEpoch;
    }

    struct Range {
        uint256 start;
        uint256 end;
        uint256 len;
    }

    function getDistribution() internal view returns (IDistributionToDelegators) {
        return IDistributionToDelegators(registry.getContractAddressByHash(DistributionToDelegatorsHash));
    }

    function checkNotZero(address a) private pure {
        require(a != address(0), 'FlareLibrary: ZERO_ADDRESS');
    }

    function getFlareAssetRegistry() internal view returns (IFlareAssetRegistry) {
        return IFlareAssetRegistry(registry.getContractAddressByHash(FlareAssetRegistryHash));
    }

    function getFtsoManager() internal view returns (IFtsoManager) {
        address a = registry.getContractAddressByHash(FtsoManagerHash);
        checkNotZero(a);
        return IFtsoManager(a);
    }

    function getFtsoRewardManager() internal view returns (IFtsoRewardManager) {
        address a = registry.getContractAddressByHash(FtsoRewardManagerHash);
        checkNotZero(a);
        return IFtsoRewardManager(a);
    }

    function getActiveFtsoRewardManagers(
        uint256 backToEpoch
    ) internal view returns (FtsoRewardManagerWithEpochs[] memory) {
        uint256 maxLen = 20; // more than enough
        FtsoRewardManagerWithEpochs[] memory l = new FtsoRewardManagerWithEpochs[](maxLen);
        IFtsoRewardManager cur = getFtsoRewardManager();
        uint256 count;
        uint256 lastRewardEpoch = type(uint256).max;
        bool first = true;
        while (count < maxLen) {
            uint256 initialRewardEpoch = cur.getInitialRewardEpoch();
            bool active = cur.active();
            if (active) {
                l[count++] = FtsoRewardManagerWithEpochs(cur, initialRewardEpoch, lastRewardEpoch);
            }
            if (first && initialRewardEpoch == 0 && !active) {
                // not activated yet, do nothing
            } else {
                if (initialRewardEpoch < backToEpoch) break; // path built
                lastRewardEpoch = initialRewardEpoch;
            }
            cur = IFtsoRewardManager(cur.oldFtsoRewardManager());
            if (address(cur) == address(0)) break;
            first = false;
        }
        uint256 toDrop = maxLen - count;
        assembly {
            // reduce array length
            mstore(l, sub(mload(l), toDrop))
        }
        return l;
    }

    function getWNat() internal view returns (IWNat) {
        address a = registry.getContractAddressByHash(WNatHash);
        checkNotZero(a);
        return IWNat(a);
    }

    function getCurrentFtsoRewardEpoch(IFtsoManager ftsoManager) internal view returns (uint256) {
        try ftsoManager.getCurrentRewardEpoch() returns (uint256 epoch) {
            return epoch;
        } catch {
            return ftsoManager.oldFtsoManager().getCurrentRewardEpoch();
        }
    }

    function getActiveFtsoRewardEpochsExclusive(
        IFtsoManager ftsoManager,
        uint256 minEpoch
    ) internal view returns (Range memory epochsRange) {
        uint256 firstActiveEpoch = ftsoManager.getRewardEpochToExpireNext();
        if (minEpoch > firstActiveEpoch) firstActiveEpoch = minEpoch;
        uint256 currentEpoch = getCurrentFtsoRewardEpoch(ftsoManager);
        epochsRange = Range(firstActiveEpoch, currentEpoch, currentEpoch - firstActiveEpoch);
    }

    function getActiveAirdropMonthsExclusive(
        IDistributionToDelegators distribution,
        uint256 minMonth,
        bool toDistributeOnly
    ) internal view returns (Range memory monthsRange) {
        if (!toDistributeOnly || !distribution.stopped()) {
            try distribution.getClaimableMonths() returns (uint256 start, uint256 endInclusive) {
                if (minMonth > start) start = minMonth;
                monthsRange = Range(start, endInclusive + 1, endInclusive + 1 - start);
            } catch {}
        }
    }
}
