import { waffle } from 'hardhat'
import { expect } from 'chai'
import { constants } from 'ethers'

import { managerFixture } from './shared/fixtures'

import BlazeSwapFAssetRewardPlugin from '../../artifacts/contracts/core/BlazeSwapFAssetRewardPlugin.sol/BlazeSwapFAssetRewardPlugin.json'
import FAssetTest from '../../artifacts/contracts/core/test/FAssetTest.sol/FAssetTest.json'
import { IBlazeSwapManager, IWNat } from '../../typechain-types'

const { createFixtureLoader, deployContract } = waffle

describe('BlazeSwapManager', () => {
  const provider = waffle.provider
  const [wallet, other] = provider.getWallets()
  const loadFixture = createFixtureLoader([wallet, other], provider)

  let manager: IBlazeSwapManager
  let wNat: IWNat
  beforeEach(async () => {
    const fixture = await loadFixture(managerFixture)
    manager = fixture.manager
    wNat = fixture.wNat
  })

  it('rewardsFeeTo, rewardsFeeOn', async () => {
    expect(await manager.rewardsFeeTo()).to.eq(constants.AddressZero)
    expect(await manager.rewardsFeeOn()).to.eq(false)
  })

  it('setRewardsFeeTo', async () => {
    await expect(manager.connect(other).setRewardsFeeTo(other.address)).to.be.revertedWith('Configurable: FORBIDDEN')
    await manager.setRewardsFeeTo(other.address)
    expect(await manager.rewardsFeeTo()).to.eq(other.address)
  })

  it('setRewardsFeeOn', async () => {
    await expect(manager.connect(other).setRewardsFeeOn(true)).to.be.revertedWith('Configurable: FORBIDDEN')
    await manager.setRewardsFeeOn(true)
    expect(await manager.rewardsFeeOn()).to.eq(true)
    await manager.setRewardsFeeOn(false)
    expect(await manager.rewardsFeeOn()).to.eq(false)
  })

  it('wNat, delegationPlugin, ftsoRewardPlugin, fAssetRewardPlugin, assetManagerController, allowFAssetPairsWithoutPlugin', async () => {
    expect(await manager.wNat()).not.to.eq(constants.AddressZero)
    expect(await manager.delegationPlugin()).not.to.eq(constants.AddressZero)
    expect(await manager.ftsoRewardPlugin()).not.to.eq(constants.AddressZero)
    expect(await manager.fAssetRewardPlugin()).to.eq(constants.AddressZero)
    expect(await manager.assetManagerController()).to.eq(constants.AddressZero)
    expect(await manager.allowFAssetPairsWithoutPlugin()).to.eq(false)
  })

  it('setConfigSetter', async () => {
    await expect(manager.connect(other).setConfigSetter(other.address)).to.be.revertedWith('Configurable: FORBIDDEN')
    await manager.setConfigSetter(other.address)
    expect(await manager.configSetter()).to.eq(other.address)
    await expect(manager.setConfigSetter(wallet.address)).to.be.revertedWith('Configurable: FORBIDDEN')
  })

  it('setAssetManagerController', async () => {
    await expect(manager.connect(other).setAssetManagerController(other.address)).to.be.revertedWith(
      'Configurable: FORBIDDEN'
    )
    await manager.setAssetManagerController(other.address)
    expect(await manager.assetManagerController()).to.eq(other.address)
    await expect(manager.setAssetManagerController(other.address)).to.be.revertedWith('BlazeSwap: ALREADY_SET')
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
    expect(await manager.callStatic.getTokenType(other.address)).to.eq(0) // Generic
    expect(await manager.callStatic.getTokenType(wNat.address)).to.eq(1) // WNat
    const fAsset = await deployContract(wallet, FAssetTest, [other.address, 1])
    expect(await manager.callStatic.getTokenType(fAsset.address)).to.eq(2) // FAsset
  })
})
