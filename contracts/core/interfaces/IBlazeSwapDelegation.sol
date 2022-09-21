// SPDX-License-Identifier: BUSL-1.1
pragma solidity >=0.7.5;
pragma abicoder v2;

interface IBlazeSwapDelegation {
    function voteOf(address liquidityProvider) external view returns (address);

    function providerVotes(address ftsoProvider) external view returns (uint256);

    function providers(uint256 index) external view returns (address);

    function providersCount() external view returns (uint256);

    function providersAll() external view returns (address[] memory);

    function providersSubset(uint256 offset, uint256 count) external view returns (address[] memory);

    function providersWithVotes() external view returns (address[] memory, uint256[] memory);

    function providersSubsetWithVotes(uint256 offset, uint256 count)
        external
        view
        returns (address[] memory, uint256[] memory);

    function voteFor(address provider) external;

    function currentProviders() external view returns (address[] memory);

    function providersAtCurrentEpoch() external view returns (address[] memory);

    function providersAtEpoch(uint256 epoch) external view returns (address[] memory);

    function mostVotedProviders(uint256 max) external view returns (address[] memory, uint256[] memory);

    function changeProviders(address[] memory ftsoProviders) external;
}
