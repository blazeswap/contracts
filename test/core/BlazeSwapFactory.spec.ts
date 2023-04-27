import hre from 'hardhat'
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers'
import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { expect } from 'chai'
import { BigNumber, constants } from 'ethers'

import { getCreate2Address } from './shared/utilities'
import { ASSET_TYPE_FASSET, ASSET_TYPE_LAYERCAKE, factoryFixture } from './shared/fixtures'

import BlazeSwapPair from '../../artifacts/contracts/core/BlazeSwapPair.sol/BlazeSwapPair.json'
import {
  BlazeSwapPair__factory,
  FlareAssetRegistry,
  FlareContractRegistry,
  IBlazeSwapFactory,
  IBlazeSwapFlareAssetReward__factory,
  IBlazeSwapManager,
} from '../../typechain-types'

import { deployContract } from '../shared/shared/utilities'

describe('BlazeSwapFactory', () => {
  let wallet: SignerWithAddress
  let other: SignerWithAddress

  let registry: FlareContractRegistry
  let flareAssetRegistry: FlareAssetRegistry
  let manager: IBlazeSwapManager
  let factory: IBlazeSwapFactory
  beforeEach(async () => {
    [wallet, other] = await hre.ethers.getSigners()
    const fixture = await loadFixture(factoryFixture)
    registry = fixture.registry
    flareAssetRegistry = fixture.flareAssetRegistry
    manager = fixture.manager
    factory = fixture.factory
  })

  it('manager, configSetter, allPairsLength', async () => {
    expect(await factory.manager()).not.to.eq(constants.AddressZero)
    expect(await factory.allPairsLength()).to.eq(0)
  })

  it('createPairGeneric:gas', async () => {
    const tokens: [string, string] = [
      '0x1000000000000000000000000000000000000001',
      '0x1000000000000000000000000000000000000002',
    ]
    const tx = await factory.createPair(...tokens)
    const receipt = await tx.wait()
    expect(receipt.gasUsed).to.eq(4746971)
  })

  it('createPairWithWNat:gas', async () => {
    const tokens: [string, string] = [
      '0x0000000000000000000000000000000000000001',
      await registry.getContractAddressByName('WNat'),
    ]
    const tx = await factory.createPair(...tokens)
    const receipt = await tx.wait()
    expect(receipt.gasUsed).to.eq(5923734)
  })

  it('createPairWithFlareAsset:upgradeFlareAssetPair', async () => {
    const flareAsset = await deployContract('FlareAssetTest', [0])
    const tokens = ['0x1000000000000000000000000000000000000000', flareAsset.address]
    await flareAssetRegistry.addFlareAsset(tokens[1], 'f-asset', 2)
    await expect(factory.createPair(tokens[0], tokens[1])).to.be.revertedWith('BlazeSwap: FASSET_UNSUPPORTED')
    await manager.setAllowFlareAssetPairsWithoutPlugin(ASSET_TYPE_FASSET, 1) // YesUpgradable
    await expect(factory.createPair(tokens[0], tokens[1])).not.to.be.reverted

    const bytecode = BlazeSwapPair.bytecode
    const create2Address = getCreate2Address(factory.address, tokens as [string, string], bytecode)
    expect(await manager.isFlareAssetPairWithoutPlugin(create2Address)).to.eq(true)

    const flareAssetReward = await deployContract('BlazeSwapFlareAssetRewardPlugin', [5, 'FlareAsset Reward Plugin'])
    await manager.setFlareAssetRewardPlugin(ASSET_TYPE_FASSET, flareAssetReward.address)

    const pair = BlazeSwapPair__factory.connect(create2Address, wallet)
    await expect(pair.addPlugin(constants.AddressZero)).to.be.revertedWith('BlazeSwap: FORBIDDEN')

    await expect(manager.upgradeFlareAssetPair(create2Address)).not.to.be.reverted

    expect(await manager.allowFlareAssetPairsWithoutPlugin(ASSET_TYPE_FASSET)).to.eq(0) // No
    expect(await manager.isFlareAssetPairWithoutPlugin(create2Address)).to.eq(false)
    await expect(manager.upgradeFlareAssetPair(create2Address)).to.be.revertedWith('BlazeSwap: UPGRADE_NOT_NEEDED')

    const flareAssetPair = IBlazeSwapFlareAssetReward__factory.connect(create2Address, wallet)
    expect(await flareAssetPair.flareAssets()).to.deep.eq([flareAsset.address])
    expect(await flareAssetPair.flareAssetConfigParams()).to.deep.eq([BigNumber.from(10), 'FlareAsset Reward Plugin'])
  })

  it('createPairWithTwoFlareAssets:upgradeFlareAssetPair', async () => {
    const flareAsset1 = await deployContract('FlareAssetTest', [0])
    const flareAsset2 = await deployContract('FlareAssetTest', [0])
    const tokens = [flareAsset1.address, flareAsset2.address]
    await flareAssetRegistry.addFlareAsset(tokens[0], 'f-asset', 2)
    await flareAssetRegistry.addFlareAsset(tokens[1], 'layer cake', 2)
    await manager.setAllowFlareAssetPairsWithoutPlugin(ASSET_TYPE_FASSET, 1) // YesUpgradable
    await expect(factory.createPair(tokens[0], tokens[1])).to.be.revertedWith('BlazeSwap: FASSET_UNSUPPORTED')
    await manager.setAllowFlareAssetPairsWithoutPlugin(ASSET_TYPE_LAYERCAKE, 1) // YesUpgradable
    await expect(factory.createPair(tokens[0], tokens[1])).not.to.be.reverted

    const bytecode = BlazeSwapPair.bytecode
    const create2Address = getCreate2Address(factory.address, tokens as [string, string], bytecode)
    expect(await manager.isFlareAssetPairWithoutPlugin(create2Address)).to.eq(true)

    await expect(manager.upgradeFlareAssetPair(create2Address)).not.to.be.reverted

    const flareAssetReward = await deployContract('BlazeSwapFlareAssetRewardPlugin', [5, 'FlareAsset Reward Plugin'])
    await manager.setFlareAssetRewardPlugin(ASSET_TYPE_FASSET, flareAssetReward.address)
    await expect(manager.upgradeFlareAssetPair(create2Address)).not.to.be.reverted

    expect(await manager.isFlareAssetPairWithoutPlugin(create2Address)).to.eq(true)

    await manager.setFlareAssetRewardPlugin(ASSET_TYPE_LAYERCAKE, flareAssetReward.address)
    await expect(manager.upgradeFlareAssetPair(create2Address)).not.to.be.reverted

    expect(await manager.isFlareAssetPairWithoutPlugin(create2Address)).to.eq(false)
    await expect(manager.upgradeFlareAssetPair(create2Address)).to.be.revertedWith('BlazeSwap: UPGRADE_NOT_NEEDED')
  })

  it('createPairWithFlareAsset:noPluginNeeded', async () => {
    const flareAsset = await deployContract('FlareAssetTest', [0])
    const tokens = ['0x1000000000000000000000000000000000000000', flareAsset.address]
    await flareAssetRegistry.addFlareAsset(tokens[1], 'f-asset', 2)
    await manager.setAllowFlareAssetPairsWithoutPlugin(ASSET_TYPE_FASSET, 2) // YesNoPluginNeeded
    await expect(factory.createPair(tokens[0], tokens[1])).not.to.be.reverted

    const bytecode = BlazeSwapPair.bytecode
    const create2Address = getCreate2Address(factory.address, tokens as [string, string], bytecode)
    expect(await manager.isFlareAssetPairWithoutPlugin(create2Address)).to.eq(false)

    await expect(manager.upgradeFlareAssetPair(create2Address)).to.be.revertedWith('BlazeSwap: UPGRADE_NOT_NEEDED')
  })

  it('createPairWithFlareAsset:full', async () => {
    const flareAsset = await deployContract('FlareAssetTest', [0])
    const tokens = ['0x1000000000000000000000000000000000000000', flareAsset.address]
    await flareAssetRegistry.addFlareAsset(tokens[1], 'f-asset', 2)

    const bytecode = BlazeSwapPair.bytecode
    const create2Address = getCreate2Address(factory.address, tokens as [string, string], bytecode)

    const flareAssetReward = await deployContract('BlazeSwapFlareAssetRewardPlugin', [5, 'FlareAsset Reward Plugin'])
    await manager.setFlareAssetRewardPlugin(ASSET_TYPE_FASSET, flareAssetReward.address)

    await expect(factory.createPair(tokens[0], tokens[1])).not.to.be.reverted

    const flareAssetPair = IBlazeSwapFlareAssetReward__factory.connect(create2Address, wallet)
    expect(await flareAssetPair.flareAssets()).to.deep.eq([flareAsset.address])
    expect(await flareAssetPair.flareAssetConfigParams()).to.deep.eq([BigNumber.from(10), 'FlareAsset Reward Plugin'])

    expect(await manager.isFlareAssetPairWithoutPlugin(create2Address)).to.eq(false)
    await expect(manager.upgradeFlareAssetPair(create2Address)).to.be.revertedWith('BlazeSwap: UPGRADE_NOT_NEEDED')
  })
})
