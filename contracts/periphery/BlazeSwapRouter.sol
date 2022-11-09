// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import '../core/interfaces/erc20/IERC20.sol';
import '../core/interfaces/erc20/IERC20Permit.sol';
import '../core/interfaces/IBlazeSwapFactory.sol';
import '../core/interfaces/flare/IWNat.sol';
import '../core/BlazeSwapMulticall.sol';
import '../shared/libraries/TransferHelper.sol';

import './interfaces/IBlazeSwapRouter.sol';
import './libraries/BlazeSwapLibrary.sol';

contract BlazeSwapRouter is IBlazeSwapRouter, BlazeSwapMulticall {
    address public immutable factory;
    address public immutable wNat;

    bool private splitFee;

    modifier ensure(uint256 deadline) {
        require(deadline >= block.timestamp, 'BlazeSwapRouter: EXPIRED');
        _;
    }

    constructor(
        address _factory,
        address _wNat,
        bool _splitFee
    ) {
        factory = _factory;
        wNat = _wNat;
        splitFee = _splitFee;
    }

    receive() external payable {
        assert(msg.sender == wNat); // only accept NAT via fallback from the WNAT contract
    }

    // **** ADD LIQUIDITY ****
    function _addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        uint256 feeBipsA,
        uint256 feeBipsB
    ) internal virtual returns (uint256 amountA, uint256 amountB) {
        require(feeBipsA < 100_00, 'BlazeSwapRouter: ILLEGAL_A_FEE');
        require(feeBipsB < 100_00, 'BlazeSwapRouter: ILLEGAL_B_FEE');
        // create the pair if it doesn't exist yet
        if (IBlazeSwapFactory(factory).getPair(tokenA, tokenB) == address(0)) {
            IBlazeSwapFactory(factory).createPair(tokenA, tokenB);
        }
        (uint256 reserveA, uint256 reserveB) = getReserves(tokenA, tokenB);
        if (reserveA == 0 && reserveB == 0) {
            (amountA, amountB) = (amountADesired, amountBDesired);
        } else {
            uint256 amountBOptimal = applyFee(
                BlazeSwapLibrary.quote(applyFee(amountADesired, feeBipsA, false), reserveA, reserveB),
                feeBipsB,
                true
            );
            if (amountBOptimal <= amountBDesired) {
                require(amountBOptimal >= amountBMin, 'BlazeSwapRouter: INSUFFICIENT_B_AMOUNT');
                (amountA, amountB) = (amountADesired, amountBOptimal);
            } else {
                uint256 amountAOptimal = applyFee(
                    BlazeSwapLibrary.quote(applyFee(amountBDesired, feeBipsB, false), reserveB, reserveA),
                    feeBipsA,
                    true
                );
                assert(amountAOptimal <= amountADesired);
                require(amountAOptimal >= amountAMin, 'BlazeSwapRouter: INSUFFICIENT_A_AMOUNT');
                (amountA, amountB) = (amountAOptimal, amountBDesired);
            }
        }
    }

    function applyFee(
        uint256 amount,
        uint256 bips,
        bool invert
    ) private pure returns (uint256) {
        if (bips == 0) return amount;
        else if (!invert) return (amount * (100_00 - bips)) / 100_00;
        else return (amount * 100_00) / (100_00 - bips);
    }

    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        uint256 feeBipsA,
        uint256 feeBipsB,
        address to,
        uint256 deadline
    )
        external
        virtual
        override
        ensure(deadline)
        returns (
            uint256 amountA,
            uint256 amountB,
            uint256 liquidity
        )
    {
        (amountA, amountB) = _addLiquidity(
            tokenA,
            tokenB,
            amountADesired,
            amountBDesired,
            amountAMin,
            amountBMin,
            feeBipsA,
            feeBipsB
        );
        address pair = pairFor(tokenA, tokenB);
        TransferHelper.safeTransferFrom(tokenA, msg.sender, pair, amountA);
        TransferHelper.safeTransferFrom(tokenB, msg.sender, pair, amountB);
        liquidity = IBlazeSwapPair(pair).mint(to);
    }

    function addLiquidityNAT(
        address token,
        uint256 amountTokenDesired,
        uint256 amountTokenMin,
        uint256 amountNATMin,
        uint256 feeBipsToken,
        address to,
        uint256 deadline
    )
        external
        payable
        virtual
        override
        ensure(deadline)
        returns (
            uint256 amountToken,
            uint256 amountNAT,
            uint256 liquidity
        )
    {
        (amountToken, amountNAT) = _addLiquidity(
            token,
            wNat,
            amountTokenDesired,
            msg.value,
            amountTokenMin,
            amountNATMin,
            feeBipsToken,
            0
        );
        address pair = pairFor(token, wNat);
        TransferHelper.safeTransferFrom(token, msg.sender, pair, amountToken);
        IWNat(wNat).depositTo{value: amountNAT}(pair);
        liquidity = IBlazeSwapPair(pair).mint(to);
        // refund dust nat, if any
        if (msg.value > amountNAT) TransferHelper.safeTransferNAT(msg.sender, msg.value - amountNAT);
    }

    // **** REMOVE LIQUIDITY ****
    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) public virtual override ensure(deadline) returns (uint256 amountA, uint256 amountB) {
        address pair = pairFor(tokenA, tokenB);
        IBlazeSwapPair(pair).transferFrom(msg.sender, pair, liquidity); // send liquidity to pair
        (uint256 amount0, uint256 amount1) = IBlazeSwapPair(pair).burn(to);
        (address token0, ) = BlazeSwapLibrary.sortTokens(tokenA, tokenB);
        (amountA, amountB) = tokenA == token0 ? (amount0, amount1) : (amount1, amount0);
        require(amountA >= amountAMin, 'BlazeSwapRouter: INSUFFICIENT_A_AMOUNT');
        require(amountB >= amountBMin, 'BlazeSwapRouter: INSUFFICIENT_B_AMOUNT');
    }

    function removeLiquidityNAT(
        address token,
        uint256 liquidity,
        uint256 amountTokenMin,
        uint256 amountNATMin,
        address to,
        uint256 deadline
    ) public virtual override ensure(deadline) returns (uint256 amountToken, uint256 amountNAT) {
        (amountToken, amountNAT) = removeLiquidity(
            token,
            wNat,
            liquidity,
            amountTokenMin,
            amountNATMin,
            address(this),
            deadline
        );
        // handle fee-on-transfer tokens (double transfer, but same pair interface)
        TransferHelper.safeTransfer(token, to, IERC20(token).balanceOf(address(this)));
        IWNat(wNat).withdraw(amountNAT);
        TransferHelper.safeTransferNAT(to, amountNAT);
    }

    function removeLiquidityWithPermit(
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline,
        bool approveMax,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external virtual override returns (uint256 amountA, uint256 amountB) {
        address pair = pairFor(tokenA, tokenB);
        uint256 value = approveMax ? type(uint256).max : liquidity;
        IBlazeSwapPair(pair).permit(msg.sender, address(this), value, deadline, v, r, s);
        (amountA, amountB) = removeLiquidity(tokenA, tokenB, liquidity, amountAMin, amountBMin, to, deadline);
    }

    function removeLiquidityNATWithPermit(
        address token,
        uint256 liquidity,
        uint256 amountTokenMin,
        uint256 amountNATMin,
        address to,
        uint256 deadline,
        bool approveMax,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external virtual override returns (uint256 amountToken, uint256 amountNAT) {
        address pair = pairFor(token, wNat);
        uint256 value = approveMax ? type(uint256).max : liquidity;
        IBlazeSwapPair(pair).permit(msg.sender, address(this), value, deadline, v, r, s);
        (amountToken, amountNAT) = removeLiquidityNAT(token, liquidity, amountTokenMin, amountNATMin, to, deadline);
    }

    // **** SWAP ****
    // requires the initial amount to have already been sent to the first pair
    function _swapExactAmounts(
        uint256[] memory amounts,
        address[] memory path,
        address _to
    ) internal virtual {
        uint256 lastIndex = path.length - 1;
        uint256 balanceBefore = IERC20(path[lastIndex]).balanceOf(_to);
        for (uint256 i; i < lastIndex; i++) {
            (address input, address output) = (path[i], path[i + 1]);
            (address token0, ) = BlazeSwapLibrary.sortTokens(input, output);
            uint256 amountOut = amounts[i + 1];
            (uint256 amount0Out, uint256 amount1Out) = input == token0
                ? (uint256(0), amountOut)
                : (amountOut, uint256(0));
            address to = i < lastIndex - 1 ? pairFor(output, path[i + 2]) : _to;
            if (splitFee) {
                IBlazeSwapPair(pairFor(input, output)).splitFeeSwap(amount0Out, amount1Out, to, new bytes(0));
            } else {
                IBlazeSwapPair(pairFor(input, output)).swap(amount0Out, amount1Out, to, new bytes(0));
            }
        }
        uint256 balanceAfter = IERC20(path[lastIndex]).balanceOf(_to);
        require(balanceAfter - balanceBefore == amounts[lastIndex], 'BlazeSwapRouter: FEE_ON_TRANSFER');
    }

    function _swapSupportingFeeOnTransferTokens(address[] memory path, address _to)
        internal
        virtual
        returns (uint256[] memory amountsSent, uint256[] memory amountsRecv)
    {
        amountsSent = new uint256[](path.length);
        amountsRecv = new uint256[](path.length);
        for (uint256 i; i < path.length - 1; i++) {
            (address input, address output) = (path[i], path[i + 1]);
            (address token0, ) = BlazeSwapLibrary.sortTokens(input, output);
            IBlazeSwapPair pair = IBlazeSwapPair(pairFor(input, output));
            uint256 amountInput;
            uint256 amountOutput;
            {
                // scope to avoid stack too deep errors
                (uint256 reserve0, uint256 reserve1, ) = pair.getReserves();
                (uint256 reserveInput, uint256 reserveOutput) = input == token0
                    ? (reserve0, reserve1)
                    : (reserve1, reserve0);
                amountInput = IERC20(input).balanceOf(address(pair)) - reserveInput;
                amountOutput = BlazeSwapLibrary.getAmountOut(amountInput, reserveInput, reserveOutput);
            }
            (uint256 amount0Out, uint256 amount1Out) = input == token0
                ? (uint256(0), amountOutput)
                : (amountOutput, uint256(0));
            address to = i < path.length - 2 ? pairFor(output, path[i + 2]) : _to;
            if (splitFee) {
                pair.splitFeeSwap(amount0Out, amount1Out, to, new bytes(0));
            } else {
                pair.swap(amount0Out, amount1Out, to, new bytes(0));
            }
            amountsRecv[i] = amountInput;
            amountsSent[i + 1] = amountOutput;
        }
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external virtual override ensure(deadline) returns (uint256[] memory amountsSent, uint256[] memory amountsRecv) {
        TransferHelper.safeTransferFrom(path[0], msg.sender, pairFor(path[0], path[1]), amountIn);
        uint256 lastIndex = path.length - 1;
        uint256 balanceBefore = IERC20(path[lastIndex]).balanceOf(to);
        (amountsSent, amountsRecv) = _swapSupportingFeeOnTransferTokens(path, to);
        amountsSent[0] = amountIn;
        uint256 amountOut = IERC20(path[lastIndex]).balanceOf(to) - balanceBefore;
        require(amountOut >= amountOutMin, 'BlazeSwapRouter: INSUFFICIENT_OUTPUT_AMOUNT');
        amountsRecv[lastIndex] = amountOut;
    }

    function swapTokensForExactTokens(
        uint256 amountOut,
        uint256 amountInMax,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external virtual override ensure(deadline) returns (uint256[] memory amounts) {
        amounts = getAmountsIn(amountOut, path);
        require(amounts[0] <= amountInMax, 'BlazeSwapRouter: EXCESSIVE_INPUT_AMOUNT');
        TransferHelper.safeTransferFrom(path[0], msg.sender, pairFor(path[0], path[1]), amounts[0]);
        _swapExactAmounts(amounts, path, to);
    }

    function swapExactNATForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    )
        external
        payable
        virtual
        override
        ensure(deadline)
        returns (uint256[] memory amountsSent, uint256[] memory amountsRecv)
    {
        require(path[0] == wNat, 'BlazeSwapRouter: INVALID_PATH');
        uint256 amountIn = msg.value;
        IWNat(wNat).depositTo{value: amountIn}(pairFor(path[0], path[1]));
        uint256 lastIndex = path.length - 1;
        uint256 balanceBefore = IERC20(path[lastIndex]).balanceOf(to);
        (amountsSent, amountsRecv) = _swapSupportingFeeOnTransferTokens(path, to);
        amountsSent[0] = amountIn;
        uint256 amountOut = IERC20(path[lastIndex]).balanceOf(to) - balanceBefore;
        require(amountOut >= amountOutMin, 'BlazeSwapRouter: INSUFFICIENT_OUTPUT_AMOUNT');
        amountsRecv[lastIndex] = amountOut;
    }

    function swapTokensForExactNAT(
        uint256 amountOut,
        uint256 amountInMax,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external virtual override ensure(deadline) returns (uint256[] memory amounts) {
        uint256 lastIndex = path.length - 1;
        require(path[lastIndex] == wNat, 'BlazeSwapRouter: INVALID_PATH');
        amounts = getAmountsIn(amountOut, path);
        require(amounts[0] <= amountInMax, 'BlazeSwapRouter: EXCESSIVE_INPUT_AMOUNT');
        TransferHelper.safeTransferFrom(path[0], msg.sender, pairFor(path[0], path[1]), amounts[0]);
        _swapExactAmounts(amounts, path, address(this));
        IWNat(wNat).withdraw(amounts[lastIndex]);
        TransferHelper.safeTransferNAT(to, amounts[lastIndex]);
    }

    function swapExactTokensForNAT(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external virtual override ensure(deadline) returns (uint256[] memory amountsSent, uint256[] memory amountsRecv) {
        uint256 lastIndex = path.length - 1;
        require(path[lastIndex] == wNat, 'BlazeSwapRouter: INVALID_PATH');
        TransferHelper.safeTransferFrom(path[0], msg.sender, pairFor(path[0], path[1]), amountIn);
        (amountsSent, amountsRecv) = _swapSupportingFeeOnTransferTokens(path, address(this));
        amountsSent[0] = amountIn;
        uint256 amountOut = IERC20(wNat).balanceOf(address(this));
        require(amountOut >= amountOutMin, 'BlazeSwapRouter: INSUFFICIENT_OUTPUT_AMOUNT');
        amountsRecv[lastIndex] = amountOut;
        IWNat(wNat).withdraw(amountOut);
        TransferHelper.safeTransferNAT(to, amountOut);
    }

    function swapNATForExactTokens(
        uint256 amountOut,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable virtual override ensure(deadline) returns (uint256[] memory amounts) {
        require(path[0] == wNat, 'BlazeSwapRouter: INVALID_PATH');
        amounts = getAmountsIn(amountOut, path);
        require(amounts[0] <= msg.value, 'BlazeSwapRouter: EXCESSIVE_INPUT_AMOUNT');
        IWNat(wNat).depositTo{value: amounts[0]}(pairFor(path[0], path[1]));
        _swapExactAmounts(amounts, path, to);
        // refund dust nat, if any
        if (msg.value > amounts[0]) TransferHelper.safeTransferNAT(msg.sender, msg.value - amounts[0]);
    }

    // **** LIBRARY FUNCTIONS ****
    function quote(
        uint256 amountA,
        uint256 reserveA,
        uint256 reserveB
    ) public pure virtual override returns (uint256 amountB) {
        return BlazeSwapLibrary.quote(amountA, reserveA, reserveB);
    }

    function getAmountOut(
        uint256 amountIn,
        uint256 reserveIn,
        uint256 reserveOut
    ) public pure virtual override returns (uint256 amountOut) {
        return BlazeSwapLibrary.getAmountOut(amountIn, reserveIn, reserveOut);
    }

    function getAmountIn(
        uint256 amountOut,
        uint256 reserveIn,
        uint256 reserveOut
    ) public pure virtual override returns (uint256 amountIn) {
        return BlazeSwapLibrary.getAmountIn(amountOut, reserveIn, reserveOut);
    }

    function getAmountsOut(uint256 amountIn, address[] memory path)
        public
        view
        virtual
        override
        returns (uint256[] memory amounts)
    {
        return BlazeSwapLibrary.getAmountsOut(factory, amountIn, path);
    }

    function getAmountsIn(uint256 amountOut, address[] memory path)
        public
        view
        virtual
        override
        returns (uint256[] memory amounts)
    {
        return BlazeSwapLibrary.getAmountsIn(factory, amountOut, path);
    }

    function pairFor(address tokenA, address tokenB) public view virtual override returns (address) {
        return BlazeSwapLibrary.pairFor(factory, tokenA, tokenB);
    }

    function getReserves(address tokenA, address tokenB) public view virtual override returns (uint256, uint256) {
        return BlazeSwapLibrary.getReserves(factory, tokenA, tokenB);
    }

    function selfPermit(
        address token,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        IERC20Permit(token).permit(msg.sender, address(this), value, deadline, v, r, s);
    }
}
