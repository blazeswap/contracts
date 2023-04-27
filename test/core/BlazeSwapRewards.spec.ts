import hre from 'hardhat'
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers'
import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { expect } from 'chai'

import { pairWNatFixture } from './shared/fixtures'
import { expandTo18Decimals, getRewardManagerAddress } from './shared/utilities'

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

import { deployContract } from '../shared/shared/utilities'

describe('BlazeSwapRewards', () => {
  let wallet: SignerWithAddress
  let other: SignerWithAddress

  let registry: FlareContractRegistry
  let wNat: IWNat
  let pair: IBlazeSwapPair
  let token0: IERC20
  let token1: IERC20
  let rewards: IBlazeSwapRewards
  let rewardsPlugin: IBlazeSwapRewardsPlugin
  let rewardManagerAddress: string
  beforeEach(async () => {
    [wallet, other] = await hre.ethers.getSigners()
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
    const irewards = IBlazeSwapRewards__factory.connect(pair.address, other)

    await expect(irewards.withdrawRewardFees(true)).to.be.revertedWith('BlazeSwap: FORBIDDEN')
    await rewardsPlugin.addRewardsFeeClaimer(other.address)

    const rewardAmount = expandTo18Decimals(2)

    expect(await irewards.callStatic.withdrawRewardFees(true)).to.be.eq(0)
    await expect(irewards.withdrawRewardFees(true)).not.to.be.reverted

    await wNat.transfer(rewardManagerAddress, rewardAmount)

    await expect(irewards.withdrawRewardFees(true)).to.be.revertedWith('BlazeSwap: ZERO_ADDRESS')

    await rewardsPlugin.setRewardsFeeTo(other.address)

    expect(await irewards.callStatic.withdrawRewardFees(true)).to.be.eq(rewardAmount)
    await expect(() => irewards.withdrawRewardFees(true)).to.changeTokenBalance(wNat, other, rewardAmount)

    await wNat.transfer(rewardManagerAddress, rewardAmount)

    expect(await irewards.callStatic.withdrawRewardFees(false)).to.be.eq(rewardAmount)
    await expect(() => irewards.withdrawRewardFees(false)).to.changeEtherBalance(other, rewardAmount)
  })

  it('withdrawRewardFees: get oldWNat if newWNat is not allowed', async () => {
    const irewards = IBlazeSwapRewards__factory.connect(pair.address, other)

    await rewardsPlugin.addRewardsFeeClaimer(other.address)

    const rewardAmount = expandTo18Decimals(2)

    await wNat.transfer(rewardManagerAddress, rewardAmount)

    await rewardsPlugin.setRewardsFeeTo(other.address)

    const newWNat = await deployContract('WNAT')
    await registry.setContractAddress('WNat', newWNat.address, [])

    expect(await irewards.callStatic.withdrawRewardFees(true)).to.be.eq(rewardAmount)
    await expect(() => irewards.withdrawRewardFees(true)).to.changeTokenBalance(wNat, other, rewardAmount)
  })

  it('withdrawRewardFees: get newWNat if allowed', async () => {
    const irewards = IBlazeSwapRewards__factory.connect(pair.address, other)

    await rewardsPlugin.addRewardsFeeClaimer(other.address)

    const rewardAmount = expandTo18Decimals(2)

    await wNat.transfer(rewardManagerAddress, rewardAmount)

    await rewardsPlugin.setRewardsFeeTo(other.address)
    await rewardsPlugin.setAllowWNatReplacement(true)

    const newWNat = await deployContract('WNAT')
    await registry.setContractAddress('WNat', newWNat.address, [])

    expect(await irewards.callStatic.withdrawRewardFees(true)).to.be.eq(rewardAmount)
    await expect(() => irewards.withdrawRewardFees(true)).to.changeTokenBalance(newWNat, other, rewardAmount)
  })

  it('withdrawERC20', async () => {
    const irewards = IBlazeSwapRewards__factory.connect(pair.address, other)

    const amount = expandTo18Decimals(1000)
    await token0.transfer(pair.address, amount)
    await token1.transfer(pair.address, amount)

    const erc20 = (await deployContract('ERC20Test', [amount])) as IERC20
    await erc20.transfer(pair.address, amount)

    await expect(irewards.withdrawERC20(token0.address, 0, wallet.address)).to.be.revertedWith('BlazeSwap: FORBIDDEN')

    await rewardsPlugin.addRewardsFeeClaimer(other.address)

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
    const irewards = IBlazeSwapRewards__factory.connect(pair.address, other)

    await expect(irewards.withdrawERC721(wallet.address, 0, wallet.address)).to.be.revertedWith('BlazeSwap: FORBIDDEN')
  })

  it('withdrawERC1155', async () => {
    const irewards = IBlazeSwapRewards__factory.connect(pair.address, other)

    await expect(irewards.withdrawERC1155(wallet.address, 0, 0, wallet.address)).to.be.revertedWith(
      'BlazeSwap: FORBIDDEN'
    )
  })
})
