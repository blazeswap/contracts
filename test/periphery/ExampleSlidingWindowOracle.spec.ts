// This test cannot work with hardhat, because it expects blocks mined at the same timestamp
// https://github.com/NomicFoundation/hardhat/pull/2561
import { waffle } from 'hardhat'
import { expect } from 'chai'
import { BigNumber } from 'ethers'

import { expandTo18Decimals, mineBlock, encodePrice } from '../core/shared/utilities'
import { routerFixture } from './shared/fixtures'

import ExampleSlidingWindowOracleArtifact from '../../artifacts/contracts/periphery/examples/ExampleSlidingWindowOracle.sol/ExampleSlidingWindowOracle.json'
import { ExampleSlidingWindowOracle, IBlazeSwapFactory, IBlazeSwapPair, IERC20, IWNat } from '../../typechain-types'

const { createFixtureLoader, deployContract } = waffle

const defaultToken0Amount = expandTo18Decimals(5)
const defaultToken1Amount = expandTo18Decimals(10)

describe.skip('ExampleSlidingWindowOracle', () => {
  const provider = waffle.provider
  const [wallet] = provider.getWallets()
  const loadFixture = createFixtureLoader([wallet], provider)

  let token0: IERC20
  let token1: IERC20
  let pair: IBlazeSwapPair
  let wnat: IWNat
  let factory: IBlazeSwapFactory

  async function addLiquidity(amount0: BigNumber = defaultToken0Amount, amount1: BigNumber = defaultToken1Amount) {
    if (!amount0.isZero()) await token0.transfer(pair.address, amount0)
    if (!amount1.isZero()) await token1.transfer(pair.address, amount1)
    await pair.sync()
  }

  const defaultWindowSize = 86400 // 24 hours
  const defaultGranularity = 24 // 1 hour each

  function observationIndexOf(
    timestamp: number,
    windowSize: number = defaultWindowSize,
    granularity: number = defaultGranularity
  ): number {
    const periodSize = Math.floor(windowSize / granularity)
    const epochPeriod = Math.floor(timestamp / periodSize)
    return epochPeriod % granularity
  }

  function deployOracle(windowSize: number, granularity: number) {
    return deployContract(wallet, ExampleSlidingWindowOracleArtifact, [
      factory.address,
      windowSize,
      granularity,
    ]) as Promise<ExampleSlidingWindowOracle>
  }

  beforeEach('deploy fixture', async function () {
    const fixture = await loadFixture(routerFixture)

    token0 = fixture.token0
    token1 = fixture.token1
    pair = fixture.pair
    wnat = fixture.wNat
    factory = fixture.factory
  })

  // 1/1/2020 @ 12:00 am UTC
  // cannot be 0 because that instructs ganache to set it to current timestamp
  // cannot be 86400 because then timestamp 0 is a valid historical observation
  const startTime = 2524608000

  // must come before adding liquidity to pairs for correct cumulative price computations
  // cannot use 0 because that resets to current timestamp
  beforeEach(`set start time to ${startTime}`, () => mineBlock(provider, startTime))

  it('requires granularity to be greater than 0', async () => {
    await expect(deployOracle(defaultWindowSize, 0)).to.be.revertedWith('SlidingWindowOracle: GRANULARITY')
  })

  it('requires windowSize to be evenly divisible by granularity', async () => {
    await expect(deployOracle(defaultWindowSize - 1, defaultGranularity)).to.be.revertedWith(
      'SlidingWindowOracle: WINDOW_NOT_EVENLY_DIVISIBLE'
    )
  })

  it('computes the periodSize correctly', async () => {
    const oracle = await deployOracle(defaultWindowSize, defaultGranularity)
    expect(await oracle.periodSize()).to.eq(3600)
    const oracleOther = await deployOracle(defaultWindowSize * 2, defaultGranularity / 2)
    expect(await oracleOther.periodSize()).to.eq(3600 * 4)
  })

  describe('#observationIndexOf', () => {
    it('works for examples', async () => {
      const oracle = await deployOracle(defaultWindowSize, defaultGranularity)
      expect(await oracle.observationIndexOf(0)).to.eq(0)
      expect(await oracle.observationIndexOf(3599)).to.eq(0)
      expect(await oracle.observationIndexOf(3600)).to.eq(1)
      expect(await oracle.observationIndexOf(4800)).to.eq(1)
      expect(await oracle.observationIndexOf(7199)).to.eq(1)
      expect(await oracle.observationIndexOf(7200)).to.eq(2)
      expect(await oracle.observationIndexOf(86399)).to.eq(23)
      expect(await oracle.observationIndexOf(86400)).to.eq(0)
      expect(await oracle.observationIndexOf(90000)).to.eq(1)
    })
    it('overflow safe', async () => {
      const oracle = await deployOracle(25500, 255) // 100 period size
      expect(await oracle.observationIndexOf(0)).to.eq(0)
      expect(await oracle.observationIndexOf(99)).to.eq(0)
      expect(await oracle.observationIndexOf(100)).to.eq(1)
      expect(await oracle.observationIndexOf(199)).to.eq(1)
      expect(await oracle.observationIndexOf(25499)).to.eq(254) // 255th element
      expect(await oracle.observationIndexOf(25500)).to.eq(0)
    })
    it('matches offline computation', async () => {
      const oracle = await deployOracle(defaultWindowSize, defaultGranularity)
      for (let timestamp of [0, 5000, 1000, 25000, 86399, 86400, 86401]) {
        expect(await oracle.observationIndexOf(timestamp)).to.eq(observationIndexOf(timestamp))
      }
    })
  })

  describe('#update', () => {
    let slidingWindowOracle: ExampleSlidingWindowOracle

    beforeEach(
      'deploy oracle',
      async () => (slidingWindowOracle = await deployOracle(defaultWindowSize, defaultGranularity))
    )

    beforeEach('add default liquidity', () => addLiquidity())

    it('succeeds', async () => {
      await slidingWindowOracle.update(token0.address, token1.address)
    })

    it('sets the appropriate epoch slot', async () => {
      const blockTimestamp = (await pair.getReserves())[2]
      expect(blockTimestamp).to.eq(startTime)
      await slidingWindowOracle.update(token0.address, token1.address)
      expect(await slidingWindowOracle.pairObservations(pair.address, observationIndexOf(blockTimestamp))).to.deep.eq([
        BigNumber.from(blockTimestamp),
        await pair.price0CumulativeLast(),
        await pair.price1CumulativeLast(),
      ])
    })

    it('gas for first update (allocates empty array)', async () => {
      const tx = await slidingWindowOracle.update(token0.address, token1.address)
      const receipt = await tx.wait()
      expect(receipt.gasUsed).to.eq('93751')
    })

    it('gas for second update in the same period (skips)', async () => {
      await slidingWindowOracle.update(token0.address, token1.address)
      const tx = await slidingWindowOracle.update(token0.address, token1.address)
      const receipt = await tx.wait()
      expect(receipt.gasUsed).to.eq('27882')
    })

    it('gas for second update different period (no allocate, no skip)', async () => {
      await slidingWindowOracle.update(token0.address, token1.address)
      await mineBlock(provider, startTime + 3600)
      const tx = await slidingWindowOracle.update(token0.address, token1.address)
      const receipt = await tx.wait()
      expect(receipt.gasUsed).to.eq('104440')
    })

    it('second update in one timeslot does not overwrite', async () => {
      await slidingWindowOracle.update(token0.address, token1.address)
      const before = await slidingWindowOracle.pairObservations(pair.address, observationIndexOf(0))
      // first hour still
      await mineBlock(provider, startTime + 1800)
      await slidingWindowOracle.update(token0.address, token1.address)
      const after = await slidingWindowOracle.pairObservations(pair.address, observationIndexOf(1800))
      expect(observationIndexOf(1800)).to.eq(observationIndexOf(0))
      expect(before).to.deep.eq(after)
    })

    it('fails for invalid pair', async () => {
      await expect(slidingWindowOracle.update(wnat.address, token1.address)).to.be.reverted
    })
  })

  describe('#consult', () => {
    let slidingWindowOracle: ExampleSlidingWindowOracle

    beforeEach(
      'deploy oracle',
      async () => (slidingWindowOracle = await deployOracle(defaultWindowSize, defaultGranularity))
    )

    // must come after setting time to 0 for correct cumulative price computations in the pair
    beforeEach('add default liquidity', () => addLiquidity())

    it('fails if previous bucket not set', async () => {
      await slidingWindowOracle.update(token0.address, token1.address)
      await expect(slidingWindowOracle.consult(token0.address, 0, token1.address)).to.be.revertedWith(
        'SlidingWindowOracle: MISSING_HISTORICAL_OBSERVATION'
      )
    })

    it('fails for invalid pair', async () => {
      await expect(slidingWindowOracle.consult(wnat.address, 0, token1.address)).to.be.reverted
    })

    describe('happy path', () => {
      let blockTimestamp: number
      let previousBlockTimestamp: number
      let previousCumulativePrices: any
      beforeEach('add some prices', async () => {
        previousBlockTimestamp = (await pair.getReserves())[2]
        previousCumulativePrices = [await pair.price0CumulativeLast(), await pair.price1CumulativeLast()]
        await slidingWindowOracle.update(token0.address, token1.address)
        blockTimestamp = previousBlockTimestamp + 23 * 3600
        await mineBlock(provider, blockTimestamp)
        await slidingWindowOracle.update(token0.address, token1.address)
      })

      it('has cumulative price in previous bucket', async () => {
        expect(
          await slidingWindowOracle.pairObservations(pair.address, observationIndexOf(previousBlockTimestamp))
        ).to.deep.eq([BigNumber.from(previousBlockTimestamp), previousCumulativePrices[0], previousCumulativePrices[1]])
      })

      it('has cumulative price in current bucket', async () => {
        const timeElapsed = blockTimestamp - previousBlockTimestamp
        const prices = encodePrice(defaultToken0Amount, defaultToken1Amount)
        expect(await slidingWindowOracle.pairObservations(pair.address, observationIndexOf(blockTimestamp))).to.deep.eq(
          [BigNumber.from(blockTimestamp), prices[0].mul(timeElapsed), prices[1].mul(timeElapsed)]
        )
      })

      it('provides the current ratio in consult token0', async () => {
        expect(await slidingWindowOracle.consult(token0.address, 100, token1.address)).to.eq(200)
      })

      it('provides the current ratio in consult token1', async () => {
        expect(await slidingWindowOracle.consult(token1.address, 100, token0.address)).to.eq(50)
      })
    })

    describe('price changes over period', () => {
      const hour = 3600
      beforeEach('add some prices', async () => {
        // starting price of 1:2, or token0 = 2token1, token1 = 0.5token0
        await slidingWindowOracle.update(token0.address, token1.address) // hour 0, 1:2
        // change the price at hour 3 to 1:1 and immediately update
        await mineBlock(provider, startTime + 3 * hour)
        await addLiquidity(defaultToken0Amount, BigNumber.from(0))
        await slidingWindowOracle.update(token0.address, token1.address)

        // change the ratios at hour 6:00 to 2:1, don't update right away
        await mineBlock(provider, startTime + 6 * hour)
        await token0.transfer(pair.address, defaultToken0Amount.mul(2))
        await pair.sync()

        // update at hour 9:00 (price has been 2:1 for 3 hours, invokes counterfactual)
        await mineBlock(provider, startTime + 9 * hour)
        await slidingWindowOracle.update(token0.address, token1.address)
        // move to hour 23:00 so we can check prices
        await mineBlock(provider, startTime + 23 * hour)
      })

      it('provides the correct ratio in consult token0', async () => {
        // at hour 23, price of token 0 spent 3 hours at 2, 3 hours at 1, 17 hours at 0.5 so price should
        // be less than 1
        expect(await slidingWindowOracle.consult(token0.address, 100, token1.address)).to.eq(76)
      })

      it('provides the correct ratio in consult token1', async () => {
        // price should be greater than 1
        expect(await slidingWindowOracle.consult(token1.address, 100, token0.address)).to.eq(167)
      })

      // price has been 2:1 all of 23 hours
      describe('hour 32', () => {
        beforeEach('set hour 32', () => mineBlock(provider, startTime + 32 * hour))
        it('provides the correct ratio in consult token0', async () => {
          // at hour 23, price of token 0 spent 3 hours at 2, 3 hours at 1, 17 hours at 0.5 so price should
          // be less than 1
          expect(await slidingWindowOracle.consult(token0.address, 100, token1.address)).to.eq(50)
        })

        it('provides the correct ratio in consult token1', async () => {
          // price should be greater than 1
          expect(await slidingWindowOracle.consult(token1.address, 100, token0.address)).to.eq(200)
        })
      })
    })
  })
})
