import { waffle } from 'hardhat'
import { expect } from 'chai'
import { BigNumber, constants } from 'ethers'

import { flareFixture } from './shared/fixtures'

import FlareLibraryTestABI from '../../artifacts/contracts/core/test/FlareLibraryTest.sol/FlareLibraryTest.json'
import FtsoManagerABI from '../../artifacts/contracts/core/test/FtsoManager.sol/FtsoManager.json'
import FtsoRewardManagerABI from '../../artifacts/contracts/core/test/FtsoRewardManager.sol/FtsoRewardManager.json'
import {
    DistributionToDelegators,
  FlareContractRegistry,
  FlareLibraryTest,
  FtsoManager,
  FtsoManager__factory,
  FtsoRewardManager,
  FtsoRewardManager__factory,
} from '../../typechain-types'

const { createFixtureLoader, deployContract } = waffle

describe('FlareLibrary', () => {
  const provider = waffle.provider
  const [wallet, other] = provider.getWallets()
  const loadFixture = createFixtureLoader([wallet, other], provider)

  let registry: FlareContractRegistry
  let distribution: DistributionToDelegators
  let flareLibrary: FlareLibraryTest
  beforeEach(async () => {
    const fixture = await loadFixture(flareFixture)
    registry = fixture.registry
    distribution = fixture.distribution
    flareLibrary = (await deployContract(wallet, FlareLibraryTestABI, [registry.address])) as FlareLibraryTest
  })

  it('getFtsoManager, getFtsoRewardManager, getWNat, getFlareAssetRegistry, getDistribution', async () => {
    expect(await flareLibrary.getFtsoManager()).not.to.eq(constants.AddressZero)
    expect(await flareLibrary.getFtsoRewardManager()).not.to.eq(constants.AddressZero)
    expect(await flareLibrary.getWNat()).not.to.eq(constants.AddressZero)
    expect(await flareLibrary.getFlareAssetRegistry()).not.to.eq(constants.AddressZero)
    // this is zero initially
    expect(await flareLibrary.getDistribution()).to.eq(constants.AddressZero)
    await registry.setContractAddress('DistributionToDelegators', distribution.address, [])
    expect(await flareLibrary.getDistribution()).not.to.eq(constants.AddressZero)
  })

  it('getCurrentFtsoRewardEpoch', async () => {
    const ftsoManager1 = FtsoManager__factory.connect(await flareLibrary.getFtsoManager(), wallet)
    expect(await flareLibrary.getCurrentFtsoRewardEpoch()).to.eq(0)
    await ftsoManager1.addRewardEpoch(5, 1)
    expect(await flareLibrary.getCurrentFtsoRewardEpoch()).to.eq(6)

    const ftsoManager2 = (await deployContract(wallet, FtsoManagerABI, [ftsoManager1.address])) as FtsoManager
    await registry.setContractAddress('FtsoManager', ftsoManager2.address, [])
    expect(await flareLibrary.getCurrentFtsoRewardEpoch()).to.eq(6)
    await ftsoManager2.initialize()
    await ftsoManager2.addRewardEpoch(10, 1)
    expect(await flareLibrary.getCurrentFtsoRewardEpoch()).to.eq(11)
  })

  
  it('getCurrentFtsoRewardEpoch', async () => {
    const ftsoManager1 = FtsoManager__factory.connect(await flareLibrary.getFtsoManager(), wallet)
    expect(await flareLibrary.getCurrentFtsoRewardEpoch()).to.eq(0)
    await ftsoManager1.addRewardEpoch(5, 1)
    expect(await flareLibrary.getCurrentFtsoRewardEpoch()).to.eq(6)

    const ftsoManager2 = (await deployContract(wallet, FtsoManagerABI, [ftsoManager1.address])) as FtsoManager
    await registry.setContractAddress('FtsoManager', ftsoManager2.address, [])
    expect(await flareLibrary.getCurrentFtsoRewardEpoch()).to.eq(6)
    await ftsoManager2.initialize()
    await ftsoManager2.addRewardEpoch(10, 1)
    expect(await flareLibrary.getCurrentFtsoRewardEpoch()).to.eq(11)
  })

  it('getActiveFtsoRewardEpochsExclusive', async () => {
    const ftsoManager1 = FtsoManager__factory.connect(await flareLibrary.getFtsoManager(), wallet)
    let [start, end, len] = await flareLibrary.getActiveFtsoRewardEpochsExclusive(0)
    expect(start).to.eq(0)
    expect(end).to.eq(0)
    expect(len).to.eq(0)

    await ftsoManager1.addRewardEpoch(5, 1)
    ;[start, end, len] = await flareLibrary.getActiveFtsoRewardEpochsExclusive(0)
    expect(start).to.eq(0)
    expect(end).to.eq(6)
    expect(len).to.eq(6)

    ;[start, end, len] = await flareLibrary.getActiveFtsoRewardEpochsExclusive(2)
    expect(start).to.eq(2)
    expect(end).to.eq(6)
    expect(len).to.eq(4)

    const ftsoManager2 = (await deployContract(wallet, FtsoManagerABI, [ftsoManager1.address])) as FtsoManager
    await registry.setContractAddress('FtsoManager', ftsoManager2.address, [])
    await ftsoManager2.initialize()
    await ftsoManager2.addRewardEpoch(10, 1)
    await ftsoManager2.setRewardEpochToExpireNext(5)
    ;[start, end, len] = await flareLibrary.getActiveFtsoRewardEpochsExclusive(0)
    expect(start).to.eq(5)
    expect(end).to.eq(11)
    expect(len).to.eq(6)
  })
  
  async function replaceFtsoRewardManager(ftsoManager: FtsoManager) {
    const oldManager = await ftsoManager.rewardManager()
    const newManager = (await deployContract(wallet, FtsoRewardManagerABI, [oldManager])) as FtsoRewardManager
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

    await ftsoManager.addRewardEpoch(5, 1)

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
    expect(res[0].initialRewardEpoch).to.be.eq(6)
    expect(res[0].lastRewardEpoch).to.be.eq(uint256Max)
    expect(res[1].rewardManager).to.be.eq(ftsoRewardManager1.address)
    expect(res[1].initialRewardEpoch).to.be.eq(0)
    expect(res[1].lastRewardEpoch).to.be.eq(6)

    await ftsoManager.addRewardEpoch(10, 1)

    const ftsoRewardManager3 = await replaceFtsoRewardManager(ftsoManager)
    await initializeFtsoRewardManager(ftsoManager, ftsoRewardManager3)

    await ftsoManager.addRewardEpoch(15, 1)

    await ftsoRewardManager2.deactivate()

    res = await flareLibrary.getActiveFtsoRewardManagers(0)
    expect(res.length).to.be.eq(2)
    expect(res[0].rewardManager).to.be.eq(ftsoRewardManager3.address)
    expect(res[0].initialRewardEpoch).to.be.eq(11)
    expect(res[0].lastRewardEpoch).to.be.eq(uint256Max)
    expect(res[1].rewardManager).to.be.eq(ftsoRewardManager1.address)
    expect(res[1].initialRewardEpoch).to.be.eq(0)
    expect(res[1].lastRewardEpoch).to.be.eq(6)

    res = await flareLibrary.getActiveFtsoRewardManagers(10)
    expect(res.length).to.be.eq(1)
    expect(res[0].rewardManager).to.be.eq(ftsoRewardManager3.address)
    expect(res[0].initialRewardEpoch).to.be.eq(11)
    expect(res[0].lastRewardEpoch).to.be.eq(uint256Max)

    await ftsoRewardManager1.deactivate()
    await ftsoRewardManager3.deactivate()

    res = await flareLibrary.getActiveFtsoRewardManagers(0)
    expect(res.length).to.be.eq(0)
  })


  it('getActiveAirdropMonthsExclusive', async () => {
    await registry.setContractAddress('DistributionToDelegators', distribution.address, [])

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

    await distribution.setVotePowerBlockNumbers(0, [1])
    ;[start, end, len] = await flareLibrary.getActiveAirdropMonthsExclusive(0, false)
    expect(start).to.eq(0)
    expect(end).to.eq(1)
    expect(len).to.eq(1)

    await distribution.setVotePowerBlockNumbers(5, [1])
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
