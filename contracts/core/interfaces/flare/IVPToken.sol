// SPDX-License-Identifier: MIT
pragma solidity >=0.5.0;

interface IVPToken {
    function delegatesOf(address _owner)
        external
        view
        returns (
            address[] memory _delegateAddresses,
            uint256[] memory _bips,
            uint256 _count,
            uint256 _delegationMode
        );

    function delegate(address _to, uint256 _bips) external;

    function undelegateAll() external;
}
