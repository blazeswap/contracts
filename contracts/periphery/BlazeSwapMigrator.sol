// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import '../core/interfaces/IBlazeSwapBaseFactory.sol';
import '../core/interfaces/IBlazeSwapBasePair.sol';
import '../core/interfaces/flare/IWNat.sol';
import '../shared/libraries/TransferHelper.sol';

import './interfaces/IBlazeSwapMigrator.sol';
import './libraries/BlazeSwapLibrary.sol';

contract BlazeSwapMigrator is IBlazeSwapMigrator {
    address public factory;
    address public wNat;

    modifier ensure(uint256 deadline) {
        require(deadline >= block.timestamp, 'BlazeSwapMigrator: EXPIRED');
        _;
    }

    constructor(address _factory, address _wNat) {
        factory = _factory;
        wNat = _wNat;
    }

    receive() external payable {}

    function pairWithLiquidity(
        address factorySource,
        address tokenA,
        address tokenB,
        address owner
    ) external view returns (address pair, uint256 reserveA, uint256 reserveB, uint256 liquidity, uint256 totalSupply) {
        pair = IBlazeSwapBaseFactory(factorySource).getPair(tokenA, tokenB);
        if (pair != address(0)) {
            IBlazeSwapBasePair p = IBlazeSwapBasePair(pair);
            (uint256 reserve0, uint256 reserve1, ) = p.getReserves();
            (address token0, ) = BlazeSwapLibrary.sortTokens(tokenA, tokenB);
            (reserveA, reserveB) = tokenA == token0 ? (reserve0, reserve1) : (reserve1, reserve0);
            liquidity = p.balanceOf(owner);
            totalSupply = p.totalSupply();
        }
    }

    function migrate(
        address pairSource,
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        uint256 feeBipsA,
        uint256 feeBipsB
    ) private {
        // remove liquidity from source pair
        (uint256 receivedAmountA, uint256 receivedAmountB) = removeLiquidity(
            pairSource,
            tokenA,
            tokenB,
            liquidity,
            amountAMin,
            amountBMin
        );

        // add liquidity to the destination pair
        addLiquidity(tokenA, tokenB, receivedAmountA, receivedAmountB, amountAMin, amountBMin, feeBipsA, feeBipsB);

        // send back the remaining tokens to sender
        uint256 remainingAmountA = IERC20(tokenA).balanceOf(address(this));
        uint256 remainingAmountB = IERC20(tokenB).balanceOf(address(this));
        if (remainingAmountA > 0) {
            TransferHelper.safeTransfer(tokenA, msg.sender, remainingAmountA);
        }
        if (remainingAmountB > 0) {
            TransferHelper.safeTransfer(tokenB, msg.sender, remainingAmountB);
        }
    }

    function migrateWNAT(
        address pairSource,
        address token,
        address wNatSource,
        uint256 liquidity,
        uint256 amountTokenMin,
        uint256 amountWNATMin,
        uint256 feeBipsToken
    ) private {
        // remove liquidity from source pair
        (uint256 receivedAmountToken, uint256 receivedAmountNAT) = removeLiquidity(
            pairSource,
            token,
            wNatSource,
            liquidity,
            amountTokenMin,
            amountWNATMin
        );

        // convert NAT
        IWNat(wNatSource).withdraw(receivedAmountNAT);
        IWNat(wNat).deposit{value: receivedAmountNAT}();

        // add liquidity to the destination pair
        addLiquidity(
            token,
            wNat,
            receivedAmountToken,
            receivedAmountNAT,
            amountTokenMin,
            amountWNATMin,
            feeBipsToken,
            0
        );

        // send back the remaining tokens to sender
        uint256 remainingAmountToken = IERC20(token).balanceOf(address(this));
        uint256 remainingAmountNAT = IERC20(wNat).balanceOf(address(this));
        if (remainingAmountToken > 0) {
            TransferHelper.safeTransfer(token, msg.sender, remainingAmountToken);
        }
        if (remainingAmountNAT > 0) {
            TransferHelper.safeTransfer(wNat, msg.sender, remainingAmountNAT);
        }
    }

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
    ) external ensure(deadline) {
        migrate(pairSource, tokenA, tokenB, liquidity, amountAMin, amountBMin, feeBipsA, feeBipsB);
    }

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
    ) external ensure(deadline) {
        IERC20Permit(pairSource).permit(msg.sender, address(this), liquidity, deadline, v, r, s);
        migrate(pairSource, tokenA, tokenB, liquidity, amountAMin, amountBMin, feeBipsA, feeBipsB);
    }

    function migrateWNAT(
        address pairSource,
        address token,
        address wNatSource,
        uint256 liquidity,
        uint256 amountTokenMin,
        uint256 amountWNATMin,
        uint256 feeBipsToken,
        uint256 deadline
    ) external ensure(deadline) {
        migrateWNAT(pairSource, token, wNatSource, liquidity, amountTokenMin, amountWNATMin, feeBipsToken);
    }

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
    ) external ensure(deadline) {
        IERC20Permit(pairSource).permit(msg.sender, address(this), liquidity, deadline, v, r, s);
        migrateWNAT(pairSource, token, wNatSource, liquidity, amountTokenMin, amountWNATMin, feeBipsToken);
    }

    function removeLiquidity(
        address sourcePair,
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin
    ) internal returns (uint256 amountA, uint256 amountB) {
        TransferHelper.safeTransferFrom(sourcePair, msg.sender, sourcePair, liquidity);
        IBlazeSwapBasePair(sourcePair).burn(address(this));
        amountA = IERC20(tokenA).balanceOf(address(this));
        amountB = IERC20(tokenB).balanceOf(address(this));
        require(amountA >= amountAMin, 'BlazeSwapMigrator: INSUFFICIENT_A_AMOUNT');
        require(amountB >= amountBMin, 'BlazeSwapMigrator: INSUFFICIENT_B_AMOUNT');
    }

    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        uint256 feeBipsA,
        uint256 feeBipsB
    ) internal virtual returns (uint256 amountA, uint256 amountB, uint256 liquidity) {
        require(feeBipsA < 100_00, 'BlazeSwapMigrator: ILLEGAL_A_FEE');
        require(feeBipsB < 100_00, 'BlazeSwapMigrator: ILLEGAL_B_FEE');
        // create the pair if it doesn't exist yet
        address pair = IBlazeSwapBaseFactory(factory).getPair(tokenA, tokenB);
        if (pair == address(0)) {
            pair = IBlazeSwapBaseFactory(factory).createPair(tokenA, tokenB);
        }
        (uint256 reserveA, uint256 reserveB) = BlazeSwapLibrary.getReserves(factory, tokenA, tokenB);
        if (reserveA == 0 && reserveB == 0) {
            (amountA, amountB) = (amountADesired, amountBDesired);
        } else {
            uint256 amountBOptimal = applyFee(
                BlazeSwapLibrary.quote(applyFee(amountADesired, feeBipsA, false), reserveA, reserveB),
                feeBipsB,
                true
            );
            if (amountBOptimal <= amountBDesired) {
                require(amountBOptimal >= amountBMin, 'BlazeSwapMigrator: INSUFFICIENT_B_AMOUNT');
                (amountA, amountB) = (amountADesired, amountBOptimal);
            } else {
                uint256 amountAOptimal = applyFee(
                    BlazeSwapLibrary.quote(applyFee(amountBDesired, feeBipsB, false), reserveB, reserveA),
                    feeBipsA,
                    true
                );
                assert(amountAOptimal <= amountADesired);
                require(amountAOptimal >= amountAMin, 'BlazeSwapMigrator: INSUFFICIENT_A_AMOUNT');
                (amountA, amountB) = (amountAOptimal, amountBDesired);
            }
        }
        TransferHelper.safeTransfer(tokenA, pair, amountA);
        TransferHelper.safeTransfer(tokenB, pair, amountB);
        liquidity = IBlazeSwapBasePair(pair).mint(msg.sender);
    }

    function applyFee(uint256 amount, uint256 bips, bool invert) private pure returns (uint256) {
        if (bips == 0) return amount;
        else if (!invert) return (amount * (100_00 - bips)) / 100_00;
        else return (amount * 100_00) / (100_00 - bips);
    }
}
