import { waffle } from 'hardhat'
import { expect } from 'chai'
import { BigNumber } from 'ethers'

import { pairWNatFixture } from './shared/fixtures'
import { expandTo18Decimals, getRewardManagerAddress } from './shared/utilities'

import WNAT from '../../artifacts/contracts/core/test/WNAT.sol/WNAT.json'
import ERC20Test from '../../artifacts/contracts/core/test/ERC20Test.sol/ERC20Test.json'

import {
  BlazeSwapRewardManager,
  BlazeSwapRewardManager__factory,
  DistributionToDelegators,
  FlareContractRegistry,
  FtsoManager,
  FtsoRewardManager,
  IBlazeSwapManager,
  IERC20,
  IWNat,
} from '../../typechain-types'

const { createFixtureLoader, deployContract } = waffle

describe('BlazeSwapRewardManager', () => {
  const provider = waffle.provider
  const [wallet] = provider.getWallets()
  const loadFixture = createFixtureLoader([wallet], provider)

  let registry: FlareContractRegistry
  let manager: IBlazeSwapManager
  let ftsoManager: FtsoManager
  let ftsoRewardManager: FtsoRewardManager
  let distribution: DistributionToDelegators
  let wNat: IWNat
  let rewardManagerClonable: BlazeSwapRewardManager
  let rewardManager: BlazeSwapRewardManager
  beforeEach(async () => {
    const fixture = await loadFixture(pairWNatFixture)
    registry = fixture.registry
    manager = fixture.manager
    ftsoManager = fixture.ftsoManager
    ftsoRewardManager = fixture.ftsoRewardManager
    distribution = fixture.distribution
    wNat = fixture.wNat
    rewardManagerClonable = BlazeSwapRewardManager__factory.connect(fixture.manager.rewardManager(), wallet)
    const rewardManagerAddress = getRewardManagerAddress(fixture.pair.address)
    rewardManager = BlazeSwapRewardManager__factory.connect(rewardManagerAddress, wallet)
  })

  it('initialize:clonable', async () => {
    await expect(rewardManagerClonable.initialize(manager.address)).to.be.revertedWith('DelegatedCalls: standard call')
  })

  it('initialize:twice', async () => {
    await expect(rewardManager.initialize(manager.address)).to.be.revertedWith('BlazeSwapRewardManager: INITIALIZED')
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

    await ftsoManager.startRewardEpoch(1, (await provider.getBlock('latest')).number)
    await ftsoRewardManager.addRewards(rewardManager.address, 1, 10)
    await ftsoManager.startRewardEpoch(2, (await provider.getBlock('latest')).number)

    expect(await ftsoRewardManager.getEpochsWithUnclaimedRewards(rewardManager.address)).to.deep.eq([
      BigNumber.from('1'),
    ])

    const expectedRewards = expandTo18Decimals(10).div(1000) // 0.01

    await expect(rewardManager.claimFtsoRewards([1])).to.be.revertedWith('BlazeSwapRewardManager: FORBIDDEN')

    await manager.addRewardsFeeClaimer(wallet.address)

    await expect(() => rewardManager.claimFtsoRewards([1])).to.changeTokenBalance(wNat, rewardManager, expectedRewards)
  })

  it('claimAirdrop', async () => {
    await distribution.setSingleVotePowerBlockNumber(0, (await provider.getBlock('latest')).number)
    await distribution.addAirdrop(rewardManager.address, 0, 100, { value: 100 })

    await expect(rewardManager.claimAirdrop(0)).to.be.revertedWith('BlazeSwapRewardManager: FORBIDDEN')

    await manager.addRewardsFeeClaimer(wallet.address)

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

    const newWNat = await deployContract(wallet, WNAT)
    await registry.setContractAddress('WNat', newWNat.address, [])

    await rewardManager.replaceWNatIfNeeded()
    expect(await wNat.balanceOf(rewardManager.address)).to.be.eq(wNatAmount)

    await manager.setAllowWNatReplacement(true)

    await expect(() => rewardManager.replaceWNatIfNeeded()).to.changeTokenBalance(newWNat, rewardManager, wNatAmount)
  })

  it('withdrawERC20', async () => {
    const wNatAmount = expandTo18Decimals(10)
    await wNat.transfer(rewardManager.address, wNatAmount)

    const erc20 = (await deployContract(wallet, ERC20Test, [1000])) as IERC20
    await erc20.transfer(rewardManager.address, 500)

    await expect(rewardManager.withdrawERC20(wNat.address, 5, wallet.address)).to.be.revertedWith(
      'BlazeSwapRewardManager: FORBIDDEN'
    )

    await manager.addRewardsFeeClaimer(wallet.address)

    await expect(rewardManager.withdrawERC20(wNat.address, 5, wallet.address)).to.be.revertedWith(
      'BlazeSwapRewardManager: WNAT'
    )

    await expect(() => rewardManager.withdrawERC20(erc20.address, 500, wallet.address)).to.changeTokenBalance(
      erc20,
      wallet,
      500
    )
  })
})
