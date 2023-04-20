import { waffle } from 'hardhat'
import { expect } from 'chai'
import { constants } from 'ethers'

import {
  ASSET_TYPE_FASSET,
  ASSET_TYPE_GENERIC,
  ASSET_TYPE_LAYERCAKE,
  ASSET_TYPE_WNAT,
  managerFixture,
} from './shared/fixtures'

import BlazeSwapFlareAssetRewardPlugin from '../../artifacts/contracts/core/BlazeSwapFlareAssetRewardPlugin.sol/BlazeSwapFlareAssetRewardPlugin.json'
import FlareAssetTest from '../../artifacts/contracts/core/test/FlareAssetTest.sol/FlareAssetTest.json'
import { FlareAssetRegistry, FlareContractRegistry, IBlazeSwapManager } from '../../typechain-types'

const { createFixtureLoader, deployContract } = waffle

describe('BlazeSwapManager', () => {
  const provider = waffle.provider
  const [wallet, other] = provider.getWallets()
  const loadFixture = createFixtureLoader([wallet, other], provider)

  let manager: IBlazeSwapManager
  let registry: FlareContractRegistry
  let flareAssetRegistry: FlareAssetRegistry
  beforeEach(async () => {
    const fixture = await loadFixture(managerFixture)
    manager = fixture.manager
    registry = fixture.registry
    flareAssetRegistry = fixture.flareAssetRegistry
  })

  it('ftsoRewardsFeeBips, flareAssetRewardsFeeBips, airdropFeeBips', async () => {
    expect(await manager.ftsoRewardsFeeBips()).to.eq(0)
    expect(await manager.flareAssetRewardsFeeBips()).to.eq(0)
    expect(await manager.airdropFeeBips()).to.eq(0)
  })

  it('setFtsoRewardsFeeBips', async () => {
    await expect(manager.connect(other).setFtsoRewardsFeeBips(1_90)).to.be.revertedWith('Configurable: FORBIDDEN')
    await expect(manager.setFtsoRewardsFeeBips(10_00)).to.be.revertedWith('BlazeSwap: INVALID_FEE')
    await manager.setFtsoRewardsFeeBips(1_90)
    expect(await manager.ftsoRewardsFeeBips()).to.eq(1_90)
    await manager.setFtsoRewardsFeeBips(0)
    expect(await manager.ftsoRewardsFeeBips()).to.eq(0)
  })

  it('setFlareAssetRewardsFeeBips', async () => {
    await expect(manager.connect(other).setFlareAssetRewardsFeeBips(1_90)).to.be.revertedWith('Configurable: FORBIDDEN')
    await expect(manager.setFlareAssetRewardsFeeBips(10_00)).to.be.revertedWith('BlazeSwap: INVALID_FEE')
    await manager.setFlareAssetRewardsFeeBips(1_90)
    expect(await manager.flareAssetRewardsFeeBips()).to.eq(1_90)
    await manager.setFlareAssetRewardsFeeBips(0)
    expect(await manager.flareAssetRewardsFeeBips()).to.eq(0)
  })

  it('setAirdropFeeBips', async () => {
    await expect(manager.connect(other).setAirdropFeeBips(50)).to.be.revertedWith('Configurable: FORBIDDEN')
    await expect(manager.setAirdropFeeBips(10_00)).to.be.revertedWith('BlazeSwap: INVALID_FEE')
    await manager.setAirdropFeeBips(50)
    expect(await manager.airdropFeeBips()).to.eq(50)
    await manager.setAirdropFeeBips(0)
    expect(await manager.airdropFeeBips()).to.eq(0)
  })

  it('executorManager, rewardsPlugin, delegationPlugin, ftsoRewardPlugin, flareAssetRewardPlugin, airdropPlugin, allowFlareAssetPairsWithoutPlugin, factory', async () => {
    expect(await manager.executorManager()).not.to.eq(constants.AddressZero)
    expect(await manager.rewardsPlugin()).not.to.eq(constants.AddressZero)
    expect(await manager.delegationPlugin()).not.to.eq(constants.AddressZero)
    expect(await manager.ftsoRewardPlugin()).not.to.eq(constants.AddressZero)
    expect(await manager.flareAssetRewardPlugin(ASSET_TYPE_FASSET)).to.eq(constants.AddressZero)
    expect(await manager.airdropPlugin()).not.to.eq(constants.AddressZero)
    expect(await manager.allowFlareAssetPairsWithoutPlugin(ASSET_TYPE_FASSET)).to.eq(0) // No
    expect(await manager.factory()).to.eq(constants.AddressZero)
  })

  it('setConfigSetter', async () => {
    await expect(manager.connect(other).setConfigSetter(other.address)).to.be.revertedWith('Configurable: FORBIDDEN')
    await manager.setConfigSetter(other.address)
    expect(await manager.configSetter()).to.eq(other.address)
    await expect(manager.setConfigSetter(wallet.address)).to.be.revertedWith('Configurable: FORBIDDEN')
  })

  it('setRewardsPlugin', async () => {
    await expect(manager.setRewardsPlugin(other.address)).to.be.revertedWith('BlazeSwap: ALREADY_SET')
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

  it('setAllowFlareAssetPairsWithoutPlugin', async () => {
    await expect(manager.connect(other).setAllowFlareAssetPairsWithoutPlugin(ASSET_TYPE_FASSET, 1)).to.be.revertedWith(
      'Configurable: FORBIDDEN'
    )
    await manager.setAllowFlareAssetPairsWithoutPlugin(ASSET_TYPE_FASSET, 1)
    expect(await manager.allowFlareAssetPairsWithoutPlugin(ASSET_TYPE_FASSET)).to.eq(1)
    await manager.setAllowFlareAssetPairsWithoutPlugin(ASSET_TYPE_FASSET, 2)
    expect(await manager.allowFlareAssetPairsWithoutPlugin(ASSET_TYPE_FASSET)).to.eq(2)
  })

  it('setFlareAssetRewardPlugin', async () => {
    const flareAssetReward1 = await deployContract(wallet, BlazeSwapFlareAssetRewardPlugin, [
      5,
      'FlareAsset Reward Plugin',
    ])
    const flareAssetReward2 = await deployContract(wallet, BlazeSwapFlareAssetRewardPlugin, [
      5,
      'FlareAsset Reward Plugin',
    ])

    await manager.setAllowFlareAssetPairsWithoutPlugin(ASSET_TYPE_FASSET, 1)
    await manager.setAllowFlareAssetPairsWithoutPlugin(ASSET_TYPE_LAYERCAKE, 1)

    await expect(
      manager.connect(other).setFlareAssetRewardPlugin(ASSET_TYPE_FASSET, flareAssetReward1.address)
    ).to.be.revertedWith('Configurable: FORBIDDEN')
    await manager.setFlareAssetRewardPlugin(ASSET_TYPE_FASSET, flareAssetReward1.address)
    await expect(manager.setFlareAssetRewardPlugin(ASSET_TYPE_FASSET, flareAssetReward1.address)).to.be.revertedWith(
      'BlazeSwap: ALREADY_SET'
    )
    await manager.setFlareAssetRewardPlugin(ASSET_TYPE_LAYERCAKE, flareAssetReward2.address)

    expect(await manager.flareAssetRewardPlugin(ASSET_TYPE_FASSET)).to.eq(flareAssetReward1.address)
    expect(await manager.flareAssetRewardPlugin(ASSET_TYPE_LAYERCAKE)).to.eq(flareAssetReward2.address)
    expect(await manager.allowFlareAssetPairsWithoutPlugin(ASSET_TYPE_FASSET)).to.eq(0)
    expect(await manager.allowFlareAssetPairsWithoutPlugin(ASSET_TYPE_FASSET)).to.eq(0)

    await expect(manager.setAllowFlareAssetPairsWithoutPlugin(ASSET_TYPE_FASSET, 1)).to.be.revertedWith(
      'BlazeSwap: ALREADY_SET'
    )
  })

  it('setFactory', async () => {
    await expect(manager.connect(other).setFactory(other.address)).to.be.revertedWith('Configurable: FORBIDDEN')
    await expect(manager.setFactory(other.address)).not.to.be.reverted
    expect(await manager.factory()).not.to.eq(constants.AddressZero)
    await expect(manager.setFactory(other.address)).to.be.revertedWith('BlazeSwap: ALREADY_SET')
  })

  it('getTokenType', async () => {
    expect(await manager.getTokenType(other.address)).to.eq(ASSET_TYPE_GENERIC)
    expect(await manager.getTokenType(await registry.getContractAddressByName('WNat'))).to.eq(ASSET_TYPE_WNAT)
    const flareAsset = await deployContract(wallet, FlareAssetTest, [1])

    expect(await manager.getTokenType(flareAsset.address)).to.eq(ASSET_TYPE_GENERIC) // Not registered in Flare Asset Registry
    await flareAssetRegistry.addFlareAsset(flareAsset.address, 'f-asset', 0)
    expect(await manager.getTokenType(flareAsset.address)).to.eq(ASSET_TYPE_FASSET)
  })

  it('setPluginsForPair', async () => {
    await expect(manager.setPluginsForPair(other.address, other.address, other.address)).to.be.revertedWith(
      'BlazeSwap: FORBIDDEN'
    )
  })
})
