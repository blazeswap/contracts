// SPDX-License-Identifier: BUSL-1.1
pragma solidity >=0.7.5;
pragma abicoder v2;

interface IBlazeSwapMigrator {
    function factory() external view returns (address);

    function wNat() external view returns (address);

    function pairWithliquidity(
        address factorySource,
        address tokenA,
        address tokenB,
        address owner
    )
        external
        view
        returns (
            address pair,
            uint256 reserveA,
            uint256 reserveB,
            uint256 liquidity,
            uint256 totalSupply
        );

    function migrate(
        address pairSource,
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        uint256 feeBipsA,
        uint256 feeBipsB,
        uint256 deadline
    ) external;

    function migrateWithPermit(
        address pairSource,
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        uint256 feeBipsA,
        uint256 feeBipsB,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    function migrateWNAT(
        address pairSource,
        address token,
        address wNatSource,
        uint256 liquidity,
        uint256 amountTokenMin,
        uint256 amountWNATMin,
        uint256 feeBipsToken,
        uint256 deadline
    ) external;

    function migrateWNATWithPermit(
        address pairSource,
        address token,
        address wNatSource,
        uint256 liquidity,
        uint256 amountTokenMin,
        uint256 amountWNATMin,
        uint256 feeBipsToken,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
}
