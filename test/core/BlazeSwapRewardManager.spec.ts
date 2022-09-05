import { waffle } from 'hardhat'
import { expect } from 'chai'
import { BigNumber } from 'ethers'

import { pairWNatFixture } from './shared/fixtures'
import { expandTo18Decimals, getRewardManagerAddress } from './shared/utilities'

import {
  BlazeSwapRewardManager,
  BlazeSwapRewardManager__factory,
  FtsoManager,
  FtsoRewardManager,
  IWNat,
} from '../../typechain-types'

const { createFixtureLoader } = waffle

describe('BlazeSwapRewardManager', () => {
  const provider = waffle.provider
  const [wallet] = provider.getWallets()
  const loadFixture = createFixtureLoader([wallet], provider)

  let ftsoManager: FtsoManager
  let ftsoRewardManager: FtsoRewardManager
  let wNat: IWNat
  let rewardManager: BlazeSwapRewardManager
  beforeEach(async () => {
    const fixture = await loadFixture(pairWNatFixture)
    ftsoManager = fixture.ftsoManager
    ftsoRewardManager = fixture.ftsoRewardManager
    wNat = fixture.wNat
    const rewardManagerAddress = getRewardManagerAddress(fixture.pair.address)
    rewardManager = BlazeSwapRewardManager__factory.connect(rewardManagerAddress, wallet)
  })

  it('changeProviders', async () => {
    await expect(
      rewardManager.changeProviders([
        '0x1000000000000000000000000000000000000000',
        '0x2000000000000000000000000000000000000000',
      ])
    ).to.be.revertedWith('ParentRelation: FORBIDDEN')
  })

  it('claimFtsoRewards', async () => {
    const wNatAmount = expandTo18Decimals(10)
    await wNat.transfer(rewardManager.address, wNatAmount)

    await ftsoManager.addRewardEpoch(1, (await provider.getBlock('latest')).number)
    await ftsoRewardManager.addRewards(rewardManager.address, 1, 10)
    await ftsoManager.addRewardEpoch(2, (await provider.getBlock('latest')).number)

    expect(await ftsoRewardManager.getEpochsWithUnclaimedRewards(rewardManager.address)).to.deep.eq([
      BigNumber.from('1'),
    ])

    const expectedRewards = expandTo18Decimals(10).div(1000) // 0.01

    await expect(() => rewardManager.claimFtsoRewards([1])).to.changeTokenBalance(wNat, rewardManager, expectedRewards)
  })
})
