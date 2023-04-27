import hre from 'hardhat'
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers'
import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { expect } from 'chai'
import { BigNumber, constants } from 'ethers'

import { pairWNatFixture } from './shared/fixtures'
import { expandTo18Decimals, getLatestBlockNumber, getRewardManagerAddress } from './shared/utilities'

import {
  BlazeSwapRewardManager,
  BlazeSwapRewardManager__factory,
  BlazeSwapRewardsPlugin,
  BlazeSwapRewardsPlugin__factory,
  DistributionToDelegators,
  FlareContractRegistry,
  FtsoManager,
  FtsoRewardManager,
  IERC20,
  IWNat,
} from '../../typechain-types'

import { deployContract } from '../shared/shared/utilities'

describe('BlazeSwapRewardManager', () => {
  let wallet: SignerWithAddress

  let registry: FlareContractRegistry
  let ftsoManager: FtsoManager
  let ftsoRewardManager: FtsoRewardManager
  let distribution: DistributionToDelegators
  let wNat: IWNat
  let rewardsPlugin: BlazeSwapRewardsPlugin
  let rewardManagerClonable: BlazeSwapRewardManager
  let rewardManager: BlazeSwapRewardManager
  beforeEach(async () => {
    [wallet] = await hre.ethers.getSigners()
    const fixture = await loadFixture(pairWNatFixture)
    registry = fixture.registry
    ftsoManager = fixture.ftsoManager
    ftsoRewardManager = fixture.ftsoRewardManager
    distribution = fixture.distribution
    wNat = fixture.wNat
    rewardsPlugin = BlazeSwapRewardsPlugin__factory.connect(await fixture.manager.rewardsPlugin(), wallet)
    rewardManagerClonable = BlazeSwapRewardManager__factory.connect(await rewardsPlugin.rewardManager(), wallet)
    const rewardManagerAddress = getRewardManagerAddress(fixture.pair.address)
    rewardManager = BlazeSwapRewardManager__factory.connect(rewardManagerAddress, wallet)
  })

  it('initialize:clonable', async () => {
    await expect(rewardManagerClonable.initialize(rewardsPlugin.address)).to.be.revertedWith(
      'DelegatedCalls: standard call'
    )
  })

  it('initialize:twice', async () => {
    await expect(rewardManager.initialize(rewardsPlugin.address)).to.be.revertedWith(
      'BlazeSwapRewardManager: INITIALIZED'
    )
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

    await ftsoManager.startRewardEpoch(1, await getLatestBlockNumber())
    await ftsoRewardManager.addRewards(rewardManager.address, 1, 10)
    await ftsoManager.startRewardEpoch(2, await getLatestBlockNumber())

    expect(await ftsoRewardManager.getEpochsWithUnclaimedRewards(rewardManager.address)).to.deep.eq([
      BigNumber.from('1'),
    ])

    const expectedRewards = expandTo18Decimals(10).div(1000) // 0.01

    await expect(rewardManager.claimFtsoRewards([1])).to.be.revertedWith('BlazeSwapRewardManager: FORBIDDEN')

    await rewardsPlugin.addRewardsFeeClaimer(wallet.address)

    await expect(() => rewardManager.claimFtsoRewards([1])).to.changeTokenBalance(wNat, rewardManager, expectedRewards)
  })

  async function replaceFtsoRewardManager(ftsoManager: FtsoManager) {
    const oldManager = await ftsoManager.rewardManager()
    const newManager = (await deployContract('FtsoRewardManager', [oldManager])) as FtsoRewardManager
    await registry.setContractAddress('FtsoRewardManager', newManager.address, [ftsoManager.address])
    return newManager
  }

  async function initializeFtsoRewardManager(ftsoManager: FtsoManager, ftsoRewardManager: FtsoRewardManager) {
    await registry.setContractAddress('WNat', registry.getContractAddressByName('WNat'), [ftsoRewardManager.address])
    await registry.setContractAddress('FtsoManager', ftsoManager.address, [ftsoRewardManager.address])
    await registry.setContractAddress('FtsoRewardManager', ftsoRewardManager.address, [ftsoManager.address])
    await ftsoRewardManager.initialize()
    await ftsoRewardManager.activate()
  }

  it('claimFtsoRewards:multiple', async () => {
    const wNatAmount = expandTo18Decimals(10)
    await wNat.transfer(rewardManager.address, wNatAmount)

    let curFtsoRewardManager = ftsoRewardManager

    // 1st epoch of 1st RM
    await ftsoManager.startRewardEpoch(1, await getLatestBlockNumber())
    await curFtsoRewardManager.addRewards(rewardManager.address, 1, 10, { value: wNatAmount })
    // 2nd epoch of deactivated 2nd RM
    await ftsoManager.startRewardEpoch(2, await getLatestBlockNumber())
    curFtsoRewardManager = await replaceFtsoRewardManager(ftsoManager)
    await initializeFtsoRewardManager(ftsoManager, curFtsoRewardManager)
    await curFtsoRewardManager.addRewards(rewardManager.address, 2, 20, { value: wNatAmount })
    await curFtsoRewardManager.deactivate()
    // 3rd epoch splitted between 3rd, 4th (deactivated), 5th RMs
    await ftsoManager.startRewardEpoch(3, await getLatestBlockNumber())
    curFtsoRewardManager = await replaceFtsoRewardManager(ftsoManager)
    await initializeFtsoRewardManager(ftsoManager, curFtsoRewardManager)
    await curFtsoRewardManager.addRewards(rewardManager.address, 3, 15, { value: wNatAmount })
    curFtsoRewardManager = await replaceFtsoRewardManager(ftsoManager)
    await initializeFtsoRewardManager(ftsoManager, curFtsoRewardManager)
    await curFtsoRewardManager.addRewards(rewardManager.address, 3, 15, { value: wNatAmount })
    await curFtsoRewardManager.deactivate()
    curFtsoRewardManager = await replaceFtsoRewardManager(ftsoManager)
    await initializeFtsoRewardManager(ftsoManager, curFtsoRewardManager)
    await curFtsoRewardManager.addRewards(rewardManager.address, 3, 15, { value: wNatAmount })
    // 4th epoch on 5th RM, 6th RM not activated yet
    await ftsoManager.startRewardEpoch(4, await getLatestBlockNumber())
    await curFtsoRewardManager.addRewards(rewardManager.address, 4, 40, { value: wNatAmount })
    curFtsoRewardManager = await replaceFtsoRewardManager(ftsoManager)
    // start epoch 6
    await ftsoManager.startRewardEpoch(5, await getLatestBlockNumber())

    const expectedRewards = expandTo18Decimals(10).div(1000).mul(8) // 0.08

    await rewardsPlugin.addRewardsFeeClaimer(wallet.address)

    await expect(() => rewardManager.claimFtsoRewards([4])).to.changeTokenBalance(wNat, rewardManager, expectedRewards)
  })

  it('claimAirdrop', async () => {
    await distribution.setSingleVotePowerBlockNumber(0, await getLatestBlockNumber())
    await distribution.addAirdrop(rewardManager.address, 0, 100, { value: 100 })

    await expect(rewardManager.claimAirdrop(0)).to.be.revertedWith('BlazeSwapRewardManager: FORBIDDEN')

    await rewardsPlugin.addRewardsFeeClaimer(wallet.address)

    await registry.setContractAddress('DistributionToDelegators', constants.AddressZero, [])

    await expect(() => rewardManager.claimAirdrop(0)).to.changeTokenBalance(wNat, rewardManager, BigNumber.from('0'))
    await expect(rewardManager.claimAirdrop(0)).not.to.be.reverted

    await registry.setContractAddress('DistributionToDelegators', distribution.address, [])

    const expectedAmount = BigNumber.from('100')

    expect(await distribution.getClaimableAmountOf(rewardManager.address, 0)).to.eq(expectedAmount)

    await expect(() => rewardManager.claimAirdrop(0)).to.changeTokenBalance(wNat, rewardManager, expectedAmount)
  })

  it('wrapRewards', async () => {
    const natAmount = expandTo18Decimals(10)
    await wallet.sendTransaction({ to: rewardManager.address, value: natAmount })

    await expect(() => rewardManager.wrapRewards()).to.changeTokenBalance(wNat, rewardManager, natAmount)
  })

  it('replaceWNatIfNeeded', async () => {
    const wNatAmount = expandTo18Decimals(10)
    await wNat.transfer(rewardManager.address, wNatAmount)

    const newWNat = await deployContract('WNAT')
    await registry.setContractAddress('WNat', newWNat.address, [])

    await rewardManager.replaceWNatIfNeeded()
    expect(await wNat.balanceOf(rewardManager.address)).to.be.eq(wNatAmount)

    await rewardsPlugin.setAllowWNatReplacement(true)

    await expect(() => rewardManager.replaceWNatIfNeeded()).to.changeTokenBalance(newWNat, rewardManager, wNatAmount)
  })

  it('withdrawERC20', async () => {
    const wNatAmount = expandTo18Decimals(10)
    await wNat.transfer(rewardManager.address, wNatAmount)

    const erc20 = (await deployContract('ERC20Test', [1000])) as IERC20
    await erc20.transfer(rewardManager.address, 500)

    await expect(rewardManager.withdrawERC20(wNat.address, 0, wallet.address)).to.be.revertedWith(
      'BlazeSwapRewardManager: FORBIDDEN'
    )

    await rewardsPlugin.addRewardsFeeClaimer(wallet.address)

    await expect(rewardManager.withdrawERC20(wNat.address, 5, wallet.address)).to.be.revertedWith(
      'BlazeSwapRewardManager: WNAT'
    )

    await expect(() => rewardManager.withdrawERC20(erc20.address, 500, wallet.address)).to.changeTokenBalance(
      erc20,
      wallet,
      500
    )
  })

  it('withdrawERC721', async () => {
    await expect(rewardManager.withdrawERC721(wallet.address, 0, wallet.address)).to.be.revertedWith(
      'BlazeSwapRewardManager: FORBIDDEN'
    )
  })

  it('withdrawERC1155', async () => {
    await expect(rewardManager.withdrawERC1155(wallet.address, 0, 0, wallet.address)).to.be.revertedWith(
      'BlazeSwapRewardManager: FORBIDDEN'
    )
  })
})
