// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import '../interfaces/IBlazeSwapRouter.sol';

contract RouterEventEmitter {
    event Amounts(uint256[] amounts);

    receive() external payable {}

    function swapExactTokensForTokens(
        address router,
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external {
        (bool success, bytes memory returnData) = router.delegatecall(
            abi.encodeWithSelector(
                IBlazeSwapRouter(router).swapExactTokensForTokens.selector,
                amountIn,
                amountOutMin,
                path,
                to,
                deadline
            )
        );
        assert(success);
        emit Amounts(abi.decode(returnData, (uint256[])));
    }

    function swapTokensForExactTokens(
        address router,
        uint256 amountOut,
        uint256 amountInMax,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external {
        (bool success, bytes memory returnData) = router.delegatecall(
            abi.encodeWithSelector(
                IBlazeSwapRouter(router).swapTokensForExactTokens.selector,
                amountOut,
                amountInMax,
                path,
                to,
                deadline
            )
        );
        assert(success);
        emit Amounts(abi.decode(returnData, (uint256[])));
    }

    function swapExactNATForTokens(
        address router,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable {
        (bool success, bytes memory returnData) = router.delegatecall(
            abi.encodeWithSelector(
                IBlazeSwapRouter(router).swapExactNATForTokens.selector,
                amountOutMin,
                path,
                to,
                deadline
            )
        );
        assert(success);
        emit Amounts(abi.decode(returnData, (uint256[])));
    }

    function swapTokensForExactNAT(
        address router,
        uint256 amountOut,
        uint256 amountInMax,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external {
        (bool success, bytes memory returnData) = router.delegatecall(
            abi.encodeWithSelector(
                IBlazeSwapRouter(router).swapTokensForExactNAT.selector,
                amountOut,
                amountInMax,
                path,
                to,
                deadline
            )
        );
        assert(success);
        emit Amounts(abi.decode(returnData, (uint256[])));
    }

    function swapExactTokensForNAT(
        address router,
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external {
        (bool success, bytes memory returnData) = router.delegatecall(
            abi.encodeWithSelector(
                IBlazeSwapRouter(router).swapExactTokensForNAT.selector,
                amountIn,
                amountOutMin,
                path,
                to,
                deadline
            )
        );
        assert(success);
        emit Amounts(abi.decode(returnData, (uint256[])));
    }

    function swapNATForExactTokens(
        address router,
        uint256 amountOut,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable {
        (bool success, bytes memory returnData) = router.delegatecall(
            abi.encodeWithSelector(
                IBlazeSwapRouter(router).swapNATForExactTokens.selector,
                amountOut,
                path,
                to,
                deadline
            )
        );
        assert(success);
        emit Amounts(abi.decode(returnData, (uint256[])));
    }
}
