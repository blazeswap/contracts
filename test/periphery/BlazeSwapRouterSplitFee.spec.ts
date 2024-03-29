import hre from 'hardhat'
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers'
import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { expect } from 'chai'
import { BigNumber, constants } from 'ethers'

import { expandTo18Decimals, increaseTime } from '../core/shared/utilities'
import { routerFixture } from './shared/fixtures'
import {
  IBlazeSwapFactory,
  IBlazeSwapManager,
  IBlazeSwapPair,
  IBlazeSwapPair__factory,
  IBlazeSwapRouter,
  IERC20,
  IWNat,
} from '../../typechain-types'

import { deployContract } from '../shared/shared/utilities'

describe('BlazeSwapRouter split-fee', () => {
  let wallet: SignerWithAddress
  let feeRecipient: SignerWithAddress
  let splitFeeRecipient: SignerWithAddress

  let token0: IERC20
  let WNAT: IWNat
  let WNATPartner: IERC20
  let manager: IBlazeSwapManager
  let factory: IBlazeSwapFactory
  let router: IBlazeSwapRouter
  let WNATPair: IBlazeSwapPair
  beforeEach(async function () {
    ;[wallet, feeRecipient, splitFeeRecipient] = await hre.ethers.getSigners()
    const fixture = await loadFixture(routerFixture)
    token0 = fixture.token0
    WNAT = fixture.wNat
    WNATPartner = fixture.wNatPartner
    manager = fixture.manager
    factory = fixture.factory
    router = fixture.routerSplitFee
    WNATPair = fixture.wNatPair

    await manager.setTradingFeeTo(feeRecipient.address)
    await manager.setTradingFeeSplit(router.address, splitFeeRecipient.address, 25_00)
  })

  afterEach(async function () {
    expect(await hre.ethers.provider.getBalance(router.address)).to.eq(constants.Zero)
  })

  describe('splitFee', () => {
    const WNATPartnerAmount = expandTo18Decimals(10)
    const NATAmount = expandTo18Decimals(5)
    const swapAmount = expandTo18Decimals(1)

    beforeEach(async () => {
      await WNATPartner.transfer(WNATPair.address, WNATPartnerAmount)
      await WNAT.deposit({ value: NATAmount })
      await WNAT.transfer(WNATPair.address, NATAmount)
      await WNATPair.mint(wallet.address)

      await token0.approve(router.address, constants.MaxUint256)
    })

    it('fee', async () => {
      const startLiquidity = await WNATPair.totalSupply()
      await router.swapExactNATForTokens(0, [WNAT.address, WNATPartner.address], wallet.address, constants.MaxUint256, {
        value: swapAmount,
      })
      await WNATPair.mintFee()
      const endLiquidity = await WNATPair.totalSupply()
      const fee = endLiquidity.sub(startLiquidity)
      expect(fee).to.gt(0)
      expect(await WNATPair.balanceOf(feeRecipient.address)).to.eq(fee.sub(fee.div(4)))
      expect(await WNATPair.balanceOf(splitFeeRecipient.address)).to.eq(fee.div(4))
    })

    it('gas', async () => {
      const WNATPartnerAmount = expandTo18Decimals(10)
      const NATAmount = expandTo18Decimals(5)
      await WNATPartner.transfer(WNATPair.address, WNATPartnerAmount)
      await WNAT.deposit({ value: NATAmount })
      await WNAT.transfer(WNATPair.address, NATAmount)
      await WNATPair.mint(wallet.address)

      // ensure that setting price{0,1}CumulativeLast for the first time doesn't affect our gas math
      await increaseTime(1) // not really needed by hardhat
      await WNATPair.sync()

      const swapAmount = expandTo18Decimals(1)
      await increaseTime(1) // not really needed by hardhat
      const tx = await router.swapExactNATForTokens(
        0,
        [WNAT.address, WNATPartner.address],
        wallet.address,
        constants.MaxUint256,
        {
          value: swapAmount,
        }
      )
      const receipt = await tx.wait()
      expect(receipt.gasUsed).to.be.within(308500, 309500)
    })
  })

  describe('splitFee on fee-on-transfer tokens', () => {
    let DTT: IERC20
    let DTTPair: IBlazeSwapPair
    beforeEach(async function () {
      DTT = (await deployContract('DeflatingERC20Test', [expandTo18Decimals(10000)])) as IERC20

      // make a DTT<>WNAT pair
      await factory.createPair(DTT.address, WNAT.address)
      const pairAddress = await factory.getPair(DTT.address, WNAT.address)
      DTTPair = IBlazeSwapPair__factory.connect(pairAddress, wallet)
    })

    afterEach(async function () {
      expect(await hre.ethers.provider.getBalance(router.address)).to.eq(0)
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

    it('fee', async () => {
      const DTTAmount = expandTo18Decimals(10).mul(100).div(99)
      const NATAmount = expandTo18Decimals(5)
      const swapAmount = expandTo18Decimals(1)
      await addLiquidity(DTTAmount, NATAmount)

      const startLiquidity = await DTTPair.totalSupply()
      await router.swapExactNATForTokens(0, [WNAT.address, DTT.address], wallet.address, constants.MaxUint256, {
        value: swapAmount,
      })

      await DTTPair.mintFee()
      const endLiquidity = await DTTPair.totalSupply()
      const fee = endLiquidity.sub(startLiquidity)
      expect(fee).to.gt(0)
      expect(await DTTPair.balanceOf(feeRecipient.address)).to.eq(fee.sub(fee.div(4)))
      expect(await DTTPair.balanceOf(splitFeeRecipient.address)).to.eq(fee.div(4))
    })
  })
})
