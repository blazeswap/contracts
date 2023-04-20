import { waffle } from 'hardhat'
import { expect } from 'chai'

import { pairWNatFixture } from './shared/fixtures'
import { expandTo18Decimals, getRewardManagerAddress } from './shared/utilities'

import WNAT from '../../artifacts/contracts/core/test/WNAT.sol/WNAT.json'
import ERC20Test from '../../artifacts/contracts/core/test/ERC20Test.sol/ERC20Test.json'

import {
  FlareContractRegistry,
  IBlazeSwapRewards,
  IBlazeSwapRewards__factory,
  IBlazeSwapPair,
  IWNat,
  IERC20,
} from '../../typechain-types'
import { IBlazeSwapRewardsPlugin } from '../../typechain-types/core/interfaces/IBlazeSwapRewardsPlugin'
import { IBlazeSwapRewardsPlugin__factory } from '../../typechain-types/factories/core/interfaces/IBlazeSwapRewardsPlugin__factory'

const { createFixtureLoader, deployContract } = waffle

describe('BlazeSwapRewards', () => {
  const provider = waffle.provider
  const [wallet, other1] = provider.getWallets()
  const loadFixture = createFixtureLoader([wallet], provider)

  let registry: FlareContractRegistry
  let wNat: IWNat
  let pair: IBlazeSwapPair
  let token0: IERC20
  let token1: IERC20
  let rewards: IBlazeSwapRewards
  let rewardsPlugin: IBlazeSwapRewardsPlugin
  let rewardManagerAddress: string
  beforeEach(async () => {
    const fixture = await loadFixture(pairWNatFixture)
    registry = fixture.registry
    wNat = fixture.wNat
    token0 = fixture.token0
    token1 = fixture.token1
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

  it('withdrawERC20', async () => {
    const irewards = IBlazeSwapRewards__factory.connect(pair.address, other1)

    const amount = expandTo18Decimals(1000)
    await token0.transfer(pair.address, amount)
    await token1.transfer(pair.address, amount)

    const erc20 = (await deployContract(wallet, ERC20Test, [amount])) as IERC20
    await erc20.transfer(pair.address, amount)

    await expect(irewards.withdrawERC20(token0.address, 0, wallet.address)).to.be.revertedWith('BlazeSwap: FORBIDDEN')

    await rewardsPlugin.addRewardsFeeClaimer(other1.address)

    await expect(irewards.withdrawERC20(token0.address, 0, wallet.address)).to.be.revertedWith('BlazeSwap: TOKEN')
    await expect(irewards.withdrawERC20(token1.address, 0, wallet.address)).to.be.revertedWith('BlazeSwap: TOKEN')
    await expect(irewards.withdrawERC20(pair.address, 0, wallet.address)).to.be.revertedWith('BlazeSwap: TOKEN')

    await expect(() => irewards.withdrawERC20(erc20.address, amount, wallet.address)).to.changeTokenBalance(
      erc20,
      wallet,
      amount
    )
  })

  it('withdrawERC721', async () => {
    const irewards = IBlazeSwapRewards__factory.connect(pair.address, other1)

    await expect(irewards.withdrawERC721(wallet.address, 0, wallet.address)).to.be.revertedWith('BlazeSwap: FORBIDDEN')
  })

  it('withdrawERC1155', async () => {
    const irewards = IBlazeSwapRewards__factory.connect(pair.address, other1)

    await expect(irewards.withdrawERC1155(wallet.address, 0, 0, wallet.address)).to.be.revertedWith(
      'BlazeSwap: FORBIDDEN'
    )
  })
})
