import { waffle } from 'hardhat'
import { expect } from 'chai'
import { BigNumber, constants } from 'ethers'

import { routerFixture } from './shared/fixtures'
import { expandTo18Decimals, getApprovalDigest, MINIMUM_LIQUIDITY } from '../core/shared/utilities'

import { ecsign } from 'ethereumjs-util'

import DeflatingERC20Test from '../../artifacts/contracts/periphery/test/DeflatingERC20Test.sol/DeflatingERC20Test.json'
import { IBlazeSwapPair, IBlazeSwapPair__factory, IBlazeSwapRouter, IERC20, IWNat } from '../../typechain-types'

const { createFixtureLoader, deployContract } = waffle

describe('BlazeSwapRouter02', () => {
  const provider = waffle.provider
  const [wallet] = provider.getWallets()
  const loadFixture = createFixtureLoader([wallet], provider)

  let token0: IERC20
  let token1: IERC20
  let router: IBlazeSwapRouter
  beforeEach(async function () {
    const fixture = await loadFixture(routerFixture)
    token0 = fixture.token0
    token1 = fixture.token1
    router = fixture.router
  })

  it('quote', async () => {
    expect(await router.quote(BigNumber.from(1), BigNumber.from(100), BigNumber.from(200))).to.eq(BigNumber.from(2))
    expect(await router.quote(BigNumber.from(2), BigNumber.from(200), BigNumber.from(100))).to.eq(BigNumber.from(1))
    await expect(router.quote(BigNumber.from(0), BigNumber.from(100), BigNumber.from(200))).to.be.revertedWith(
      'BlazeSwapLibrary: INSUFFICIENT_AMOUNT'
    )
    await expect(router.quote(BigNumber.from(1), BigNumber.from(0), BigNumber.from(200))).to.be.revertedWith(
      'BlazeSwapLibrary: INSUFFICIENT_LIQUIDITY'
    )
    await expect(router.quote(BigNumber.from(1), BigNumber.from(100), BigNumber.from(0))).to.be.revertedWith(
      'BlazeSwapLibrary: INSUFFICIENT_LIQUIDITY'
    )
  })

  it('getAmountOut', async () => {
    expect(await router.getAmountOut(BigNumber.from(2), BigNumber.from(100), BigNumber.from(100))).to.eq(
      BigNumber.from(1)
    )
    await expect(router.getAmountOut(BigNumber.from(0), BigNumber.from(100), BigNumber.from(100))).to.be.revertedWith(
      'BlazeSwapLibrary: INSUFFICIENT_INPUT_AMOUNT'
    )
    await expect(router.getAmountOut(BigNumber.from(2), BigNumber.from(0), BigNumber.from(100))).to.be.revertedWith(
      'BlazeSwapLibrary: INSUFFICIENT_LIQUIDITY'
    )
    await expect(router.getAmountOut(BigNumber.from(2), BigNumber.from(100), BigNumber.from(0))).to.be.revertedWith(
      'BlazeSwapLibrary: INSUFFICIENT_LIQUIDITY'
    )
  })

  it('getAmountIn', async () => {
    expect(await router.getAmountIn(BigNumber.from(1), BigNumber.from(100), BigNumber.from(100))).to.eq(
      BigNumber.from(2)
    )
    await expect(router.getAmountIn(BigNumber.from(0), BigNumber.from(100), BigNumber.from(100))).to.be.revertedWith(
      'BlazeSwapLibrary: INSUFFICIENT_OUTPUT_AMOUNT'
    )
    await expect(router.getAmountIn(BigNumber.from(1), BigNumber.from(0), BigNumber.from(100))).to.be.revertedWith(
      'BlazeSwapLibrary: INSUFFICIENT_LIQUIDITY'
    )
    await expect(router.getAmountIn(BigNumber.from(1), BigNumber.from(100), BigNumber.from(0))).to.be.revertedWith(
      'BlazeSwapLibrary: INSUFFICIENT_LIQUIDITY'
    )
  })

  it('getAmountsOut', async () => {
    await token0.approve(router.address, constants.MaxUint256)
    await token1.approve(router.address, constants.MaxUint256)
    await router.addLiquidity(
      token0.address,
      token1.address,
      BigNumber.from(10000),
      BigNumber.from(10000),
      0,
      0,
      wallet.address,
      constants.MaxUint256
    )

    await expect(router.getAmountsOut(BigNumber.from(2), [token0.address])).to.be.revertedWith(
      'BlazeSwapLibrary: INVALID_PATH'
    )
    const path = [token0.address, token1.address]
    expect(await router.getAmountsOut(BigNumber.from(2), path)).to.deep.eq([BigNumber.from(2), BigNumber.from(1)])
  })

  it('getAmountsIn', async () => {
    await token0.approve(router.address, constants.MaxUint256)
    await token1.approve(router.address, constants.MaxUint256)
    await router.addLiquidity(
      token0.address,
      token1.address,
      BigNumber.from(10000),
      BigNumber.from(10000),
      0,
      0,
      wallet.address,
      constants.MaxUint256
    )

    await expect(router.getAmountsIn(BigNumber.from(1), [token0.address])).to.be.revertedWith(
      'BlazeSwapLibrary: INVALID_PATH'
    )
    const path = [token0.address, token1.address]
    expect(await router.getAmountsIn(BigNumber.from(1), path)).to.deep.eq([BigNumber.from(2), BigNumber.from(1)])
  })
})

describe('fee-on-transfer tokens', () => {
  const provider = waffle.provider
  const [wallet] = provider.getWallets()
  const loadFixture = createFixtureLoader([wallet], provider)

  let DTT: IERC20
  let WNAT: IWNat
  let router: IBlazeSwapRouter
  let pair: IBlazeSwapPair
  beforeEach(async function () {
    const fixture = await loadFixture(routerFixture)

    WNAT = fixture.wNat
    router = fixture.router

    DTT = (await deployContract(wallet, DeflatingERC20Test, [expandTo18Decimals(10000)])) as IERC20

    // make a DTT<>WNAT pair
    await fixture.factory.createPair(DTT.address, WNAT.address)
    const pairAddress = await fixture.factory.getPair(DTT.address, WNAT.address)
    pair = IBlazeSwapPair__factory.connect(pairAddress, wallet)
  })

  afterEach(async function () {
    expect(await provider.getBalance(router.address)).to.eq(0)
  })

  async function addLiquidity(DTTAmount: BigNumber, WNATAmount: BigNumber) {
    await DTT.approve(router.address, constants.MaxUint256)
    await router.addLiquidityNAT(DTT.address, DTTAmount, DTTAmount, WNATAmount, wallet.address, constants.MaxUint256, {
      value: WNATAmount,
    })
  }

  it('removeLiquidityNATSupportingFeeOnTransferTokens', async () => {
    const DTTAmount = expandTo18Decimals(1)
    const NATAmount = expandTo18Decimals(4)
    await addLiquidity(DTTAmount, NATAmount)

    const DTTInPair = await DTT.balanceOf(pair.address)
    const WNATInPair = await WNAT.balanceOf(pair.address)
    const liquidity = await pair.balanceOf(wallet.address)
    const totalSupply = await pair.totalSupply()
    const NaiveDTTExpected = DTTInPair.mul(liquidity).div(totalSupply)
    const WNATExpected = WNATInPair.mul(liquidity).div(totalSupply)

    await pair.approve(router.address, constants.MaxUint256)
    await router.removeLiquidityNATSupportingFeeOnTransferTokens(
      DTT.address,
      liquidity,
      NaiveDTTExpected,
      WNATExpected,
      wallet.address,
      constants.MaxUint256
    )
  })

  it('removeLiquidityNATWithPermitSupportingFeeOnTransferTokens', async () => {
    const DTTAmount = expandTo18Decimals(1).mul(100).div(99)
    const NATAmount = expandTo18Decimals(4)
    await addLiquidity(DTTAmount, NATAmount)

    const expectedLiquidity = expandTo18Decimals(2)

    const nonce = await pair.nonces(wallet.address)
    const digest = await getApprovalDigest(
      pair,
      { owner: wallet.address, spender: router.address, value: expectedLiquidity.sub(MINIMUM_LIQUIDITY) },
      nonce,
      constants.MaxUint256
    )
    const { v, r, s } = ecsign(Buffer.from(digest.slice(2), 'hex'), Buffer.from(wallet.privateKey.slice(2), 'hex'))

    const DTTInPair = await DTT.balanceOf(pair.address)
    const WNATInPair = await WNAT.balanceOf(pair.address)
    const liquidity = await pair.balanceOf(wallet.address)
    const totalSupply = await pair.totalSupply()
    const NaiveDTTExpected = DTTInPair.mul(liquidity).div(totalSupply)
    const WNATExpected = WNATInPair.mul(liquidity).div(totalSupply)

    await pair.approve(router.address, constants.MaxUint256)
    await router.removeLiquidityNATWithPermitSupportingFeeOnTransferTokens(
      DTT.address,
      liquidity,
      NaiveDTTExpected,
      WNATExpected,
      wallet.address,
      constants.MaxUint256,
      false,
      v,
      r,
      s
    )
  })

  describe('swapExactTokensForTokensSupportingFeeOnTransferTokens', () => {
    const DTTAmount = expandTo18Decimals(5).mul(100).div(99)
    const NATAmount = expandTo18Decimals(10)
    const amountIn = expandTo18Decimals(1)

    beforeEach(async () => {
      await addLiquidity(DTTAmount, NATAmount)
    })

    it('DTT -> WNAT', async () => {
      await DTT.approve(router.address, constants.MaxUint256)

      await router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
        amountIn,
        0,
        [DTT.address, WNAT.address],
        wallet.address,
        constants.MaxUint256
      )
    })

    // WNAT -> DTT
    it('WNAT -> DTT', async () => {
      await WNAT.deposit({ value: amountIn }) // mint WNAT
      await WNAT.approve(router.address, constants.MaxUint256)

      await router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
        amountIn,
        0,
        [WNAT.address, DTT.address],
        wallet.address,
        constants.MaxUint256
      )
    })
  })

  // NAT -> DTT
  it('swapExactNATForTokensSupportingFeeOnTransferTokens', async () => {
    const DTTAmount = expandTo18Decimals(10).mul(100).div(99)
    const NATAmount = expandTo18Decimals(5)
    const swapAmount = expandTo18Decimals(1)
    await addLiquidity(DTTAmount, NATAmount)

    await router.swapExactNATForTokensSupportingFeeOnTransferTokens(
      0,
      [WNAT.address, DTT.address],
      wallet.address,
      constants.MaxUint256,
      {
        value: swapAmount,
      }
    )
  })

  // DTT -> NAT
  it('swapExactTokensForNATSupportingFeeOnTransferTokens', async () => {
    const DTTAmount = expandTo18Decimals(5).mul(100).div(99)
    const NATAmount = expandTo18Decimals(10)
    const swapAmount = expandTo18Decimals(1)

    await addLiquidity(DTTAmount, NATAmount)
    await DTT.approve(router.address, constants.MaxUint256)

    await router.swapExactTokensForNATSupportingFeeOnTransferTokens(
      swapAmount,
      0,
      [DTT.address, WNAT.address],
      wallet.address,
      constants.MaxUint256
    )
  })
})

describe('fee-on-transfer tokens: reloaded', () => {
  const provider = waffle.provider
  const [wallet] = provider.getWallets()
  const loadFixture = createFixtureLoader([wallet], provider)

  let DTT: IERC20
  let DTT2: IERC20
  let router: IBlazeSwapRouter
  beforeEach(async function () {
    const fixture = await loadFixture(routerFixture)

    router = fixture.router

    DTT = (await deployContract(wallet, DeflatingERC20Test, [expandTo18Decimals(10000)])) as IERC20
    DTT2 = (await deployContract(wallet, DeflatingERC20Test, [expandTo18Decimals(10000)])) as IERC20

    // make a DTT<>WNAT pair
    await fixture.factory.createPair(DTT.address, DTT2.address)
    const pairAddress = await fixture.factory.getPair(DTT.address, DTT2.address)
  })

  afterEach(async function () {
    expect(await provider.getBalance(router.address)).to.eq(0)
  })

  async function addLiquidity(DTTAmount: BigNumber, DTT2Amount: BigNumber) {
    await DTT.approve(router.address, constants.MaxUint256)
    await DTT2.approve(router.address, constants.MaxUint256)
    await router.addLiquidity(
      DTT.address,
      DTT2.address,
      DTTAmount,
      DTT2Amount,
      DTTAmount,
      DTT2Amount,
      wallet.address,
      constants.MaxUint256
    )
  }

  describe('swapExactTokensForTokensSupportingFeeOnTransferTokens', () => {
    const DTTAmount = expandTo18Decimals(5).mul(100).div(99)
    const DTT2Amount = expandTo18Decimals(5)
    const amountIn = expandTo18Decimals(1)

    beforeEach(async () => {
      await addLiquidity(DTTAmount, DTT2Amount)
    })

    it('DTT -> DTT2', async () => {
      await DTT.approve(router.address, constants.MaxUint256)

      await router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
        amountIn,
        0,
        [DTT.address, DTT2.address],
        wallet.address,
        constants.MaxUint256
      )
    })
  })
})
