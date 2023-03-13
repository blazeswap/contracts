import { waffle } from 'hardhat'
import { expect } from 'chai'

import { pairWNatFixture } from './shared/fixtures'
import { expandTo18Decimals, getRewardManagerAddress } from './shared/utilities'

import WNAT from '../../artifacts/contracts/core/test/WNAT.sol/WNAT.json'

import {
  FlareContractRegistry,
  IBlazeSwapRewards,
  IBlazeSwapRewards__factory,
  IBlazeSwapPair,
  IWNat,
} from '../../typechain-types'
import { IBlazeSwapRewardsPlugin } from '../../typechain-types/core/interfaces/IBlazeSwapRewardsPlugin'
import { IBlazeSwapRewardsPlugin__factory } from '../../typechain-types/factories/core/interfaces/IBlazeSwapRewardsPlugin__factory'

const { createFixtureLoader, deployContract } = waffle

describe('BlazeSwapRewards', () => {
  const provider = waffle.provider
  const [wallet, other1, other2] = provider.getWallets()
  const loadFixture = createFixtureLoader([wallet], provider)

  let registry: FlareContractRegistry
  let wNat: IWNat
  let pair: IBlazeSwapPair
  let rewards: IBlazeSwapRewards
  let rewardsPlugin: IBlazeSwapRewardsPlugin
  let rewardManagerAddress: string
  beforeEach(async () => {
    const fixture = await loadFixture(pairWNatFixture)
    registry = fixture.registry
    wNat = fixture.wNat
    pair = fixture.pair
    rewards = IBlazeSwapRewards__factory.connect(pair.address, wallet)
    rewardsPlugin = IBlazeSwapRewardsPlugin__factory.connect(await fixture.manager.rewardsPlugin(), wallet)
    rewardManagerAddress = getRewardManagerAddress(pair.address)
  })

  it('withdrawRewardFees', async () => {
    const irewards = IBlazeSwapRewards__factory.connect(pair.address, other1)

    await expect(irewards.withdrawRewardFees(true)).to.be.revertedWith('BlazeSwap: FORBIDDEN')
    await rewardsPlugin.addRewardsFeeClaimer(other1.address)

    const rewardAmount = expandTo18Decimals(2)

    expect(await irewards.callStatic.withdrawRewardFees(true)).to.be.eq(0)
    await expect(irewards.withdrawRewardFees(true)).not.to.be.reverted

    await wNat.transfer(rewardManagerAddress, rewardAmount)

    await expect(irewards.withdrawRewardFees(true)).to.be.revertedWith('BlazeSwap: ZERO_ADDRESS')

    await rewardsPlugin.setRewardsFeeTo(other1.address)

    expect(await irewards.callStatic.withdrawRewardFees(true)).to.be.eq(rewardAmount)
    await expect(() => irewards.withdrawRewardFees(true)).to.changeTokenBalance(wNat, other1, rewardAmount)

    await wNat.transfer(rewardManagerAddress, rewardAmount)

    expect(await irewards.callStatic.withdrawRewardFees(false)).to.be.eq(rewardAmount)
    await expect(() => irewards.withdrawRewardFees(false)).to.changeEtherBalance(other1, rewardAmount)
  })

  it('withdrawRewardFees: get oldWNat if newWNat is not allowed', async () => {
    const irewards = IBlazeSwapRewards__factory.connect(pair.address, other1)

    await rewardsPlugin.addRewardsFeeClaimer(other1.address)

    const rewardAmount = expandTo18Decimals(2)

    await wNat.transfer(rewardManagerAddress, rewardAmount)

    await rewardsPlugin.setRewardsFeeTo(other1.address)

    const newWNat = await deployContract(wallet, WNAT)
    await registry.setContractAddress('WNat', newWNat.address, [])

    expect(await irewards.callStatic.withdrawRewardFees(true)).to.be.eq(rewardAmount)
    await expect(() => irewards.withdrawRewardFees(true)).to.changeTokenBalance(wNat, other1, rewardAmount)
  })

  it('withdrawRewardFees: get newWNat if allowed', async () => {
    const irewards = IBlazeSwapRewards__factory.connect(pair.address, other1)

    await rewardsPlugin.addRewardsFeeClaimer(other1.address)

    const rewardAmount = expandTo18Decimals(2)

    await wNat.transfer(rewardManagerAddress, rewardAmount)

    await rewardsPlugin.setRewardsFeeTo(other1.address)
    await rewardsPlugin.setAllowWNatReplacement(true)

    const newWNat = await deployContract(wallet, WNAT)
    await registry.setContractAddress('WNat', newWNat.address, [])

    expect(await irewards.callStatic.withdrawRewardFees(true)).to.be.eq(rewardAmount)
    await expect(() => irewards.withdrawRewardFees(true)).to.changeTokenBalance(newWNat, other1, rewardAmount)
  })
})
