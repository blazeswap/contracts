import hre from 'hardhat'
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers'
import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { expect } from 'chai'
import { constants } from 'ethers'

import { expandTo18Decimals } from '../core/shared/utilities'
import { routerFixture } from './shared/fixtures'

import { ExampleSwapToPrice, IBlazeSwapPair, IBlazeSwapRouter, IERC20 } from '../../typechain-types'

import { deployContract } from '../shared/shared/utilities'

describe('ExampleSwapToPrice', () => {
  let wallet: SignerWithAddress

  let token0: IERC20
  let token1: IERC20
  let pair: IBlazeSwapPair
  let swapToPriceExample: ExampleSwapToPrice
  let router: IBlazeSwapRouter
  beforeEach(async function () {
    [wallet] = await hre.ethers.getSigners()
    const fixture = await loadFixture(routerFixture)
    token0 = fixture.token0
    token1 = fixture.token1
    pair = fixture.pair
    router = fixture.router
    swapToPriceExample = (await deployContract('ExampleSwapToPrice', [
      fixture.factory.address,
      fixture.router.address,
    ])) as ExampleSwapToPrice
  })

  beforeEach('set up price differential of 1:100', async () => {
    await token0.transfer(pair.address, expandTo18Decimals(10))
    await token1.transfer(pair.address, expandTo18Decimals(1000))
    await pair.sync()
  })

  beforeEach('approve the swap contract to spend any amount of both tokens', async () => {
    await token0.approve(swapToPriceExample.address, constants.MaxUint256)
    await token1.approve(swapToPriceExample.address, constants.MaxUint256)
  })

  it('correct router address', async () => {
    expect(await swapToPriceExample.router()).to.eq(router.address)
  })

  describe('#swapToPrice', () => {
    it('requires non-zero true price inputs', async () => {
      await expect(
        swapToPriceExample.swapToPrice(
          token0.address,
          token1.address,
          0,
          0,
          constants.MaxUint256,
          constants.MaxUint256,
          wallet.address,
          constants.MaxUint256
        )
      ).to.be.revertedWith('ExampleSwapToPrice: ZERO_PRICE')
      await expect(
        swapToPriceExample.swapToPrice(
          token0.address,
          token1.address,
          10,
          0,
          constants.MaxUint256,
          constants.MaxUint256,
          wallet.address,
          constants.MaxUint256
        )
      ).to.be.revertedWith('ExampleSwapToPrice: ZERO_PRICE')
      await expect(
        swapToPriceExample.swapToPrice(
          token0.address,
          token1.address,
          0,
          10,
          constants.MaxUint256,
          constants.MaxUint256,
          wallet.address,
          constants.MaxUint256
        )
      ).to.be.revertedWith('ExampleSwapToPrice: ZERO_PRICE')
    })

    it('requires non-zero max spend', async () => {
      await expect(
        swapToPriceExample.swapToPrice(
          token0.address,
          token1.address,
          1,
          100,
          0,
          0,
          wallet.address,
          constants.MaxUint256
        )
      ).to.be.revertedWith('ExampleSwapToPrice: ZERO_SPEND')
    })

    it('moves the price to 1:90', async () => {
      await expect(
        swapToPriceExample.swapToPrice(
          token0.address,
          token1.address,
          1,
          90,
          constants.MaxUint256,
          constants.MaxUint256,
          wallet.address,
          constants.MaxUint256
        )
      )
        // (1e19 + 526682316179835569) : (1e21 - 49890467170695440744) ~= 1:90
        .to.emit(token0, 'Transfer')
        .withArgs(wallet.address, swapToPriceExample.address, '526682316179835569')
        .to.emit(token0, 'Approval')
        .withArgs(swapToPriceExample.address, router.address, '526682316179835569')
        .to.emit(token0, 'Transfer')
        .withArgs(swapToPriceExample.address, pair.address, '526682316179835569')
        .to.emit(token1, 'Transfer')
        .withArgs(pair.address, wallet.address, '49890467170695440744')
    })

    it('moves the price to 1:110', async () => {
      await expect(
        swapToPriceExample.swapToPrice(
          token0.address,
          token1.address,
          1,
          110,
          constants.MaxUint256,
          constants.MaxUint256,
          wallet.address,
          constants.MaxUint256
        )
      )
        // (1e21 + 47376582963642643588) : (1e19 - 451039908682851138) ~= 1:110
        .to.emit(token1, 'Transfer')
        .withArgs(wallet.address, swapToPriceExample.address, '47376582963642643588')
        .to.emit(token1, 'Approval')
        .withArgs(swapToPriceExample.address, router.address, '47376582963642643588')
        .to.emit(token1, 'Transfer')
        .withArgs(swapToPriceExample.address, pair.address, '47376582963642643588')
        .to.emit(token0, 'Transfer')
        .withArgs(pair.address, wallet.address, '451039908682851138')
    })

    it('reverse token order', async () => {
      await expect(
        swapToPriceExample.swapToPrice(
          token1.address,
          token0.address,
          110,
          1,
          constants.MaxUint256,
          constants.MaxUint256,
          wallet.address,
          constants.MaxUint256
        )
      )
        // (1e21 + 47376582963642643588) : (1e19 - 451039908682851138) ~= 1:110
        .to.emit(token1, 'Transfer')
        .withArgs(wallet.address, swapToPriceExample.address, '47376582963642643588')
        .to.emit(token1, 'Approval')
        .withArgs(swapToPriceExample.address, router.address, '47376582963642643588')
        .to.emit(token1, 'Transfer')
        .withArgs(swapToPriceExample.address, pair.address, '47376582963642643588')
        .to.emit(token0, 'Transfer')
        .withArgs(pair.address, wallet.address, '451039908682851138')
    })

    it('swap gas cost', async () => {
      const tx = await swapToPriceExample.swapToPrice(
        token0.address,
        token1.address,
        1,
        110,
        constants.MaxUint256,
        constants.MaxUint256,
        wallet.address,
        constants.MaxUint256
      )
      const receipt = await tx.wait()
      expect(receipt.gasUsed).to.be.within(165400, 165500)
    })
  })
})
