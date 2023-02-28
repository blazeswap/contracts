// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import '../interfaces/flare/IWNat.sol';

contract WNAT is IWNat {
    string public name = 'Wrapped Native Currency';
    string public symbol = 'WNAT';
    uint8 public decimals = 18;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    struct Delegated {
        address provider;
        uint256 bips;
    }
    mapping(address => Delegated[]) public delegation;

    struct Snapshot {
        uint256 id;
        uint256 value;
    }
    mapping(address => Snapshot[]) private _accountBalanceSnapshots;
    Snapshot[] private _totalSupplySnapshots;
    uint256 private _currentSnapshotId;

    function totalSupply() public view returns (uint256) {
        return address(this).balance;
    }

    function approve(address guy, uint256 wad) public returns (bool) {
        allowance[msg.sender][guy] = wad;
        emit Approval(msg.sender, guy, wad);
        return true;
    }

    function transfer(address dst, uint256 wad) public returns (bool) {
        return transferFrom(msg.sender, dst, wad);
    }

    function transferFrom(address src, address dst, uint256 wad) public returns (bool) {
        require(balanceOf[src] >= wad, '');
        _updateSnapshot(src, dst);

        if (src != msg.sender && allowance[src][msg.sender] != type(uint256).max) {
            require(allowance[src][msg.sender] >= wad, '');
            allowance[src][msg.sender] -= wad;
        }

        balanceOf[src] -= wad;
        balanceOf[dst] += wad;

        emit Transfer(src, dst, wad);

        return true;
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
        _updateSnapshot(_totalSupplySnapshots, totalSupply());
    }

    function _updateSnapshot(Snapshot[] storage snapshots, uint256 currentValue) private {
        uint256 lastSnapshotId = (snapshots.length == 0) ? 0 : snapshots[snapshots.length - 1].id;
        if (lastSnapshotId < block.number) {
            Snapshot memory snapshot = Snapshot(block.number, currentValue);
            snapshots.push(snapshot);
        }
    }

    function _valueAt(uint256 snapshotId, Snapshot[] storage snapshots) private view returns (bool, uint256) {
        require(snapshotId <= block.number, 'WNAT: INVALID_SNAPSHOT_ID');

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
        return snapshotted ? value : totalSupply();
    }

    function deposit() public payable {
        depositTo(msg.sender);
    }

    function depositTo(address recipient) public payable {
        _updateSnapshot(address(0), recipient);
        balanceOf[recipient] += msg.value;
        emit Deposit(recipient, msg.value);
    }

    function withdraw(uint256 wad) public {
        withdrawFrom(msg.sender, wad);
    }

    function withdrawFrom(address src, uint256 wad) public {
        require(balanceOf[src] >= wad, '');
        _updateSnapshot(src, address(0));

        if (src != msg.sender && allowance[src][msg.sender] != type(uint256).max) {
            require(allowance[src][msg.sender] >= wad, '');
            allowance[src][msg.sender] -= wad;
        }

        balanceOf[src] -= wad;
        payable(msg.sender).transfer(wad);
        emit Withdrawal(src, wad);
    }

    function delegatesOf(
        address _owner
    )
        external
        view
        returns (address[] memory _delegateAddresses, uint256[] memory _bips, uint256 _count, uint256 _delegationMode)
    {
        Delegated[] storage ds = delegation[_owner];
        if (ds.length > 0) {
            _delegationMode = 1;
            _count = ds.length;
            _delegateAddresses = new address[](_count);
            _bips = new uint256[](_count);
            for (uint256 i; i < _count; i++) {
                _delegateAddresses[i] = ds[i].provider;
                _bips[i] = ds[i].bips;
            }
        }
    }

    function delegatesOfAt(
        address,
        uint256
    )
        external
        pure
        returns (address[] memory _delegateAddresses, uint256[] memory _bips, uint256 _count, uint256 _delegationMode)
    {
        // mock
        _delegationMode = 1;
        _count = 1;
        _delegateAddresses = new address[](_count);
        _bips = new uint256[](_count);
        _delegateAddresses[0] = address(0);
        _bips[0] = 100_00;
    }

    function delegate(address to, uint256 bips) external {
        require(to != address(0), 'ZERO_ADDRESS');
        require(bips != 0, 'BIPS_ZERO'); // not compliant, but we want to use undelegateAll
        Delegated[] storage ds = delegation[msg.sender];
        uint256 newBips;
        bool replaced;
        for (uint256 i; i < ds.length; i++) {
            if (ds[i].provider == to) {
                ds[i].bips = bips;
                replaced = true;
            }
            newBips += ds[i].bips;
        }
        if (!replaced) {
            ds.push(Delegated(to, bips));
            newBips += bips;
        }
        require(newBips <= 10000, '100%');
    }

    function undelegateAll() external {
        delete (delegation[msg.sender]);
    }

    function totalVotePowerAt(uint256 _blockNumber) external view returns (uint256) {
        return totalSupplyAt(_blockNumber);
    }

    function batchVotePowerOfAt(address[] memory, uint256) external pure returns (uint256[] memory) {
        revert('NOT IMPLEMENTED');
    }
}
