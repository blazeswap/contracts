// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity >=0.5.0;

import '../erc20/IERC20.sol';
import '../erc20/IERC20Metadata.sol';
import '../erc20/IERC20Snapshot.sol';
import './IVPToken.sol';

interface IWNat is IERC20, IERC20Metadata, IERC20Snapshot, IVPToken {
    event Deposit(address indexed dst, uint256 amount);
    event Withdrawal(address indexed src, uint256 amount);

    function deposit() external payable;

    function depositTo(address recipient) external payable;

    function withdraw(uint256) external;

    function withdrawFrom(address owner, uint256 amount) external;
}
