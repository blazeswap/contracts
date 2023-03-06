import { waffle } from 'hardhat'
import { expect } from 'chai'
import { BigNumber, constants, Wallet } from 'ethers'

import { pairWNatFixture } from './shared/fixtures'
import { expandTo18Decimals, getRewardManagerAddress, MINIMUM_LIQUIDITY } from './shared/utilities'

import BlazeSwapAirdrop from '../../artifacts/contracts/core/BlazeSwapAirdrop.sol/BlazeSwapAirdrop.json'
import DistributionToDelegatorsABI from '../../artifacts/contracts/core/test/DistributionToDelegators.sol/DistributionToDelegators.json'

import { Coder } from 'abi-coder'

import {
  IIBlazeSwapDelegation,
  IIBlazeSwapDelegation__factory,
  IBlazeSwapManager,
  IBlazeSwapPair,
  IBlazeSwapPlugin__factory,
  IERC20,
  IIBlazeSwapPluginImpl__factory,
  IWNat,
  IBlazeSwapExecutorManager__factory,
  DistributionToDelegators,
  IBlazeSwapAirdrop,
  IBlazeSwapAirdrop__factory,
  FlareContractRegistry,
} from '../../typechain-types'

const { createFixtureLoader, deployContract } = waffle

describe('BlazeSwapAirdrop', () => {
  const provider = waffle.provider
  const [wallet, other] = provider.getWallets()
  const loadFixture = createFixtureLoader([wallet], provider)

  let manager: IBlazeSwapManager
  let registry: FlareContractRegistry
  let distribution: DistributionToDelegators
  let wNat: IWNat
  let token0: IERC20
  let token1: IERC20
  let pair: IBlazeSwapPair
  let delegation: IIBlazeSwapDelegation
  let airdrop: IBlazeSwapAirdrop
  beforeEach(async () => {
    const fixture = await loadFixture(pairWNatFixture)
    manager = fixture.manager
    registry = fixture.registry
    distribution = fixture.distribution
    wNat = fixture.wNat
    token0 = fixture.token0
    token1 = fixture.token1
    pair = fixture.pair
    delegation = IIBlazeSwapDelegation__factory.connect(pair.address, other)
    airdrop = IBlazeSwapAirdrop__factory.connect(pair.address, wallet)
  })

  async function addLiquidity(minter: Wallet, tokenAmount: BigNumber, wNatAmount: BigNumber) {
    await token0.transfer(pair.address, wNat.address == token0.address ? wNatAmount : tokenAmount)
    await token1.transfer(pair.address, wNat.address == token1.address ? wNatAmount : tokenAmount)
    const minterPair = pair.connect(minter)
    await minterPair.mint(minter.address)
  }

  async function removeLiquidity(minter: Wallet, amount: BigNumber) {
    const minterPair = pair.connect(minter)
    await minterPair.transfer(pair.address, amount)
    await minterPair.burn(minter.address)
  }

  async function addWNat(wNatAmount: BigNumber) {
    await wNat.transfer(pair.address, wNatAmount)
    await pair.sync()
  }

  function applyFee(amount: BigNumber) {
    return amount.mul(99_50).div(100_00)
  }

  it('initialize:forbiddenDelegated', async () => {
    await expect(
      IIBlazeSwapPluginImpl__factory.connect(pair.address, wallet).initialize(constants.AddressZero)
    ).to.be.revertedWith('BlazeSwap: INVALID_FUNCTION')
  })

  it('initialize:forbiddenDirect', async () => {
    const plugin = IBlazeSwapPlugin__factory.connect(await manager.airdropPlugin(), wallet)
    const impl = await plugin.implementation()
    const directAirdrop = IIBlazeSwapPluginImpl__factory.connect(impl, wallet)
    await expect(directAirdrop.initialize(constants.AddressZero)).to.be.revertedWith('DelegatedCalls: standard call')
  })

  it('no switch to DistributionToDelegators', async () => {
    await addLiquidity(wallet, expandTo18Decimals(1), expandTo18Decimals(4))
    await distribution.setSingleVotePowerBlockNumber(0, [(await provider.getBlock('latest')).number])
    await distribution.addAirdrop(pair.address, 0, 100)

    let [months, amounts, totalAmounts] = await airdrop.monthsWithUndistributedAirdrop(constants.AddressZero)
    expect(months).to.deep.eq([])
    expect(amounts).to.deep.eq([])
    expect(totalAmounts).to.deep.eq([])

    await expect(airdrop.distributeAirdrop(0)).not.to.be.reverted
    ;[months, amounts] = await airdrop.monthsWithUnclaimedAirdrop(wallet.address)
    expect(months).to.deep.eq([])
    expect(amounts).to.deep.eq([])

    await expect(() => airdrop.claimAirdrops([0], wallet.address, true)).to.changeTokenBalance(wNat, wallet, 0)
  })

  describe('switch to DistributionToDelegators', () => {
    beforeEach(async () => {
      await registry.setContractAddress('DistributionToDelegators', distribution.address, [])
    })

    it('monthsWithUndistributedAirdrop', async () => {
      const b0 = (await provider.getBlock('latest')).number
      await addLiquidity(wallet, expandTo18Decimals(1), expandTo18Decimals(4))
      const b1 = (await provider.getBlock('latest')).number
      await addLiquidity(other, expandTo18Decimals(2), expandTo18Decimals(8))
      const b2 = (await provider.getBlock('latest')).number
      await distribution.setVotePowerBlockNumbers(0, [b0, b1, b2])
      await distribution.addAirdrop(pair.address, 0, 100, { value: 100 })
      await distribution.setSingleVotePowerBlockNumber(1, b2)
      await distribution.addAirdrop(pair.address, 1, 120, { value: 120 })

      let [months, amounts, totalAmounts] = await airdrop.monthsWithUndistributedAirdrop(other.address)
      expect(months).to.deep.eq([BigNumber.from('0'), BigNumber.from('1')])
      expect(amounts).to.deep.eq([BigNumber.from('50'), BigNumber.from('80')])
      expect(totalAmounts).to.deep.eq([BigNumber.from('100'), BigNumber.from('120')])

      await manager.setAirdropFeeBips(50)
      ;[months, amounts, totalAmounts] = await airdrop.monthsWithUndistributedAirdrop(other.address)
      expect(months).to.deep.eq([BigNumber.from('0'), BigNumber.from('1')])
      expect(amounts).to.deep.eq([applyFee(BigNumber.from('50')), applyFee(BigNumber.from('80'))])
      expect(totalAmounts).to.deep.eq([BigNumber.from('100'), BigNumber.from('120')])
    })

    it('monthsWithUndistributedAirdrop: different weights', async () => {
      const b0 = (await provider.getBlock('latest')).number
      await addLiquidity(wallet, expandTo18Decimals(1), expandTo18Decimals(4))
      const b1 = (await provider.getBlock('latest')).number
      await addWNat(expandTo18Decimals(1))
      await addLiquidity(other, expandTo18Decimals(2), expandTo18Decimals(10))
      const b2 = (await provider.getBlock('latest')).number
      await distribution.setVotePowerBlockNumbers(0, [b0, b1, b2])
      await distribution.addAirdrop(pair.address, 0, 100, { value: 100 })

      const [months, amounts, totalAmounts] = await airdrop.monthsWithUndistributedAirdrop(other.address)
      expect(months).to.deep.eq([BigNumber.from('0')])
      expect(amounts).to.deep.eq([BigNumber.from('52')])
      expect(totalAmounts).to.deep.eq([BigNumber.from('100')])
    })

    it('monthsWithUndistributedAirdrop: stopped / replaced distribution', async () => {
      await addLiquidity(wallet, expandTo18Decimals(1), expandTo18Decimals(4))
      await addLiquidity(other, expandTo18Decimals(1), expandTo18Decimals(4))
      const b0 = (await provider.getBlock('latest')).number
      await distribution.setSingleVotePowerBlockNumber(0, b0)
      await distribution.addAirdrop(pair.address, 0, 20, { value: 20 })
      const newDistribution = (await deployContract(wallet, DistributionToDelegatorsABI)) as DistributionToDelegators
      await distribution.stop()

      let [months, amounts, totalAmounts] = await airdrop.monthsWithUndistributedAirdrop(other.address)
      expect(months).to.deep.eq([])
      expect(amounts).to.deep.eq([])
      expect(totalAmounts).to.deep.eq([])

      await registry.setContractAddress('DistributionToDelegators', newDistribution.address, [])
      await newDistribution.setSingleVotePowerBlockNumber(0, b0)
      await newDistribution.addAirdrop(pair.address, 0, 100, { value: 100 })
      ;[months, amounts, totalAmounts] = await airdrop.monthsWithUndistributedAirdrop(other.address)
      expect(months).to.deep.eq([BigNumber.from('0')])
      expect(amounts).to.deep.eq([BigNumber.from('50')])
      expect(totalAmounts).to.deep.eq([BigNumber.from('100')])
    })

    it('airdrop lasts 36 months', async () => {
      await addLiquidity(wallet, expandTo18Decimals(1), expandTo18Decimals(4))

      await distribution.setSingleVotePowerBlockNumber(0, (await provider.getBlock('latest')).number)
      await distribution.addAirdrop(pair.address, 0, 100, { value: 100 })
      await distribution.setSingleVotePowerBlockNumber(35, (await provider.getBlock('latest')).number)
      await distribution.addAirdrop(pair.address, 35, 100, { value: 100 })
      await distribution.setSingleVotePowerBlockNumber(36, (await provider.getBlock('latest')).number)
      await distribution.addAirdrop(pair.address, 36, 100, { value: 100 })

      const [months, amounts, totalAmounts] = await airdrop.monthsWithUndistributedAirdrop(constants.AddressZero)
      expect(months).to.deep.eq([BigNumber.from('0'), BigNumber.from('35')])
      expect(amounts).to.deep.eq([BigNumber.from('0'), BigNumber.from('0')])
      expect(totalAmounts).to.deep.eq([BigNumber.from('100'), BigNumber.from('100')])
    })

    it('distributeAirdrop', async () => {
      const b0 = (await provider.getBlock('latest')).number

      const airdropAmount = BigNumber.from('50')
      await distribution.setSingleVotePowerBlockNumber(1, b0)
      await distribution.addAirdrop(pair.address, 1, airdropAmount, { value: airdropAmount })

      const rewardManagerAddress = getRewardManagerAddress(pair.address)

      await expect(airdrop.distributeAirdrop(0)).not.to.be.reverted

      await expect(airdrop.distributeAirdrop(1))
        .to.emit(airdrop, 'AirdropDistributed')
        .withArgs(BigNumber.from('1'), airdropAmount, wallet.address)

      expect(await wNat.balanceOf(rewardManagerAddress)).to.eq(airdropAmount)
    })

    it('distributeAirdrop:previous-months', async () => {
      const b0 = (await provider.getBlock('latest')).number

      const airdropAmount1 = BigNumber.from('50')
      await distribution.setSingleVotePowerBlockNumber(1, b0)
      await distribution.addAirdrop(pair.address, 1, airdropAmount1, { value: airdropAmount1 })

      const b1 = (await provider.getBlock('latest')).number

      const airdropAmount2 = BigNumber.from('100')
      await distribution.setSingleVotePowerBlockNumber(2, b1)
      await distribution.addAirdrop(pair.address, 2, airdropAmount2, { value: airdropAmount2 })

      const rewardManagerAddress = getRewardManagerAddress(pair.address)

      await expect(airdrop.distributeAirdrop(2))
        .to.emit(airdrop, 'AirdropDistributed')
        .withArgs(BigNumber.from('1'), airdropAmount1, wallet.address)
        .to.emit(airdrop, 'AirdropDistributed')
        .withArgs(BigNumber.from('2'), airdropAmount2, wallet.address)

      expect(await wNat.balanceOf(rewardManagerAddress)).to.eq(airdropAmount1.add(airdropAmount2))

      const [months, amounts, totalAmounts] = await airdrop.monthsWithUndistributedAirdrop(constants.AddressZero)
      expect(months).to.deep.eq([])
      expect(amounts).to.deep.eq([])
      expect(totalAmounts).to.deep.eq([])
    })

    it('monthsWithUnclaimedAirdrop', async () => {
      await addLiquidity(wallet, expandTo18Decimals(1), expandTo18Decimals(4))
      await addLiquidity(other, expandTo18Decimals(1), expandTo18Decimals(4))
      await distribution.setSingleVotePowerBlockNumber(0, (await provider.getBlock('latest')).number)
      await distribution.addAirdrop(pair.address, 0, 100, { value: 100 })
      await addLiquidity(other, expandTo18Decimals(1), expandTo18Decimals(4))
      await distribution.setSingleVotePowerBlockNumber(1, (await provider.getBlock('latest')).number)
      await distribution.addAirdrop(pair.address, 1, 240, { value: 240 })

      await airdrop.distributeAirdrop(0)
      await airdrop.distributeAirdrop(1)

      const { months, amounts } = await airdrop.monthsWithUnclaimedAirdrop(other.address)
      expect(months).to.deep.eq([BigNumber.from('0'), BigNumber.from('1')])
      expect(amounts).to.deep.eq([BigNumber.from('50'), BigNumber.from('160')])
    })

    it('monthsWithUnclaimedAirdrop: different weights', async () => {
      const b0 = (await provider.getBlock('latest')).number
      await addLiquidity(wallet, expandTo18Decimals(1), expandTo18Decimals(4))
      await addLiquidity(other, expandTo18Decimals(1), expandTo18Decimals(4))
      const b1 = (await provider.getBlock('latest')).number
      await addWNat(expandTo18Decimals(2))
      await addLiquidity(other, expandTo18Decimals(1), expandTo18Decimals(5))
      const b2 = (await provider.getBlock('latest')).number
      await distribution.setVotePowerBlockNumbers(0, [b0, b1, b2])
      await distribution.addAirdrop(pair.address, 0, 100, { value: 100 })

      await airdrop.distributeAirdrop(0)

      const { months, amounts } = await airdrop.monthsWithUnclaimedAirdrop(other.address)
      expect(months).to.deep.eq([BigNumber.from('0')])
      expect(amounts).to.deep.eq([BigNumber.from('60')])
    })

    it('claimAirdrops:native', async () => {
      await addLiquidity(other, expandTo18Decimals(1), expandTo18Decimals(1))
      await addLiquidity(wallet, expandTo18Decimals(1), expandTo18Decimals(1))

      await distribution.setSingleVotePowerBlockNumber(1, (await provider.getBlock('latest')).number)
      await distribution.addAirdrop(pair.address, 1, 100, { value: 100 })

      await airdrop.distributeAirdrop(1)

      const expectedWalletAirdrop = BigNumber.from('50')
      await expect(() => airdrop.claimAirdrops([1], wallet.address, false)).to.changeEtherBalance(
        wallet,
        expectedWalletAirdrop
      )

      expect(await airdrop.claimedAirdrops(wallet.address, 1)).to.eq(expectedWalletAirdrop)
    })

    it('claimAirdrops:wrapped', async () => {
      await addLiquidity(other, expandTo18Decimals(1), expandTo18Decimals(1))
      await addLiquidity(wallet, expandTo18Decimals(1), expandTo18Decimals(1))

      await distribution.setSingleVotePowerBlockNumber(1, (await provider.getBlock('latest')).number)
      await distribution.addAirdrop(pair.address, 1, 100, { value: 100 })

      await airdrop.distributeAirdrop(1)

      const expectedWalletAirdrop = BigNumber.from('50')
      await expect(() => airdrop.claimAirdrops([1], wallet.address, true)).to.changeTokenBalance(
        wNat,
        wallet,
        expectedWalletAirdrop
      )

      expect(await airdrop.claimedAirdrops(wallet.address, 1)).to.eq(expectedWalletAirdrop)
    })

    it('claimAirdrops:nativeTo', async () => {
      await addLiquidity(other, expandTo18Decimals(1), expandTo18Decimals(1))
      await addLiquidity(wallet, expandTo18Decimals(1), expandTo18Decimals(1))

      await distribution.setSingleVotePowerBlockNumber(1, (await provider.getBlock('latest')).number)
      await distribution.addAirdrop(pair.address, 1, 100, { value: 100 })

      await airdrop.distributeAirdrop(1)

      const expectedWalletAirdrop = BigNumber.from('50')
      await expect(() => airdrop.claimAirdrops([1], other.address, false)).to.changeEtherBalance(
        other,
        expectedWalletAirdrop
      )

      expect(await airdrop.claimedAirdrops(wallet.address, 1)).to.eq(expectedWalletAirdrop)
    })

    it('claimAirdrops:wrappedTo', async () => {
      await addLiquidity(other, expandTo18Decimals(1), expandTo18Decimals(1))
      await addLiquidity(wallet, expandTo18Decimals(1), expandTo18Decimals(1))

      await distribution.setSingleVotePowerBlockNumber(1, (await provider.getBlock('latest')).number)
      await distribution.addAirdrop(pair.address, 1, 100, { value: 100 })

      await airdrop.distributeAirdrop(1)

      const expectedWalletAirdrop = BigNumber.from('50')
      await expect(() => airdrop.claimAirdrops([1], other.address, true)).to.changeTokenBalance(
        wNat,
        other,
        expectedWalletAirdrop
      )

      expect(await airdrop.claimedAirdrops(wallet.address, 1)).to.eq(expectedWalletAirdrop)
    })

    it('claimAirdrops:shares', async () => {
      await addLiquidity(wallet, expandTo18Decimals(1), expandTo18Decimals(1))
      await addLiquidity(other, expandTo18Decimals(3), expandTo18Decimals(3))

      await distribution.setSingleVotePowerBlockNumber(1, (await provider.getBlock('latest')).number)
      await distribution.addAirdrop(pair.address, 1, 100, { value: 100 })

      await removeLiquidity(wallet, expandTo18Decimals(1).sub(MINIMUM_LIQUIDITY))

      await distribution.setSingleVotePowerBlockNumber(2, (await provider.getBlock('latest')).number)
      await distribution.addAirdrop(pair.address, 2, 100, { value: 100 })

      await airdrop.distributeAirdrop(1)
      await airdrop.distributeAirdrop(2)

      const expectedWalletRewards1 = BigNumber.from('24')
      const expectedOtherRewards1 = BigNumber.from('75')

      const expectedOtherRewards2 = BigNumber.from('99')
      await expect(airdrop.connect(wallet).claimAirdrops([1], wallet.address, true))
        .to.emit(airdrop, 'AirdropClaimed')
        .withArgs(wallet.address, wallet.address, BigNumber.from('1'), expectedWalletRewards1, wallet.address)
      await expect(airdrop.connect(other).claimAirdrops([1, 2], other.address, true))
        .to.emit(airdrop, 'AirdropClaimed')
        .withArgs(other.address, other.address, BigNumber.from('1'), expectedOtherRewards1, other.address)
        .to.emit(airdrop, 'AirdropClaimed')
        .withArgs(other.address, other.address, BigNumber.from('2'), expectedOtherRewards2, other.address)
      expect(await airdrop.claimedAirdrops(wallet.address, 1)).to.eq(expectedWalletRewards1)
      expect(await airdrop.claimedAirdrops(wallet.address, 2)).to.eq(BigNumber.from(0))
      expect(await airdrop.claimedAirdrops(other.address, 1)).to.eq(expectedOtherRewards1)
      expect(await airdrop.claimedAirdrops(other.address, 2)).to.eq(expectedOtherRewards2)
    })

    it('claimAirdropsByExecutor:None', async () => {
      await addLiquidity(other, expandTo18Decimals(1), expandTo18Decimals(1))
      await addLiquidity(wallet, expandTo18Decimals(1), expandTo18Decimals(1))

      await distribution.setSingleVotePowerBlockNumber(1, (await provider.getBlock('latest')).number)
      await distribution.addAirdrop(pair.address, 1, 100, { value: 100 })

      await airdrop.distributeAirdrop(1)

      const expectedWalletRewards = BigNumber.from('50')

      await expect(
        airdrop.connect(other).claimAirdropsByExecutor([1], wallet.address, wallet.address, false)
      ).to.be.revertedWith('BlazeSwap: FORBIDDEN')

      await expect(() =>
        airdrop.claimAirdropsByExecutor([1], wallet.address, other.address, false)
      ).to.changeEtherBalance(other, expectedWalletRewards)

      expect(await airdrop.claimedAirdrops(wallet.address, 1)).to.eq(expectedWalletRewards)
    })

    it('claimAirdropsByExecutor:OwnerOnly', async () => {
      await addLiquidity(other, expandTo18Decimals(1), expandTo18Decimals(1))
      await addLiquidity(wallet, expandTo18Decimals(1), expandTo18Decimals(1))

      await distribution.setSingleVotePowerBlockNumber(1, (await provider.getBlock('latest')).number)
      await distribution.addAirdrop(pair.address, 1, 100, { value: 100 })

      await airdrop.distributeAirdrop(1)

      const expectedWalletRewards = BigNumber.from('50')

      const executorManager = IBlazeSwapExecutorManager__factory.connect(await manager.executorManager(), wallet)
      await executorManager.setExecutorPermission(other.address, 1) // OwnerOnly
      await expect(
        airdrop.connect(other).claimAirdropsByExecutor([1], wallet.address, other.address, false)
      ).to.be.revertedWith('BlazeSwap: FORBIDDEN')

      await expect(() =>
        airdrop.claimAirdropsByExecutor([1], wallet.address, wallet.address, false)
      ).to.changeEtherBalance(wallet, expectedWalletRewards)

      expect(await airdrop.claimedAirdrops(wallet.address, 1)).to.eq(expectedWalletRewards)
    })

    it('claimAirdropsByExecutor:AnyAddress', async () => {
      await addLiquidity(other, expandTo18Decimals(1), expandTo18Decimals(1))
      await addLiquidity(wallet, expandTo18Decimals(1), expandTo18Decimals(1))

      await distribution.setSingleVotePowerBlockNumber(1, (await provider.getBlock('latest')).number)
      await distribution.addAirdrop(pair.address, 1, 100, { value: 100 })

      await airdrop.distributeAirdrop(1)

      const expectedWalletRewards = BigNumber.from('50')

      const executorManager = IBlazeSwapExecutorManager__factory.connect(await manager.executorManager(), wallet)
      await executorManager.setExecutorPermission(other.address, 2) // AnyAddress

      await expect(() =>
        airdrop.claimAirdropsByExecutor([1], wallet.address, other.address, false)
      ).to.changeEtherBalance(other, expectedWalletRewards)

      expect(await airdrop.claimedAirdrops(wallet.address, 1)).to.eq(expectedWalletRewards)
    })

    it('claimAirdrops:expired', async () => {
      await addLiquidity(wallet, expandTo18Decimals(1), expandTo18Decimals(4))

      await distribution.setSingleVotePowerBlockNumber(0, (await provider.getBlock('latest')).number)
      await distribution.addAirdrop(pair.address, 0, 100, { value: 100 })
      await airdrop.distributeAirdrop(0)

      await distribution.setSingleVotePowerBlockNumber(1, (await provider.getBlock('latest')).number)
      await distribution.addAirdrop(pair.address, 1, 100, { value: 100 })
      await airdrop.distributeAirdrop(1)

      await distribution.setMonthToExpireNext(1)

      const { months } = await airdrop.monthsWithUnclaimedAirdrop(wallet.address)
      expect(months).to.deep.eq([BigNumber.from('1')])

      await airdrop.claimAirdrops([0, 1], wallet.address, true)
      expect(await airdrop.claimedAirdrops(wallet.address, 0)).to.eq(BigNumber.from(0))
      expect(await airdrop.claimedAirdrops(wallet.address, 1)).not.to.eq(BigNumber.from(0))
    })

    it('airdropFeeBips', async () => {
      await manager.setRewardsFeeTo(other.address)
      await manager.setAirdropFeeBips(50)

      const totalAirdrop = BigNumber.from('1000')

      await distribution.setSingleVotePowerBlockNumber(0, (await provider.getBlock('latest')).number)
      await distribution.addAirdrop(pair.address, 0, totalAirdrop, { value: totalAirdrop })

      const expectedDistributedAirdrop = applyFee(totalAirdrop)

      const rewardManagerAddress = getRewardManagerAddress(pair.address)

      await expect(airdrop.distributeAirdrop(0))
        .to.emit(airdrop, 'AirdropDistributed')
        .withArgs(BigNumber.from('0'), expectedDistributedAirdrop, wallet.address)

      expect(await wNat.balanceOf(rewardManagerAddress)).to.eq(totalAirdrop)
    })

    it('withdrawRewardFees', async () => {
      await manager.setRewardsFeeTo(other.address)
      await manager.setAirdropFeeBips(50)

      const totalAirdrop = BigNumber.from('1000')

      await distribution.setSingleVotePowerBlockNumber(0, (await provider.getBlock('latest')).number)
      await distribution.addAirdrop(pair.address, 0, totalAirdrop, { value: totalAirdrop })

      const expectedDistributedAirdrop = applyFee(totalAirdrop)
      const expectedAirdropFees = totalAirdrop.sub(expectedDistributedAirdrop)

      await airdrop.distributeAirdrop(0)

      await expect(() => delegation.withdrawRewardFees(true)).to.changeTokenBalance(wNat, other, expectedAirdropFees)

      const rewardManagerAddress = getRewardManagerAddress(pair.address)
      expect(await wNat.balanceOf(rewardManagerAddress)).to.eq(expectedDistributedAirdrop)
    })

    it('claimAirdrops:afterFee', async () => {
      await manager.setRewardsFeeTo(other.address)
      await manager.setAirdropFeeBips(50)

      await addLiquidity(wallet, expandTo18Decimals(1), expandTo18Decimals(1))

      await distribution.setSingleVotePowerBlockNumber(0, (await provider.getBlock('latest')).number)
      await distribution.addAirdrop(pair.address, 0, 1000, { value: 1000 })

      await airdrop.distributeAirdrop(0)

      const { months, amounts } = await airdrop.monthsWithUnclaimedAirdrop(wallet.address)

      await delegation.withdrawRewardFees(true)

      await expect(() => airdrop.claimAirdrops(months, wallet.address, true)).to.changeTokenBalance(
        wNat,
        wallet,
        amounts[0]
      )

      await distribution.setMonthToExpireNext(1)

      const rewardManagerAddress = getRewardManagerAddress(pair.address)

      expect(await wNat.balanceOf(rewardManagerAddress)).to.gt(BigNumber.from('0'))

      await delegation.withdrawRewardFees(true)

      expect(await wNat.balanceOf(rewardManagerAddress)).to.eq(BigNumber.from('0'))
    })

    it('multicall:distributeAndClaim', async () => {
      await addLiquidity(wallet, expandTo18Decimals(1), expandTo18Decimals(1))

      await distribution.setSingleVotePowerBlockNumber(0, (await provider.getBlock('latest')).number)
      await distribution.addAirdrop(pair.address, 0, 100, { value: 100 })

      const [months, amounts, totalAmounts] = await airdrop.monthsWithUndistributedAirdrop(wallet.address)
      expect(months.length).to.eq(1)
      expect(amounts[0]).to.gt(BigNumber.from('0'))
      expect(totalAmounts[0]).to.gt(BigNumber.from('0'))

      const untilMonth = months[0]
      const to = wallet.address
      const wrapped = true

      const coder = new Coder(BlazeSwapAirdrop.abi)
      await expect(
        pair.multicall([
          coder.encodeFunction('distributeAirdrop', { untilMonth }),
          coder.encodeFunction('claimAirdrops', { months, to, wrapped }),
        ])
      ).not.to.be.reverted

      expect(await airdrop.claimedAirdrops(wallet.address, months[0])).to.eq(amounts[0])
    })
  })
})
