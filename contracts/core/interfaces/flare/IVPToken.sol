// SPDX-License-Identifier: MIT
pragma solidity >=0.7.5;
pragma abicoder v2;

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

    function delegatesOfAt(address _who, uint256 _blockNumber)
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

    function totalVotePowerAt(uint256 _blockNumber) external view returns (uint256);

    function batchVotePowerOfAt(address[] memory _owners, uint256 _blockNumber)
        external
        view
        returns (uint256[] memory);
}
