// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import '../shared/libraries/TransferHelper.sol';
import '../shared/ParentRelation.sol';
import '../shared/ReentrancyLock.sol';
import './interfaces/IBlazeSwapBasePair.sol';
import './interfaces/IBlazeSwapBaseManager.sol';
import './interfaces/IBlazeSwapCallee.sol';
import './interfaces/IBlazeSwapMath.sol';
import './libraries/Math.sol';
import './libraries/UQ112x112.sol';
import './BlazeSwapERC20.sol';

contract BlazeSwapBasePair is IBlazeSwapBasePair, BlazeSwapERC20, ReentrancyLock, ParentRelation {
    using UQ112x112 for uint224;
    using TransferHelper for address;

    uint256 public constant MINIMUM_LIQUIDITY = 10**3;
    bytes4 private constant SELECTOR = bytes4(keccak256(bytes('transfer(address,uint256)')));

    IBlazeSwapMath mc;

    address public manager;
    address public token0;
    address public token1;

    uint112 private reserve0; // uses single storage slot, accessible via getReserves
    uint112 private reserve1; // uses single storage slot, accessible via getReserves
    uint32 private blockTimestampLast; // uses single storage slot, accessible via getReserves

    uint256 public price0CumulativeLast;
    uint256 public price1CumulativeLast;
    uint256 public kLast; // reserve0 * reserve1, as of immediately after the most recent liquidity event

    uint256 public pendingFeeTotal;
    mapping(address => uint256) public pendingFeeShare;
    address[] private pendingFeeAccount;

    function getReserves()
        public
        view
        returns (
            uint112 _reserve0,
            uint112 _reserve1,
            uint32 _blockTimestampLast
        )
    {
        _reserve0 = reserve0;
        _reserve1 = reserve1;
        _blockTimestampLast = blockTimestampLast;
    }

    function factory() external view returns (address) {
        return ParentRelationStorage.layout().parent;
    }

    // called once by the factory at time of deployment
    function initialize(
        address _manager,
        address _token0,
        address _token1
    ) public onlyParent {
        mc = IBlazeSwapMath(IBlazeSwapBaseManager(_manager).mathContext());
        manager = _manager;
        token0 = _token0;
        token1 = _token1;
    }

    // update reserves and, on the first call per block, price accumulators
    function _update(
        uint256 balance0,
        uint256 balance1,
        uint112 _reserve0,
        uint112 _reserve1
    ) private {
        require(balance0 <= type(uint112).max && balance1 <= type(uint112).max, 'BlazeSwap: OVERFLOW');
        uint32 blockTimestamp;
        unchecked {
            blockTimestamp = uint32(block.timestamp % 2**32);
            uint32 timeElapsed = blockTimestamp - blockTimestampLast; // overflow is desired
            if (timeElapsed > 0 && _reserve0 != 0 && _reserve1 != 0) {
                // * never overflows, and + overflow is desired
                price0CumulativeLast += uint256(UQ112x112.encode(_reserve1).uqdiv(_reserve0)) * timeElapsed;
                price1CumulativeLast += uint256(UQ112x112.encode(_reserve0).uqdiv(_reserve1)) * timeElapsed;
            }
        }
        reserve0 = uint112(balance0);
        reserve1 = uint112(balance1);
        blockTimestampLast = blockTimestamp;
        emit Sync(reserve0, reserve1);
    }

    function _wipePendingFeeData() private {
        for (uint256 i = pendingFeeAccount.length; i > 0; i--) {
            address splitFeeRecipient = pendingFeeAccount[i - 1];
            pendingFeeShare[splitFeeRecipient] = 0;
            pendingFeeAccount.pop();
        }
        pendingFeeTotal = 0;
    }

    // if fee is on, mint liquidity equivalent to 1/6th of the growth in sqrt(k)
    function _mintFee(uint112 _reserve0, uint112 _reserve1) private returns (bool feeOn) {
        address feeTo = IBlazeSwapBaseManager(manager).tradingFeeTo();
        feeOn = feeTo != address(0);
        uint256 _kLast = kLast; // gas savings
        if (feeOn) {
            if (_kLast != 0) {
                uint256 rootK = mc.sqrt(uint256(_reserve0) * _reserve1);
                uint256 rootKLast = mc.sqrt(_kLast);
                if (rootK > rootKLast) {
                    uint256 numerator = totalSupply * (rootK - rootKLast);
                    uint256 denominator = rootK * 5 + rootKLast;
                    uint256 liquidity = numerator / denominator;
                    if (liquidity > 0) {
                        for (uint256 i; i < pendingFeeAccount.length; i++) {
                            address splitFeeRecipient = pendingFeeAccount[i];
                            uint256 splitFeeLiquidity = mc.mulDiv(
                                liquidity,
                                pendingFeeShare[splitFeeRecipient],
                                pendingFeeTotal
                            );
                            if (splitFeeLiquidity > 0) {
                                _mint(splitFeeRecipient, splitFeeLiquidity);
                                liquidity -= splitFeeLiquidity;
                            }
                        }
                        if (liquidity > 0) {
                            _mint(feeTo, liquidity);
                        }
                    }
                }
                _wipePendingFeeData();
            }
        } else if (_kLast != 0) {
            kLast = 0;
            _wipePendingFeeData();
        }
    }

    function mintFee() external {
        (uint112 _reserve0, uint112 _reserve1, ) = getReserves(); // gas savings
        bool feeOn = _mintFee(_reserve0, _reserve1);
        if (feeOn) kLast = uint256(_reserve0) * _reserve1;
    }

    // this low-level function should be called from a contract which performs important safety checks
    function mint(address to) external lock returns (uint256 liquidity) {
        (uint112 _reserve0, uint112 _reserve1, ) = getReserves(); // gas savings
        uint256 balance0 = IERC20(token0).balanceOf(address(this));
        uint256 balance1 = IERC20(token1).balanceOf(address(this));
        uint256 amount0 = balance0 - _reserve0;
        uint256 amount1 = balance1 - _reserve1;

        bool feeOn = _mintFee(_reserve0, _reserve1);
        uint256 _totalSupply = totalSupply; // gas savings, must be defined here since totalSupply can update in _mintFee
        if (_totalSupply == 0) {
            liquidity = mc.sqrt(amount0 * amount1) - MINIMUM_LIQUIDITY;
            _mint(address(0x000000000000000000000000000000000000dEaD), MINIMUM_LIQUIDITY); // permanently lock the first MINIMUM_LIQUIDITY tokens
        } else {
            liquidity = Math.min((amount0 * _totalSupply) / _reserve0, (amount1 * _totalSupply) / _reserve1);
        }
        require(liquidity > 0, 'BlazeSwap: INSUFFICIENT_LIQUIDITY_MINTED');
        _mint(to, liquidity);

        _update(balance0, balance1, _reserve0, _reserve1);
        unchecked {
            if (feeOn) kLast = uint256(reserve0) * reserve1; // reserve0 and reserve1 are up-to-date
        }
        emit Mint(msg.sender, amount0, amount1);
    }

    // this low-level function should be called from a contract which performs important safety checks
    function burn(address to) external lock returns (uint256 amount0, uint256 amount1) {
        (uint112 _reserve0, uint112 _reserve1, ) = getReserves(); // gas savings
        address _token0 = token0; // gas savings
        address _token1 = token1; // gas savings
        uint256 balance0 = IERC20(_token0).balanceOf(address(this));
        uint256 balance1 = IERC20(_token1).balanceOf(address(this));
        uint256 liquidity = balanceOf[address(this)];

        bool feeOn = _mintFee(_reserve0, _reserve1);
        uint256 _totalSupply = totalSupply; // gas savings, must be defined here since totalSupply can update in _mintFee
        amount0 = (liquidity * balance0) / _totalSupply; // using balances ensures pro-rata distribution
        amount1 = (liquidity * balance1) / _totalSupply; // using balances ensures pro-rata distribution
        require(amount0 > 0 && amount1 > 0, 'BlazeSwap: INSUFFICIENT_LIQUIDITY_BURNED');
        _burn(address(this), liquidity);
        _token0.safeTransfer(to, amount0);
        _token1.safeTransfer(to, amount1);
        balance0 = IERC20(_token0).balanceOf(address(this));
        balance1 = IERC20(_token1).balanceOf(address(this));

        _update(balance0, balance1, _reserve0, _reserve1);
        if (feeOn) kLast = uint256(reserve0) * reserve1; // reserve0 and reserve1 are up-to-date
        emit Burn(msg.sender, amount0, amount1, to);
    }

    function _recordSwapFees(
        uint112 oldReserve0,
        uint112 oldReserve1,
        bool splitFee
    ) private {
        if (kLast != 0) {
            (uint112 newReserve0, uint112 newReserve1, ) = getReserves();
            uint256 feeShare = uint256(newReserve0) * newReserve1 - uint256(oldReserve0) * oldReserve1;
            pendingFeeTotal += feeShare;
            if (splitFee) {
                (address splitFeeRecipient, uint256 splitFeeBips) = IBlazeSwapBaseManager(manager).getTradingFeeSplit(
                    msg.sender
                );
                if (splitFeeRecipient != address(0) && splitFeeBips > 0) {
                    uint256 splitFeeShare = (feeShare * splitFeeBips) / 100_00;
                    if (feeShare > 0) {
                        uint256 oldFeeShare = pendingFeeShare[splitFeeRecipient];
                        if (oldFeeShare == 0) {
                            pendingFeeAccount.push(splitFeeRecipient);
                        }
                        pendingFeeShare[splitFeeRecipient] += splitFeeShare;
                    }
                }
            }
        }
    }

    function splitFeeSwap(
        uint256 amount0Out,
        uint256 amount1Out,
        address to,
        bytes calldata data
    ) external {
        (uint112 _reserve0, uint112 _reserve1, ) = getReserves();
        swapInternal(_reserve0, reserve1, amount0Out, amount1Out, to, data);
        _recordSwapFees(_reserve0, _reserve1, true);
    }

    function swap(
        uint256 amount0Out,
        uint256 amount1Out,
        address to,
        bytes calldata data
    ) external {
        (uint112 _reserve0, uint112 _reserve1, ) = getReserves();
        swapInternal(_reserve0, reserve1, amount0Out, amount1Out, to, data);
        _recordSwapFees(_reserve0, _reserve1, false);
    }

    // this low-level function should be called from a contract which performs important safety checks
    function swapInternal(
        uint112 _reserve0,
        uint112 _reserve1,
        uint256 amount0Out,
        uint256 amount1Out,
        address to,
        bytes calldata data
    ) internal lock {
        require(amount0Out > 0 || amount1Out > 0, 'BlazeSwap: INSUFFICIENT_OUTPUT_AMOUNT');
        require(amount0Out < _reserve0 && amount1Out < _reserve1, 'BlazeSwap: INSUFFICIENT_LIQUIDITY');

        uint256 balance0;
        uint256 balance1;
        {
            // scope for _token{0,1}, avoids stack too deep errors
            address _token0 = token0;
            address _token1 = token1;
            require(to != _token0 && to != _token1, 'BlazeSwap: INVALID_TO');
            if (amount0Out > 0) _token0.safeTransfer(to, amount0Out);
            // optimistically transfer tokens
            if (amount1Out > 0) _token1.safeTransfer(to, amount1Out);
            // optimistically transfer tokens
            if (data.length > 0) IBlazeSwapCallee(to).blazeSwapCall(msg.sender, amount0Out, amount1Out, data);
            balance0 = IERC20(_token0).balanceOf(address(this));
            balance1 = IERC20(_token1).balanceOf(address(this));
        }
        uint256 amount0In;
        uint256 amount1In;
        unchecked {
            amount0In = balance0 > _reserve0 - amount0Out ? balance0 - (_reserve0 - amount0Out) : 0;
            amount1In = balance1 > _reserve1 - amount1Out ? balance1 - (_reserve1 - amount1Out) : 0;
        }
        require(amount0In > 0 || amount1In > 0, 'BlazeSwap: INSUFFICIENT_INPUT_AMOUNT');
        {
            // scope for reserve{0,1}Adjusted, avoids stack too deep errors
            uint256 balance0Adjusted = balance0 * 1000 - amount0In * 3;
            uint256 balance1Adjusted = balance1 * 1000 - amount1In * 3;
            require(balance0Adjusted * balance1Adjusted >= uint256(_reserve0) * _reserve1 * 1000**2, 'BlazeSwap: K');
        }
        _update(balance0, balance1, _reserve0, _reserve1);
        emit Swap(msg.sender, amount0In, amount1In, amount0Out, amount1Out, to);
    }

    // force balances to match reserves
    function skim(address to) external lock {
        address _token0 = token0; // gas savings
        address _token1 = token1; // gas savings
        _token0.safeTransfer(to, IERC20(_token0).balanceOf(address(this)) - reserve0);
        _token1.safeTransfer(to, IERC20(_token1).balanceOf(address(this)) - reserve1);
    }

    // force reserves to match balances
    function sync() external lock {
        _update(IERC20(token0).balanceOf(address(this)), IERC20(token1).balanceOf(address(this)), reserve0, reserve1);
    }
}
