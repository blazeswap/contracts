import { waffle } from 'hardhat'
import { expect } from 'chai'
import { BigNumber, constants } from 'ethers'

import { routerFixture } from './shared/fixtures'
import { expandTo18Decimals, getApprovalDigest, MINIMUM_LIQUIDITY } from '../core/shared/utilities'

import { ecsign } from 'ethereumjs-util'

import DeflatingERC20Test from '../../artifacts/contracts/periphery/test/DeflatingERC20Test.sol/DeflatingERC20Test.json'
import { IBlazeSwapPair, IBlazeSwapPair__factory, IBlazeSwapRouter, IERC20, IWNat } from '../../typechain-types'

const { createFixtureLoader, deployContract } = waffle

describe('BlazeSwapRouter fee-on-transfer tokens', () => {
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
    await router.addLiquidityNAT(
      DTT.address,
      DTTAmount,
      DTTAmount,
      WNATAmount,
      1_00,
      wallet.address,
      constants.MaxUint256,
      {
        value: WNATAmount,
      }
    )
  }

  it('addLiquidityNAT', async () => {
    const DTTAmount = expandTo18Decimals(1)
    const NATAmount = expandTo18Decimals(4)
    await DTT.approve(router.address, constants.MaxUint256)

    await addLiquidity(DTTAmount, NATAmount)
    const totalSupply0 = await pair.totalSupply()

    // same amount as in pair creation without feeBips, it fails because the amount to send is calculated incorreclty
    await expect(
      router.addLiquidityNAT(DTT.address, DTTAmount, DTTAmount, NATAmount, 0, wallet.address, constants.MaxUint256, {
        value: NATAmount,
      })
    ).to.be.revertedWith('BlazeSwapRouter: INSUFFICIENT_A_AMOUNT')

    // same amount as in pair creation with correct feeBips -> same liquidity
    await router.addLiquidityNAT(
      DTT.address,
      DTTAmount,
      DTTAmount,
      NATAmount,
      1_00,
      wallet.address,
      constants.MaxUint256,
      {
        value: NATAmount,
      }
    )
    const totalSupply1 = await pair.totalSupply()

    // no minimum amount without feeBips, it succeeds but the result is sub-optimal
    await expect(
      router.addLiquidityNAT(DTT.address, DTTAmount, 0, 0, 0, wallet.address, constants.MaxUint256, {
        value: NATAmount,
      })
    ).not.to.be.reverted
    const totalSupply2 = await pair.totalSupply()

    expect(totalSupply1).to.eq(totalSupply0.mul(2))
    expect(totalSupply2).to.lt(totalSupply0.mul(3))
  })

  it('removeLiquidityNAT', async () => {
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
    await router.removeLiquidityNAT(
      DTT.address,
      liquidity,
      NaiveDTTExpected,
      WNATExpected,
      wallet.address,
      constants.MaxUint256
    )
  })

  it('removeLiquidityNATWithPermit', async () => {
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

    await router.removeLiquidityNATWithPermit(
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

  describe('swapExactTokensForTokens', () => {
    const DTTAmount = expandTo18Decimals(5).mul(100).div(99)
    const NATAmount = expandTo18Decimals(10)
    const amountIn = expandTo18Decimals(1)

    beforeEach(async () => {
      await addLiquidity(DTTAmount, NATAmount)
    })

    it('DTT -> WNAT', async () => {
      await DTT.approve(router.address, constants.MaxUint256)

      await router.swapExactTokensForTokens(
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

      await router.swapExactTokensForTokens(
        amountIn,
        0,
        [WNAT.address, DTT.address],
        wallet.address,
        constants.MaxUint256
      )
    })
  })

  // NAT -> DTT
  it('swapExactNATForTokens', async () => {
    const DTTAmount = expandTo18Decimals(10).mul(100).div(99)
    const NATAmount = expandTo18Decimals(5)
    const swapAmount = expandTo18Decimals(1)
    await addLiquidity(DTTAmount, NATAmount)

    await router.swapExactNATForTokens(0, [WNAT.address, DTT.address], wallet.address, constants.MaxUint256, {
      value: swapAmount,
    })
  })

  // DTT -> NAT
  it('swapExactTokensForNAT', async () => {
    const DTTAmount = expandTo18Decimals(5).mul(100).div(99)
    const NATAmount = expandTo18Decimals(10)
    const swapAmount = expandTo18Decimals(1)

    await addLiquidity(DTTAmount, NATAmount)
    await DTT.approve(router.address, constants.MaxUint256)

    await router.swapExactTokensForNAT(swapAmount, 0, [DTT.address, WNAT.address], wallet.address, constants.MaxUint256)
  })

  // NAT -> DTT
  it('swap with minimum sent amount reverts with INSUFFICIENT_OUTPUT_AMOUNT', async () => {
    const DTTAmount = expandTo18Decimals(10).mul(100).div(99)
    const NATAmount = expandTo18Decimals(5)
    const swapAmount = expandTo18Decimals(1)
    await addLiquidity(DTTAmount, NATAmount)

    const [amountsSent] = await router.callStatic.swapExactNATForTokens(
      0,
      [WNAT.address, DTT.address],
      wallet.address,
      constants.MaxUint256,
      {
        value: swapAmount,
      }
    )

    await expect(
      router.swapExactNATForTokens(amountsSent[1], [WNAT.address, DTT.address], wallet.address, constants.MaxUint256, {
        value: swapAmount,
      })
    ).to.be.revertedWith('BlazeSwapRouter: INSUFFICIENT_OUTPUT_AMOUNT')
  })

  // NAT -> DTT
  it('swap with exact output reverts with FEE_ON_TRANSFER', async () => {
    const DTTAmount = expandTo18Decimals(10).mul(100).div(99)
    const NATAmount = expandTo18Decimals(5)
    const swapAmount = expandTo18Decimals(1)
    await addLiquidity(DTTAmount, NATAmount)

    await expect(
      router.swapNATForExactTokens(swapAmount, [WNAT.address, DTT.address], wallet.address, constants.MaxUint256, {
        value: swapAmount,
      })
    ).to.be.revertedWith('BlazeSwapRouter: FEE_ON_TRANSFER')
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
      1_00,
      1_00,
      wallet.address,
      constants.MaxUint256
    )
  }

  describe('swapExactTokensForTokens', () => {
    const DTTAmount = expandTo18Decimals(5).mul(100).div(99)
    const DTT2Amount = expandTo18Decimals(5)
    const amountIn = expandTo18Decimals(1)

    beforeEach(async () => {
      await addLiquidity(DTTAmount, DTT2Amount)
    })

    it('DTT -> DTT2', async () => {
      await DTT.approve(router.address, constants.MaxUint256)

      await router.swapExactTokensForTokens(
        amountIn,
        0,
        [DTT.address, DTT2.address],
        wallet.address,
        constants.MaxUint256
      )
    })

    it('amountsSent, amountReceived', async () => {
      await DTT.approve(router.address, constants.MaxUint256)

      const expectedReceivedA = amountIn.mul(99).div(100)
      const expectedSentB = (await router.getAmountsOut(expectedReceivedA, [DTT.address, DTT2.address]))[1]

      const [amountsSent, amountsRecv] = await router.callStatic.swapExactTokensForTokens(
        amountIn,
        0,
        [DTT.address, DTT2.address],
        wallet.address,
        constants.MaxUint256
      )

      expect(amountsSent).to.be.deep.eq([amountIn, expectedSentB])
      expect(amountsRecv).to.be.deep.eq([expectedReceivedA, expectedSentB.mul(99).div(100).add(1)])
    })
  })
})
