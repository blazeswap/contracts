import { waffle } from 'hardhat'
import { expect } from 'chai'
import { constants } from 'ethers'

import { managerFixture } from './shared/fixtures'

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

  it('executorManager, rewardsPlugin, delegationPlugin, ftsoRewardPlugin, flareAssetRewardPlugin, airdropPlugin, allowFlareAssetPairsWithoutPlugin', async () => {
    expect(await manager.executorManager()).not.to.eq(constants.AddressZero)
    expect(await manager.rewardsPlugin()).not.to.eq(constants.AddressZero)
    expect(await manager.delegationPlugin()).not.to.eq(constants.AddressZero)
    expect(await manager.ftsoRewardPlugin()).not.to.eq(constants.AddressZero)
    expect(await manager.flareAssetRewardPlugin()).to.eq(constants.AddressZero)
    expect(await manager.airdropPlugin()).not.to.eq(constants.AddressZero)
    expect(await manager.allowFlareAssetPairsWithoutPlugin()).to.eq(false)
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
    await expect(manager.connect(other).setAllowFlareAssetPairsWithoutPlugin(true)).to.be.revertedWith(
      'Configurable: FORBIDDEN'
    )
    await manager.setAllowFlareAssetPairsWithoutPlugin(true)
    expect(await manager.allowFlareAssetPairsWithoutPlugin()).to.eq(true)
    await manager.setAllowFlareAssetPairsWithoutPlugin(false)
    expect(await manager.allowFlareAssetPairsWithoutPlugin()).to.eq(false)
  })

  it('setFlareAssetRewardPlugin', async () => {
    const flareAssetReward = await deployContract(wallet, BlazeSwapFlareAssetRewardPlugin, [
      5,
      'FlareAsset Reward Plugin',
    ])

    await expect(manager.connect(other).setFlareAssetRewardPlugin(flareAssetReward.address)).to.be.revertedWith(
      'Configurable: FORBIDDEN'
    )
    await manager.setFlareAssetRewardPlugin(flareAssetReward.address)
    expect(await manager.flareAssetRewardPlugin()).to.eq(flareAssetReward.address)
    await expect(manager.setFlareAssetRewardPlugin(flareAssetReward.address)).to.be.revertedWith(
      'BlazeSwap: ALREADY_SET'
    )
  })

  it('flareAssetSupport', async () => {
    expect(await manager.flareAssetSupport()).to.eq(0) // None
    await manager.setAllowFlareAssetPairsWithoutPlugin(true)
    expect(await manager.flareAssetSupport()).to.eq(0) // None
    await manager.setAllowFlareAssetPairsWithoutPlugin(false)
    await registry.setContractAddress('FlareAssetRegistry', flareAssetRegistry.address, [])
    expect(await manager.flareAssetSupport()).to.eq(0) // None
    await manager.setAllowFlareAssetPairsWithoutPlugin(true)
    expect(await manager.flareAssetSupport()).to.eq(1) // Minimal
    const flareAssetReward = await deployContract(wallet, BlazeSwapFlareAssetRewardPlugin, [
      5,
      'FlareAsset Reward Plugin',
    ])
    await manager.setFlareAssetRewardPlugin(flareAssetReward.address)
    expect(await manager.flareAssetSupport()).to.eq(2) // Full
  })

  it('getTokenType', async () => {
    expect(await manager.getTokenType(other.address)).to.eq(0) // Generic
    expect(await manager.getTokenType(await registry.getContractAddressByName('WNat'))).to.eq(1) // WNat
    const flareAsset = await deployContract(wallet, FlareAssetTest, [1])

    await registry.setContractAddress('FlareAssetRegistry', flareAssetRegistry.address, [])

    expect(await manager.getTokenType(flareAsset.address)).to.eq(0) // Not registered in Flare Asset Registry
    await flareAssetRegistry.addFlareAsset(flareAsset.address, 0)
    expect(await manager.getTokenType(flareAsset.address)).to.eq(2) // FlareAsset
  })
})
