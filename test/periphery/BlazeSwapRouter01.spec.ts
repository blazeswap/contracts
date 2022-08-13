import { waffle } from 'hardhat'
import { expect } from 'chai'
import { BigNumber, constants, utils } from 'ethers'
import { ecsign } from 'ethereumjs-util'

import { expandTo18Decimals, getApprovalDigest, increaseTime, MINIMUM_LIQUIDITY } from '../core/shared/utilities'
import { routerFixture } from './shared/fixtures'
import {
  IBlazeSwapFactory,
  IBlazeSwapPair,
  IBlazeSwapRouter,
  IERC20,
  IWNat,
  RouterEventEmitter,
} from '../../typechain-types'

const { createFixtureLoader } = waffle

describe('BlazeSwapRouter01', () => {
  const provider = waffle.provider
  const [wallet] = provider.getWallets()
  const loadFixture = createFixtureLoader([wallet], provider)
  const AddressDead = utils.getAddress('0x000000000000000000000000000000000000dEaD')

  let token0: IERC20
  let token1: IERC20
  let WNAT: IWNat
  let WNATPartner: IERC20
  let factory: IBlazeSwapFactory
  let router: IBlazeSwapRouter
  let pair: IBlazeSwapPair
  let WNATPair: IBlazeSwapPair
  let routerEventEmitter: RouterEventEmitter
  beforeEach(async function () {
    const fixture = await loadFixture(routerFixture)
    token0 = fixture.token0
    token1 = fixture.token1
    WNAT = fixture.wNat
    WNATPartner = fixture.wNatPartner
    factory = fixture.factory
    router = fixture.router
    pair = fixture.pair
    WNATPair = fixture.wNatPair
    routerEventEmitter = fixture.routerEventEmitter
  })

  afterEach(async function () {
    expect(await provider.getBalance(router.address)).to.eq(constants.Zero)
  })

  describe('BlazeSwapRouter', () => {
    it('factory, wNat', async () => {
      expect(await router.factory()).to.eq(factory.address)
      expect(await router.wNat()).to.eq(WNAT.address)
    })

    it('addLiquidity', async () => {
      const token0Amount = expandTo18Decimals(1)
      const token1Amount = expandTo18Decimals(4)

      const expectedLiquidity = expandTo18Decimals(2)
      await token0.approve(router.address, constants.MaxUint256)
      await token1.approve(router.address, constants.MaxUint256)
      await expect(
        router.addLiquidity(
          token0.address,
          token1.address,
          token0Amount,
          token1Amount,
          0,
          0,
          wallet.address,
          constants.MaxUint256
        )
      )
        .to.emit(token0, 'Transfer')
        .withArgs(wallet.address, pair.address, token0Amount)
        .to.emit(token1, 'Transfer')
        .withArgs(wallet.address, pair.address, token1Amount)
        .to.emit(pair, 'Transfer')
        .withArgs(constants.AddressZero, AddressDead, MINIMUM_LIQUIDITY)
        .to.emit(pair, 'Transfer')
        .withArgs(constants.AddressZero, wallet.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
        .to.emit(pair, 'Sync')
        .withArgs(token0Amount, token1Amount)
        .to.emit(pair, 'Mint')
        .withArgs(router.address, token0Amount, token1Amount)

      expect(await pair.balanceOf(wallet.address)).to.eq(expectedLiquidity.sub(MINIMUM_LIQUIDITY))
    })

    it('addLiquidityNAT', async () => {
      const WNATPartnerAmount = expandTo18Decimals(1)
      const NATAmount = expandTo18Decimals(4)

      const expectedLiquidity = expandTo18Decimals(2)
      const WNATPairToken0 = await WNATPair.token0()
      await WNATPartner.approve(router.address, constants.MaxUint256)
      await expect(
        router.addLiquidityNAT(
          WNATPartner.address,
          WNATPartnerAmount,
          WNATPartnerAmount,
          NATAmount,
          wallet.address,
          constants.MaxUint256,
          { value: NATAmount }
        )
      )
        .to.emit(WNATPair, 'Transfer')
        .withArgs(constants.AddressZero, AddressDead, MINIMUM_LIQUIDITY)
        .to.emit(WNATPair, 'Transfer')
        .withArgs(constants.AddressZero, wallet.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
        .to.emit(WNATPair, 'Sync')
        .withArgs(
          WNATPairToken0 === WNATPartner.address ? WNATPartnerAmount : NATAmount,
          WNATPairToken0 === WNATPartner.address ? NATAmount : WNATPartnerAmount
        )
        .to.emit(WNATPair, 'Mint')
        .withArgs(
          router.address,
          WNATPairToken0 === WNATPartner.address ? WNATPartnerAmount : NATAmount,
          WNATPairToken0 === WNATPartner.address ? NATAmount : WNATPartnerAmount
        )

      expect(await WNATPair.balanceOf(wallet.address)).to.eq(expectedLiquidity.sub(MINIMUM_LIQUIDITY))
    })

    async function addLiquidity(token0Amount: BigNumber, token1Amount: BigNumber) {
      await token0.transfer(pair.address, token0Amount)
      await token1.transfer(pair.address, token1Amount)
      await pair.mint(wallet.address)
    }
    it('removeLiquidity', async () => {
      const token0Amount = expandTo18Decimals(1)
      const token1Amount = expandTo18Decimals(4)
      await addLiquidity(token0Amount, token1Amount)

      const expectedLiquidity = expandTo18Decimals(2)
      await pair.approve(router.address, constants.MaxUint256)
      await expect(
        router.removeLiquidity(
          token0.address,
          token1.address,
          expectedLiquidity.sub(MINIMUM_LIQUIDITY),
          0,
          0,
          wallet.address,
          constants.MaxUint256
        )
      )
        .to.emit(pair, 'Transfer')
        .withArgs(wallet.address, pair.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
        .to.emit(pair, 'Transfer')
        .withArgs(pair.address, constants.AddressZero, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
        .to.emit(token0, 'Transfer')
        .withArgs(pair.address, wallet.address, token0Amount.sub(500))
        .to.emit(token1, 'Transfer')
        .withArgs(pair.address, wallet.address, token1Amount.sub(2000))
        .to.emit(pair, 'Sync')
        .withArgs(500, 2000)
        .to.emit(pair, 'Burn')
        .withArgs(router.address, token0Amount.sub(500), token1Amount.sub(2000), wallet.address)

      expect(await pair.balanceOf(wallet.address)).to.eq(0)
      const totalSupplyToken0 = await token0.totalSupply()
      const totalSupplyToken1 = await token1.totalSupply()
      expect(await token0.balanceOf(wallet.address)).to.eq(totalSupplyToken0.sub(500))
      expect(await token1.balanceOf(wallet.address)).to.eq(totalSupplyToken1.sub(2000))
    })

    it('removeLiquidityNAT', async () => {
      const WNATPartnerAmount = expandTo18Decimals(1)
      const NATAmount = expandTo18Decimals(4)
      await WNATPartner.transfer(WNATPair.address, WNATPartnerAmount)
      await WNAT.deposit({ value: NATAmount })
      await WNAT.transfer(WNATPair.address, NATAmount)
      await WNATPair.mint(wallet.address)

      const expectedLiquidity = expandTo18Decimals(2)
      const WNATPairToken0 = await WNATPair.token0()
      await WNATPair.approve(router.address, constants.MaxUint256)
      await expect(
        router.removeLiquidityNAT(
          WNATPartner.address,
          expectedLiquidity.sub(MINIMUM_LIQUIDITY),
          0,
          0,
          wallet.address,
          constants.MaxUint256
        )
      )
        .to.emit(WNATPair, 'Transfer')
        .withArgs(wallet.address, WNATPair.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
        .to.emit(WNATPair, 'Transfer')
        .withArgs(WNATPair.address, constants.AddressZero, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
        .to.emit(WNAT, 'Transfer')
        .withArgs(WNATPair.address, router.address, NATAmount.sub(2000))
        .to.emit(WNATPartner, 'Transfer')
        .withArgs(WNATPair.address, router.address, WNATPartnerAmount.sub(500))
        .to.emit(WNATPartner, 'Transfer')
        .withArgs(router.address, wallet.address, WNATPartnerAmount.sub(500))
        .to.emit(WNATPair, 'Sync')
        .withArgs(
          WNATPairToken0 === WNATPartner.address ? 500 : 2000,
          WNATPairToken0 === WNATPartner.address ? 2000 : 500
        )
        .to.emit(WNATPair, 'Burn')
        .withArgs(
          router.address,
          WNATPairToken0 === WNATPartner.address ? WNATPartnerAmount.sub(500) : NATAmount.sub(2000),
          WNATPairToken0 === WNATPartner.address ? NATAmount.sub(2000) : WNATPartnerAmount.sub(500),
          router.address
        )

      expect(await WNATPair.balanceOf(wallet.address)).to.eq(0)
      const totalSupplyWNATPartner = await WNATPartner.totalSupply()
      const totalSupplyWNAT = await WNAT.totalSupply()
      expect(await WNATPartner.balanceOf(wallet.address)).to.eq(totalSupplyWNATPartner.sub(500))
      expect(await WNAT.balanceOf(wallet.address)).to.eq(totalSupplyWNAT.sub(2000))
    })

    it('removeLiquidityWithPermit', async () => {
      const token0Amount = expandTo18Decimals(1)
      const token1Amount = expandTo18Decimals(4)
      await addLiquidity(token0Amount, token1Amount)

      const expectedLiquidity = expandTo18Decimals(2)

      const nonce = await pair.nonces(wallet.address)
      const digest = await getApprovalDigest(
        pair,
        { owner: wallet.address, spender: router.address, value: expectedLiquidity.sub(MINIMUM_LIQUIDITY) },
        nonce,
        constants.MaxUint256
      )

      const { v, r, s } = ecsign(Buffer.from(digest.slice(2), 'hex'), Buffer.from(wallet.privateKey.slice(2), 'hex'))

      await router.removeLiquidityWithPermit(
        token0.address,
        token1.address,
        expectedLiquidity.sub(MINIMUM_LIQUIDITY),
        0,
        0,
        wallet.address,
        constants.MaxUint256,
        false,
        v,
        r,
        s
      )
    })

    it('removeLiquidityNATWithPermit', async () => {
      const WNATPartnerAmount = expandTo18Decimals(1)
      const NATAmount = expandTo18Decimals(4)
      await WNATPartner.transfer(WNATPair.address, WNATPartnerAmount)
      await WNAT.deposit({ value: NATAmount })
      await WNAT.transfer(WNATPair.address, NATAmount)
      await WNATPair.mint(wallet.address)

      const expectedLiquidity = expandTo18Decimals(2)

      const nonce = await WNATPair.nonces(wallet.address)
      const digest = await getApprovalDigest(
        WNATPair,
        { owner: wallet.address, spender: router.address, value: expectedLiquidity.sub(MINIMUM_LIQUIDITY) },
        nonce,
        constants.MaxUint256
      )

      const { v, r, s } = ecsign(Buffer.from(digest.slice(2), 'hex'), Buffer.from(wallet.privateKey.slice(2), 'hex'))

      await router.removeLiquidityNATWithPermit(
        WNATPartner.address,
        expectedLiquidity.sub(MINIMUM_LIQUIDITY),
        0,
        0,
        wallet.address,
        constants.MaxUint256,
        false,
        v,
        r,
        s
      )
    })

    describe('swapExactTokensForTokens', () => {
      const token0Amount = expandTo18Decimals(5)
      const token1Amount = expandTo18Decimals(10)
      const swapAmount = expandTo18Decimals(1)
      const expectedOutputAmount = BigNumber.from('1662497915624478906')

      beforeEach(async () => {
        await addLiquidity(token0Amount, token1Amount)
        await token0.approve(router.address, constants.MaxUint256)
      })

      it('happy path', async () => {
        await expect(
          router.swapExactTokensForTokens(
            swapAmount,
            0,
            [token0.address, token1.address],
            wallet.address,
            constants.MaxUint256
          )
        )
          .to.emit(token0, 'Transfer')
          .withArgs(wallet.address, pair.address, swapAmount)
          .to.emit(token1, 'Transfer')
          .withArgs(pair.address, wallet.address, expectedOutputAmount)
          .to.emit(pair, 'Sync')
          .withArgs(token0Amount.add(swapAmount), token1Amount.sub(expectedOutputAmount))
          .to.emit(pair, 'Swap')
          .withArgs(router.address, swapAmount, 0, 0, expectedOutputAmount, wallet.address)
      })

      it('amounts', async () => {
        await token0.approve(routerEventEmitter.address, constants.MaxUint256)
        await expect(
          routerEventEmitter.swapExactTokensForTokens(
            router.address,
            swapAmount,
            0,
            [token0.address, token1.address],
            wallet.address,
            constants.MaxUint256
          )
        )
          .to.emit(routerEventEmitter, 'Amounts')
          .withArgs([swapAmount, expectedOutputAmount])
      })

      it('gas', async () => {
        // ensure that setting price{0,1}CumulativeLast for the first time doesn't affect our gas math
        await increaseTime(provider, 1) // not really needed by hardhat
        await pair.sync()

        await token0.approve(router.address, constants.MaxUint256)
        await increaseTime(provider, 1) // not really needed by hardhat
        const tx = await router.swapExactTokensForTokens(
          swapAmount,
          0,
          [token0.address, token1.address],
          wallet.address,
          constants.MaxUint256
        )
        const receipt = await tx.wait()
        expect(receipt.gasUsed).to.be.eq(105166)
      })
    })

    describe('swapTokensForExactTokens', () => {
      const token0Amount = expandTo18Decimals(5)
      const token1Amount = expandTo18Decimals(10)
      const expectedSwapAmount = BigNumber.from('557227237267357629')
      const outputAmount = expandTo18Decimals(1)

      beforeEach(async () => {
        await addLiquidity(token0Amount, token1Amount)
      })

      it('happy path', async () => {
        await token0.approve(router.address, constants.MaxUint256)
        await expect(
          router.swapTokensForExactTokens(
            outputAmount,
            constants.MaxUint256,
            [token0.address, token1.address],
            wallet.address,
            constants.MaxUint256
          )
        )
          .to.emit(token0, 'Transfer')
          .withArgs(wallet.address, pair.address, expectedSwapAmount)
          .to.emit(token1, 'Transfer')
          .withArgs(pair.address, wallet.address, outputAmount)
          .to.emit(pair, 'Sync')
          .withArgs(token0Amount.add(expectedSwapAmount), token1Amount.sub(outputAmount))
          .to.emit(pair, 'Swap')
          .withArgs(router.address, expectedSwapAmount, 0, 0, outputAmount, wallet.address)
      })

      it('amounts', async () => {
        await token0.approve(routerEventEmitter.address, constants.MaxUint256)
        await expect(
          routerEventEmitter.swapTokensForExactTokens(
            router.address,
            outputAmount,
            constants.MaxUint256,
            [token0.address, token1.address],
            wallet.address,
            constants.MaxUint256
          )
        )
          .to.emit(routerEventEmitter, 'Amounts')
          .withArgs([expectedSwapAmount, outputAmount])
      })
    })

    describe('swapExactNATForTokens', () => {
      const WNATPartnerAmount = expandTo18Decimals(10)
      const NATAmount = expandTo18Decimals(5)
      const swapAmount = expandTo18Decimals(1)
      const expectedOutputAmount = BigNumber.from('1662497915624478906')

      beforeEach(async () => {
        await WNATPartner.transfer(WNATPair.address, WNATPartnerAmount)
        await WNAT.deposit({ value: NATAmount })
        await WNAT.transfer(WNATPair.address, NATAmount)
        await WNATPair.mint(wallet.address)

        await token0.approve(router.address, constants.MaxUint256)
      })

      it('happy path', async () => {
        const WNATPairToken0 = await WNATPair.token0()
        await expect(
          router.swapExactNATForTokens(0, [WNAT.address, WNATPartner.address], wallet.address, constants.MaxUint256, {
            value: swapAmount,
          })
        )
          .to.emit(WNAT, 'Deposit')
          .withArgs(WNATPair.address, swapAmount)
          .to.emit(WNATPartner, 'Transfer')
          .withArgs(WNATPair.address, wallet.address, expectedOutputAmount)
          .to.emit(WNATPair, 'Sync')
          .withArgs(
            WNATPairToken0 === WNATPartner.address
              ? WNATPartnerAmount.sub(expectedOutputAmount)
              : NATAmount.add(swapAmount),
            WNATPairToken0 === WNATPartner.address
              ? NATAmount.add(swapAmount)
              : WNATPartnerAmount.sub(expectedOutputAmount)
          )
          .to.emit(WNATPair, 'Swap')
          .withArgs(
            router.address,
            WNATPairToken0 === WNATPartner.address ? 0 : swapAmount,
            WNATPairToken0 === WNATPartner.address ? swapAmount : 0,
            WNATPairToken0 === WNATPartner.address ? expectedOutputAmount : 0,
            WNATPairToken0 === WNATPartner.address ? 0 : expectedOutputAmount,
            wallet.address
          )
      })

      it('amounts', async () => {
        await expect(
          routerEventEmitter.swapExactNATForTokens(
            router.address,
            0,
            [WNAT.address, WNATPartner.address],
            wallet.address,
            constants.MaxUint256,
            {
              value: swapAmount,
            }
          )
        )
          .to.emit(routerEventEmitter, 'Amounts')
          .withArgs([swapAmount, expectedOutputAmount])
      })

      it('gas', async () => {
        const WNATPartnerAmount = expandTo18Decimals(10)
        const NATAmount = expandTo18Decimals(5)
        await WNATPartner.transfer(WNATPair.address, WNATPartnerAmount)
        await WNAT.deposit({ value: NATAmount })
        await WNAT.transfer(WNATPair.address, NATAmount)
        await WNATPair.mint(wallet.address)

        // ensure that setting price{0,1}CumulativeLast for the first time doesn't affect our gas math
        await increaseTime(provider, 1) // not really needed by hardhat
        await WNATPair.sync()

        const swapAmount = expandTo18Decimals(1)
        await increaseTime(provider, 1) // not really needed by hardhat
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
        expect(receipt.gasUsed).to.be.within(207214, 207284)
      })
    })

    describe('swapTokensForExactNAT', () => {
      const WNATPartnerAmount = expandTo18Decimals(5)
      const NATAmount = expandTo18Decimals(10)
      const expectedSwapAmount = BigNumber.from('557227237267357629')
      const outputAmount = expandTo18Decimals(1)

      beforeEach(async () => {
        await WNATPartner.transfer(WNATPair.address, WNATPartnerAmount)
        await WNAT.deposit({ value: NATAmount })
        await WNAT.transfer(WNATPair.address, NATAmount)
        await WNATPair.mint(wallet.address)
      })

      it('happy path', async () => {
        await WNATPartner.approve(router.address, constants.MaxUint256)
        const WNATPairToken0 = await WNATPair.token0()
        await expect(
          router.swapTokensForExactNAT(
            outputAmount,
            constants.MaxUint256,
            [WNATPartner.address, WNAT.address],
            wallet.address,
            constants.MaxUint256
          )
        )
          .to.emit(WNATPartner, 'Transfer')
          .withArgs(wallet.address, WNATPair.address, expectedSwapAmount)
          .to.emit(WNAT, 'Transfer')
          .withArgs(WNATPair.address, router.address, outputAmount)
          .to.emit(WNATPair, 'Sync')
          .withArgs(
            WNATPairToken0 === WNATPartner.address
              ? WNATPartnerAmount.add(expectedSwapAmount)
              : NATAmount.sub(outputAmount),
            WNATPairToken0 === WNATPartner.address
              ? NATAmount.sub(outputAmount)
              : WNATPartnerAmount.add(expectedSwapAmount)
          )
          .to.emit(WNATPair, 'Swap')
          .withArgs(
            router.address,
            WNATPairToken0 === WNATPartner.address ? expectedSwapAmount : 0,
            WNATPairToken0 === WNATPartner.address ? 0 : expectedSwapAmount,
            WNATPairToken0 === WNATPartner.address ? 0 : outputAmount,
            WNATPairToken0 === WNATPartner.address ? outputAmount : 0,
            router.address
          )
      })

      it('amounts', async () => {
        await WNATPartner.approve(routerEventEmitter.address, constants.MaxUint256)
        await expect(
          routerEventEmitter.swapTokensForExactNAT(
            router.address,
            outputAmount,
            constants.MaxUint256,
            [WNATPartner.address, WNAT.address],
            wallet.address,
            constants.MaxUint256
          )
        )
          .to.emit(routerEventEmitter, 'Amounts')
          .withArgs([expectedSwapAmount, outputAmount])
      })
    })

    describe('swapExactTokensForNAT', () => {
      const WNATPartnerAmount = expandTo18Decimals(5)
      const NATAmount = expandTo18Decimals(10)
      const swapAmount = expandTo18Decimals(1)
      const expectedOutputAmount = BigNumber.from('1662497915624478906')

      beforeEach(async () => {
        await WNATPartner.transfer(WNATPair.address, WNATPartnerAmount)
        await WNAT.deposit({ value: NATAmount })
        await WNAT.transfer(WNATPair.address, NATAmount)
        await WNATPair.mint(wallet.address)
      })

      it('happy path', async () => {
        await WNATPartner.approve(router.address, constants.MaxUint256)
        const WNATPairToken0 = await WNATPair.token0()
        await expect(
          router.swapExactTokensForNAT(
            swapAmount,
            0,
            [WNATPartner.address, WNAT.address],
            wallet.address,
            constants.MaxUint256
          )
        )
          .to.emit(WNATPartner, 'Transfer')
          .withArgs(wallet.address, WNATPair.address, swapAmount)
          .to.emit(WNAT, 'Transfer')
          .withArgs(WNATPair.address, router.address, expectedOutputAmount)
          .to.emit(WNATPair, 'Sync')
          .withArgs(
            WNATPairToken0 === WNATPartner.address
              ? WNATPartnerAmount.add(swapAmount)
              : NATAmount.sub(expectedOutputAmount),
            WNATPairToken0 === WNATPartner.address
              ? NATAmount.sub(expectedOutputAmount)
              : WNATPartnerAmount.add(swapAmount)
          )
          .to.emit(WNATPair, 'Swap')
          .withArgs(
            router.address,
            WNATPairToken0 === WNATPartner.address ? swapAmount : 0,
            WNATPairToken0 === WNATPartner.address ? 0 : swapAmount,
            WNATPairToken0 === WNATPartner.address ? 0 : expectedOutputAmount,
            WNATPairToken0 === WNATPartner.address ? expectedOutputAmount : 0,
            router.address
          )
      })

      it('amounts', async () => {
        await WNATPartner.approve(routerEventEmitter.address, constants.MaxUint256)
        await expect(
          routerEventEmitter.swapExactTokensForNAT(
            router.address,
            swapAmount,
            0,
            [WNATPartner.address, WNAT.address],
            wallet.address,
            constants.MaxUint256
          )
        )
          .to.emit(routerEventEmitter, 'Amounts')
          .withArgs([swapAmount, expectedOutputAmount])
      })
    })

    describe('swapNATForExactTokens', () => {
      const WNATPartnerAmount = expandTo18Decimals(10)
      const NATAmount = expandTo18Decimals(5)
      const expectedSwapAmount = BigNumber.from('557227237267357629')
      const outputAmount = expandTo18Decimals(1)

      beforeEach(async () => {
        await WNATPartner.transfer(WNATPair.address, WNATPartnerAmount)
        await WNAT.deposit({ value: NATAmount })
        await WNAT.transfer(WNATPair.address, NATAmount)
        await WNATPair.mint(wallet.address)
      })

      it('happy path', async () => {
        const WNATPairToken0 = await WNATPair.token0()
        await expect(
          router.swapNATForExactTokens(
            outputAmount,
            [WNAT.address, WNATPartner.address],
            wallet.address,
            constants.MaxUint256,
            {
              value: expectedSwapAmount,
            }
          )
        )
          .to.emit(WNAT, 'Deposit')
          .withArgs(WNATPair.address, expectedSwapAmount)
          .to.emit(WNATPartner, 'Transfer')
          .withArgs(WNATPair.address, wallet.address, outputAmount)
          .to.emit(WNATPair, 'Sync')
          .withArgs(
            WNATPairToken0 === WNATPartner.address
              ? WNATPartnerAmount.sub(outputAmount)
              : NATAmount.add(expectedSwapAmount),
            WNATPairToken0 === WNATPartner.address
              ? NATAmount.add(expectedSwapAmount)
              : WNATPartnerAmount.sub(outputAmount)
          )
          .to.emit(WNATPair, 'Swap')
          .withArgs(
            router.address,
            WNATPairToken0 === WNATPartner.address ? 0 : expectedSwapAmount,
            WNATPairToken0 === WNATPartner.address ? expectedSwapAmount : 0,
            WNATPairToken0 === WNATPartner.address ? outputAmount : 0,
            WNATPairToken0 === WNATPartner.address ? 0 : outputAmount,
            wallet.address
          )
      })

      it('amounts', async () => {
        await expect(
          routerEventEmitter.swapNATForExactTokens(
            router.address,
            outputAmount,
            [WNAT.address, WNATPartner.address],
            wallet.address,
            constants.MaxUint256,
            {
              value: expectedSwapAmount,
            }
          )
        )
          .to.emit(routerEventEmitter, 'Amounts')
          .withArgs([expectedSwapAmount, outputAmount])
      })
    })
  })
})
