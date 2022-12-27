// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import './BlazeSwapERC20.sol';
import './interfaces/erc20/IERC20Snapshot.sol';

contract BlazeSwapERC20Snapshot is BlazeSwapERC20, IERC20Snapshot {
    struct Snapshot {
        uint256 id;
        uint256 value;
    }
    mapping(address => Snapshot[]) private _accountBalanceSnapshots;
    Snapshot[] private _totalSupplySnapshots;
    uint256 private _currentSnapshotId;

    function _beforeTokenTransfer(address from, address to, uint256) internal virtual override {
        _updateSnapshot(from, to);
    }

    // ERC20 Snapshot extension allowing retrieval of historical balances and total supply,
    // inspired by https://github.com/Giveth/minimd/blob/ea04d950eea153a04c51fa510b068b9dded390cb/contracts/MiniMeToken.sol[MiniMeToken]

    function _updateSnapshot(address from, address to) private {
        if (from == address(0)) {
            // mint
            _updateAccountSnapshot(to);
            _updateTotalSupplySnapshot();
        } else if (to == address(0)) {
            // burn
            _updateAccountSnapshot(from);
            _updateTotalSupplySnapshot();
        } else {
            // transfer
            _updateAccountSnapshot(from);
            _updateAccountSnapshot(to);
        }
    }

    function _updateAccountSnapshot(address account) private {
        _updateSnapshot(_accountBalanceSnapshots[account], balanceOf[account]);
    }

    function _updateTotalSupplySnapshot() private {
        _updateSnapshot(_totalSupplySnapshots, totalSupply);
    }

    function _updateSnapshot(Snapshot[] storage snapshots, uint256 currentValue) private {
        uint256 lastSnapshotId = (snapshots.length == 0) ? 0 : snapshots[snapshots.length - 1].id;
        if (lastSnapshotId < block.number) {
            Snapshot memory snapshot = Snapshot(block.number, currentValue);
            snapshots.push(snapshot);
        }
    }

    function _valueAt(uint256 snapshotId, Snapshot[] storage snapshots) private view returns (bool, uint256) {
        require(snapshotId > 0 && snapshotId <= block.number, 'BlazeSwap: INVALID_SNAPSHOT_ID');

        // not snapshotted, return false
        if (snapshots.length == 0) return (false, 0);

        // find the first snapshots index with id > snapshotId in O(log(n))
        uint256 low;
        uint256 high = snapshots.length;
        while (low < high) {
            uint256 mid = (low + high) / 2; // overflow is not an issue in this case
            if (snapshots[mid].id > snapshotId) {
                high = mid;
            } else {
                low = mid + 1;
            }
        }

        // if snapshotted, return the value
        return (low < snapshots.length) ? (true, snapshots[low].value) : (false, 0);
    }

    function balanceOfAt(address account, uint256 snapshotId) public view returns (uint256) {
        (bool snapshotted, uint256 value) = _valueAt(snapshotId, _accountBalanceSnapshots[account]);
        return snapshotted ? value : balanceOf[account];
    }

    function totalSupplyAt(uint256 snapshotId) public view returns (uint256) {
        (bool snapshotted, uint256 value) = _valueAt(snapshotId, _totalSupplySnapshots);
        return snapshotted ? value : totalSupply;
    }
}
