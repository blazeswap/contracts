import hre from 'hardhat'
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers'
import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { expect } from 'chai'
import { BigNumber, constants } from 'ethers'

import { flareFixture } from './shared/fixtures'

import {
  DistributionToDelegators,
  FlareContractRegistry,
  FlareLibraryTest,
  FtsoManager,
  FtsoManager__factory,
  FtsoRewardManager,
  FtsoRewardManager__factory,
} from '../../typechain-types'

import { deployContract } from '../shared/shared/utilities'

describe('FlareLibrary', () => {
  let wallet: SignerWithAddress
  let registry: FlareContractRegistry
  let distribution: DistributionToDelegators
  let flareLibrary: FlareLibraryTest
  beforeEach(async () => {
    [wallet] = await hre.ethers.getSigners()
    const fixture = await loadFixture(flareFixture)
    registry = fixture.registry
    distribution = fixture.distribution
    flareLibrary = (await deployContract('FlareLibraryTest')) as FlareLibraryTest
  })

  it('getFtsoManager, getFtsoRewardManager, getWNat, getFlareAssetRegistry, getDistribution', async () => {
    expect(await flareLibrary.getFtsoManager()).not.to.eq(constants.AddressZero)
    expect(await flareLibrary.getFtsoRewardManager()).not.to.eq(constants.AddressZero)
    expect(await flareLibrary.getWNat()).not.to.eq(constants.AddressZero)
    expect(await flareLibrary.getFlareAssetRegistry()).not.to.eq(constants.AddressZero)
    expect(await flareLibrary.getDistribution()).not.to.eq(constants.AddressZero)
  })

  it('getCurrentFtsoRewardEpoch', async () => {
    const ftsoManager1 = FtsoManager__factory.connect(await flareLibrary.getFtsoManager(), wallet)
    expect(await flareLibrary.getCurrentFtsoRewardEpoch()).to.eq(0)
    await ftsoManager1.startRewardEpoch(5, 1)
    expect(await flareLibrary.getCurrentFtsoRewardEpoch()).to.eq(5)

    const ftsoManager2 = (await deployContract('FtsoManager', [ftsoManager1.address])) as FtsoManager
    await registry.setContractAddress('FtsoManager', ftsoManager2.address, [])
    expect(await flareLibrary.getCurrentFtsoRewardEpoch()).to.eq(5)
    await ftsoManager2.initialize()
    await ftsoManager2.startRewardEpoch(10, 1)
    expect(await flareLibrary.getCurrentFtsoRewardEpoch()).to.eq(10)
  })

  it('getCurrentFtsoRewardEpoch', async () => {
    const ftsoManager1 = FtsoManager__factory.connect(await flareLibrary.getFtsoManager(), wallet)
    expect(await flareLibrary.getCurrentFtsoRewardEpoch()).to.eq(0)
    await ftsoManager1.startRewardEpoch(5, 1)
    expect(await flareLibrary.getCurrentFtsoRewardEpoch()).to.eq(5)

    const ftsoManager2 = (await deployContract('FtsoManager', [ftsoManager1.address])) as FtsoManager
    await registry.setContractAddress('FtsoManager', ftsoManager2.address, [])
    expect(await flareLibrary.getCurrentFtsoRewardEpoch()).to.eq(5)
    await ftsoManager2.initialize()
    await ftsoManager2.startRewardEpoch(10, 1)
    expect(await flareLibrary.getCurrentFtsoRewardEpoch()).to.eq(10)
  })

  it('getActiveFtsoRewardEpochsExclusive', async () => {
    const ftsoManager1 = FtsoManager__factory.connect(await flareLibrary.getFtsoManager(), wallet)
    let [start, end, len] = await flareLibrary.getActiveFtsoRewardEpochsExclusive(0)
    expect(start).to.eq(0)
    expect(end).to.eq(0)
    expect(len).to.eq(0)

    await ftsoManager1.startRewardEpoch(5, 1)
    ;[start, end, len] = await flareLibrary.getActiveFtsoRewardEpochsExclusive(0)
    expect(start).to.eq(0)
    expect(end).to.eq(5)
    expect(len).to.eq(5)
    ;[start, end, len] = await flareLibrary.getActiveFtsoRewardEpochsExclusive(2)
    expect(start).to.eq(2)
    expect(end).to.eq(5)
    expect(len).to.eq(3)

    const ftsoManager2 = (await deployContract('FtsoManager', [ftsoManager1.address])) as FtsoManager
    await registry.setContractAddress('FtsoManager', ftsoManager2.address, [])
    await ftsoManager2.initialize()
    await ftsoManager2.startRewardEpoch(10, 1)
    await ftsoManager2.setRewardEpochToExpireNext(5)
    ;[start, end, len] = await flareLibrary.getActiveFtsoRewardEpochsExclusive(0)
    expect(start).to.eq(5)
    expect(end).to.eq(10)
    expect(len).to.eq(5)
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

  it('getActiveFtsoRewardManagers', async () => {
    const uint256Max = BigNumber.from(2).pow(256).sub(1)
    const ftsoManager = FtsoManager__factory.connect(await flareLibrary.getFtsoManager(), wallet)
    const ftsoRewardManager1 = FtsoRewardManager__factory.connect(await ftsoManager.rewardManager(), wallet)

    let res = await flareLibrary.getActiveFtsoRewardManagers(0)
    expect(res.length).to.be.eq(1)
    expect(res[0].rewardManager).to.be.eq(ftsoRewardManager1.address)
    expect(res[0].initialRewardEpoch).to.be.eq(0)
    expect(res[0].lastRewardEpoch).to.be.eq(uint256Max)

    await ftsoManager.startRewardEpoch(5, 1)

    const ftsoRewardManager2 = await replaceFtsoRewardManager(ftsoManager)

    res = await flareLibrary.getActiveFtsoRewardManagers(0)
    expect(res.length).to.be.eq(1)
    expect(res[0].rewardManager).to.be.eq(ftsoRewardManager1.address)
    expect(res[0].initialRewardEpoch).to.be.eq(0)
    expect(res[0].lastRewardEpoch).to.be.eq(uint256Max)

    await initializeFtsoRewardManager(ftsoManager, ftsoRewardManager2)

    res = await flareLibrary.getActiveFtsoRewardManagers(3)
    expect(res.length).to.be.eq(2)
    expect(res[0].rewardManager).to.be.eq(ftsoRewardManager2.address)
    expect(res[0].initialRewardEpoch).to.be.eq(5)
    expect(res[0].lastRewardEpoch).to.be.eq(uint256Max)
    expect(res[1].rewardManager).to.be.eq(ftsoRewardManager1.address)
    expect(res[1].initialRewardEpoch).to.be.eq(0)
    expect(res[1].lastRewardEpoch).to.be.eq(5)

    await ftsoManager.startRewardEpoch(10, 1)

    const ftsoRewardManager3 = await replaceFtsoRewardManager(ftsoManager)
    await initializeFtsoRewardManager(ftsoManager, ftsoRewardManager3)

    await ftsoManager.startRewardEpoch(15, 1)

    await ftsoRewardManager2.deactivate()

    res = await flareLibrary.getActiveFtsoRewardManagers(0)
    expect(res.length).to.be.eq(2)
    expect(res[0].rewardManager).to.be.eq(ftsoRewardManager3.address)
    expect(res[0].initialRewardEpoch).to.be.eq(10)
    expect(res[0].lastRewardEpoch).to.be.eq(uint256Max)
    expect(res[1].rewardManager).to.be.eq(ftsoRewardManager1.address)
    expect(res[1].initialRewardEpoch).to.be.eq(0)
    expect(res[1].lastRewardEpoch).to.be.eq(5)

    res = await flareLibrary.getActiveFtsoRewardManagers(8)
    expect(res.length).to.be.eq(1)
    expect(res[0].rewardManager).to.be.eq(ftsoRewardManager3.address)
    expect(res[0].initialRewardEpoch).to.be.eq(10)
    expect(res[0].lastRewardEpoch).to.be.eq(uint256Max)

    await ftsoRewardManager1.deactivate()
    await ftsoRewardManager3.deactivate()

    res = await flareLibrary.getActiveFtsoRewardManagers(0)
    expect(res.length).to.be.eq(0)
  })

  it('getActiveAirdropMonthsExclusive', async () => {
    // distribution not started
    let [start, end, len] = await flareLibrary.getActiveAirdropMonthsExclusive(0, false)
    expect(start).to.eq(0)
    expect(end).to.eq(0)
    expect(len).to.eq(0)

    await distribution.setMonthToExpireNext(0)
    ;[start, end, len] = await flareLibrary.getActiveAirdropMonthsExclusive(0, false)
    expect(start).to.eq(0)
    expect(end).to.eq(0)
    expect(len).to.eq(0)

    await distribution.setSingleVotePowerBlockNumber(0, 1)
    ;[start, end, len] = await flareLibrary.getActiveAirdropMonthsExclusive(0, false)
    expect(start).to.eq(0)
    expect(end).to.eq(1)
    expect(len).to.eq(1)

    await distribution.setSingleVotePowerBlockNumber(5, 1)
    ;[start, end, len] = await flareLibrary.getActiveAirdropMonthsExclusive(0, false)
    expect(start).to.eq(0)
    expect(end).to.eq(6)
    expect(len).to.eq(6)
    ;[start, end, len] = await flareLibrary.getActiveAirdropMonthsExclusive(3, false)
    expect(start).to.eq(3)
    expect(end).to.eq(6)
    expect(len).to.eq(3)

    await distribution.setMonthToExpireNext(4)
    await distribution.stop()
    ;[start, end, len] = await flareLibrary.getActiveAirdropMonthsExclusive(0, false)
    expect(start).to.eq(4)
    expect(end).to.eq(6)
    expect(len).to.eq(2)
    ;[start, end, len] = await flareLibrary.getActiveAirdropMonthsExclusive(0, true)
    expect(start).to.eq(0)
    expect(end).to.eq(0)
    expect(len).to.eq(0)
  })
})
