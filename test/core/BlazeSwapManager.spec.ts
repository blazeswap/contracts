import { waffle } from 'hardhat'
import { expect } from 'chai'
import { constants } from 'ethers'

import { managerFixture } from './shared/fixtures'

import AssetManagerController from '../../artifacts/contracts/core/test/AssetManagerController.sol/AssetManagerController.json'
import BlazeSwapFAssetRewardPlugin from '../../artifacts/contracts/core/BlazeSwapFAssetRewardPlugin.sol/BlazeSwapFAssetRewardPlugin.json'
import FAssetTest from '../../artifacts/contracts/core/test/FAssetTest.sol/FAssetTest.json'
import {
  FtsoManager,
  FtsoManager__factory,
  FtsoRewardManager__factory,
  IBlazeSwapManager,
  IWNat,
} from '../../typechain-types'

const { createFixtureLoader, deployContract } = waffle

describe('BlazeSwapManager', () => {
  const provider = waffle.provider
  const [wallet, other] = provider.getWallets()
  const loadFixture = createFixtureLoader([wallet, other], provider)

  let manager: IBlazeSwapManager
  let wNat: IWNat
  let ftsoManager: FtsoManager
  beforeEach(async () => {
    const fixture = await loadFixture(managerFixture)
    manager = fixture.manager
    wNat = fixture.wNat
    ftsoManager = FtsoManager__factory.connect(await fixture.priceSubmitter.getFtsoManager(), wallet)
  })

  it('rewardsFeeTo, ftsoRewardsFeeOn', async () => {
    expect(await manager.rewardsFeeTo()).to.eq(constants.AddressZero)
    expect(await manager.ftsoRewardsFeeOn()).to.eq(false)
    expect(await manager.fAssetRewardsFeeOn()).to.eq(false)
    expect(await manager.airdropFeeOn()).to.eq(false)
  })

  it('setRewardsFeeTo', async () => {
    await expect(manager.connect(other).setRewardsFeeTo(other.address)).to.be.revertedWith('Configurable: FORBIDDEN')
    await manager.setRewardsFeeTo(other.address)
    expect(await manager.rewardsFeeTo()).to.eq(other.address)
  })

  it('setFtsoRewardsFeeOn', async () => {
    await expect(manager.connect(other).setFtsoRewardsFeeOn(true)).to.be.revertedWith('Configurable: FORBIDDEN')
    await manager.setFtsoRewardsFeeOn(true)
    expect(await manager.ftsoRewardsFeeOn()).to.eq(true)
    await manager.setFtsoRewardsFeeOn(false)
    expect(await manager.ftsoRewardsFeeOn()).to.eq(false)
  })

  it('setFAssetRewardsFeeOn', async () => {
    await expect(manager.connect(other).setFAssetRewardsFeeOn(true)).to.be.revertedWith('Configurable: FORBIDDEN')
    await manager.setFAssetRewardsFeeOn(true)
    expect(await manager.fAssetRewardsFeeOn()).to.eq(true)
    await manager.setFAssetRewardsFeeOn(false)
    expect(await manager.fAssetRewardsFeeOn()).to.eq(false)
  })

  it('setAirdropFeeOn', async () => {
    await expect(manager.connect(other).setAirdropFeeOn(true)).to.be.revertedWith('Configurable: FORBIDDEN')
    await manager.setAirdropFeeOn(true)
    expect(await manager.airdropFeeOn()).to.eq(true)
    await manager.setAirdropFeeOn(false)
    expect(await manager.airdropFeeOn()).to.eq(false)
  })

  it('executorManager, wNat, getFtsoRewardManagers, getActiveFtsoRewardManagers, delegationPlugin, ftsoRewardPlugin, fAssetRewardPlugin, airdropPlugin, getLatestAssetManagerController, allowFAssetPairsWithoutPlugin', async () => {
    expect(await manager.executorManager()).not.to.eq(constants.AddressZero)
    expect(await manager.wNat()).not.to.eq(constants.AddressZero)
    const ftsoRewardManagers = await manager.getFtsoRewardManagers()
    expect(ftsoRewardManagers.length).to.eq(1)
    expect(ftsoRewardManagers[0]).not.to.eq(constants.AddressZero)
    const activeFtsoRewardManagers = await manager.getActiveFtsoRewardManagers()
    expect(activeFtsoRewardManagers.length).to.eq(1)
    expect(activeFtsoRewardManagers[0]).not.to.eq(constants.AddressZero)
    expect(await manager.delegationPlugin()).not.to.eq(constants.AddressZero)
    expect(await manager.ftsoRewardPlugin()).not.to.eq(constants.AddressZero)
    expect(await manager.fAssetRewardPlugin()).to.eq(constants.AddressZero)
    expect(await manager.airdropPlugin()).not.to.eq(constants.AddressZero)
    expect(await manager.getLatestAssetManagerController()).to.eq(constants.AddressZero)
    expect(await manager.allowFAssetPairsWithoutPlugin()).to.eq(false)
  })

  it('setConfigSetter', async () => {
    await expect(manager.connect(other).setConfigSetter(other.address)).to.be.revertedWith('Configurable: FORBIDDEN')
    await manager.setConfigSetter(other.address)
    expect(await manager.configSetter()).to.eq(other.address)
    await expect(manager.setConfigSetter(wallet.address)).to.be.revertedWith('Configurable: FORBIDDEN')
  })

  it('getFtsoRewardManagers, updateFtsoRewardManagers, getActiveFtsoRewardManagers', async () => {
    const ftsoRewardManager1 = await ftsoManager.rewardManager()
    await ftsoManager.replaceRewardManager()
    const ftsoRewardManager2 = await ftsoManager.rewardManager()
    let ftsoRewardManagers = await manager.getFtsoRewardManagers()
    expect(ftsoRewardManagers.length).to.eq(2)
    await ftsoManager.replaceRewardManager()
    const ftsoRewardManager3 = await ftsoManager.rewardManager()

    ftsoRewardManagers = await manager.getFtsoRewardManagers()
    expect(ftsoRewardManagers.length).to.eq(3)
    expect(ftsoRewardManagers).to.deep.eq([ftsoRewardManager1, ftsoRewardManager2, ftsoRewardManager3])

    await ftsoManager.replaceRewardManager()
    const ftsoRewardManager4 = await ftsoManager.rewardManager()
    await expect(manager.getFtsoRewardManagers()).to.be.revertedWith('BlazeSwap: FTSO_REWARD_MANAGERS')

    await expect(manager.updateFtsoRewardManagers(2)).to.be.revertedWith('BlazeSwap: FTSO_REWARD_MANAGERS')

    await expect(manager.updateFtsoRewardManagers(3))
      .to.emit(manager, 'AddFtsoRewardManager')
      .withArgs(ftsoRewardManager2)
      .to.emit(manager, 'AddFtsoRewardManager')
      .withArgs(ftsoRewardManager3)
      .to.emit(manager, 'AddFtsoRewardManager')
      .withArgs(ftsoRewardManager4)

    await expect(manager.updateFtsoRewardManagers(4)).not.to.be.reverted

    ftsoRewardManagers = await manager.getFtsoRewardManagers()
    expect(ftsoRewardManagers.length).to.eq(4)
    expect(ftsoRewardManagers).to.deep.eq([
      ftsoRewardManager1,
      ftsoRewardManager2,
      ftsoRewardManager3,
      ftsoRewardManager4,
    ])

    await FtsoRewardManager__factory.connect(ftsoRewardManager1, wallet).deactivate()
    await FtsoRewardManager__factory.connect(ftsoRewardManager3, wallet).deactivate()
    ftsoRewardManagers = await manager.getActiveFtsoRewardManagers()
    expect(ftsoRewardManagers.length).to.eq(2)
    expect(ftsoRewardManagers).to.deep.eq([ftsoRewardManager2, ftsoRewardManager4])
  })

  it('setDelegationPlugin', async () => {
    await expect(manager.setDelegationPlugin(other.address)).to.be.revertedWith('BlazeSwap: ALREADY_SET')
  })

  it('setFtsoRewardPlugin', async () => {
    await expect(manager.setFtsoRewardPlugin(other.address)).to.be.revertedWith('BlazeSwap: ALREADY_SET')
  })

  it('setAirdropPlugin', async () => {
    await expect(manager.setAirdropPlugin(other.address)).to.be.revertedWith('BlazeSwap: ALREADY_SET')
  })

  it('setAssetManagerController', async () => {
    await expect(manager.connect(other).setAssetManagerController(other.address)).to.be.revertedWith(
      'Configurable: FORBIDDEN'
    )
    const controller = await deployContract(wallet, AssetManagerController)
    await manager.setAssetManagerController(controller.address)
    expect(await manager.getLatestAssetManagerController()).to.eq(controller.address)
    await expect(manager.setAssetManagerController(other.address)).to.be.revertedWith('BlazeSwap: ALREADY_SET')
  })

  it('getLatestAssetManagerController, updateAssetManagerController', async () => {
    const controller1 = await deployContract(wallet, AssetManagerController)
    await manager.setAssetManagerController(controller1.address)

    const controller2 = await deployContract(wallet, AssetManagerController)
    await controller1.replaceWith(controller2.address)

    const controller3 = await deployContract(wallet, AssetManagerController)
    await controller2.replaceWith(controller3.address)

    expect(await manager.getLatestAssetManagerController()).to.eq(controller3.address)
    await expect(manager.updateAssetManagerController())
      .to.emit(manager, 'UpdateAssetManagerController')
      .withArgs(controller3.address)
    expect(await manager.getLatestAssetManagerController()).to.eq(controller3.address)
  })

  it('setAllowFAssetPairsWithoutPlugin', async () => {
    await expect(manager.connect(other).setAllowFAssetPairsWithoutPlugin(true)).to.be.revertedWith(
      'Configurable: FORBIDDEN'
    )
    await manager.setAllowFAssetPairsWithoutPlugin(true)
    expect(await manager.allowFAssetPairsWithoutPlugin()).to.eq(true)
    await manager.setAllowFAssetPairsWithoutPlugin(false)
    expect(await manager.allowFAssetPairsWithoutPlugin()).to.eq(false)
  })

  it('setFAssetsRewardPlugin', async () => {
    const fAssetReward = await deployContract(wallet, BlazeSwapFAssetRewardPlugin, [5, 'FAsset Reward Plugin'])

    await expect(manager.connect(other).setFAssetsRewardPlugin(fAssetReward.address)).to.be.revertedWith(
      'Configurable: FORBIDDEN'
    )
    await manager.setFAssetsRewardPlugin(fAssetReward.address)
    expect(await manager.fAssetRewardPlugin()).to.eq(fAssetReward.address)
    await expect(manager.setFAssetsRewardPlugin(fAssetReward.address)).to.be.revertedWith('BlazeSwap: ALREADY_SET')
  })

  it('fAssetSupport', async () => {
    expect(await manager.fAssetSupport()).to.eq(0) // None
    await manager.setAllowFAssetPairsWithoutPlugin(true)
    expect(await manager.fAssetSupport()).to.eq(0) // None
    await manager.setAllowFAssetPairsWithoutPlugin(false)
    await manager.setAssetManagerController(other.address)
    expect(await manager.fAssetSupport()).to.eq(0) // None
    await manager.setAllowFAssetPairsWithoutPlugin(true)
    expect(await manager.fAssetSupport()).to.eq(1) // Minimal
    const fAssetReward = await deployContract(wallet, BlazeSwapFAssetRewardPlugin, [5, 'FAsset Reward Plugin'])
    await manager.setFAssetsRewardPlugin(fAssetReward.address)
    expect(await manager.fAssetSupport()).to.eq(2) // Full
  })

  it('getTokenType', async () => {
    expect(await manager.getTokenType(other.address)).to.eq(0) // Generic
    expect(await manager.getTokenType(wNat.address)).to.eq(1) // WNat
    const fAsset = await deployContract(wallet, FAssetTest, [other.address, 1])
    expect(await manager.getTokenType(fAsset.address)).to.eq(2) // FAsset

    const controller1 = await deployContract(wallet, AssetManagerController)
    const controller2 = await deployContract(wallet, AssetManagerController)
    await controller1.replaceWith(controller2.address)
    await manager.setAssetManagerController(controller1.address)

    expect(await manager.getTokenType(fAsset.address)).to.eq(0) // Not handled by Asset Manager Controller
    await controller2.addAssetManager(other.address)
    expect(await manager.getTokenType(fAsset.address)).to.eq(2) // FAsset
  })
})
