import { waffle } from 'hardhat'
import { expect } from 'chai'
import { BigNumber, constants } from 'ethers'

import { getCreate2Address } from './shared/utilities'
import { factoryFixture } from './shared/fixtures'

import BlazeSwapPair from '../../artifacts/contracts/core/BlazeSwapPair.sol/BlazeSwapPair.json'
import FlareAssetTest from '../../artifacts/contracts/core/test/FlareAssetTest.sol/FlareAssetTest.json'
import BlazeSwapFlareAssetRewardPlugin from '../../artifacts/contracts/core/BlazeSwapFlareAssetRewardPlugin.sol/BlazeSwapFlareAssetRewardPlugin.json'
import {
  FlareAssetRegistry,
  FlareContractRegistry,
  IBlazeSwapFactory,
  IBlazeSwapFlareAssetReward__factory,
  IBlazeSwapManager,
  IBlazeSwapPair__factory,
} from '../../typechain-types'

const { createFixtureLoader, deployContract } = waffle

describe('BlazeSwapFactory', () => {
  const provider = waffle.provider
  const [wallet, other] = provider.getWallets()
  const loadFixture = createFixtureLoader([wallet, other], provider)

  let registry: FlareContractRegistry
  let flareAssetRegistry: FlareAssetRegistry
  let manager: IBlazeSwapManager
  let factory: IBlazeSwapFactory
  beforeEach(async () => {
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
    expect(receipt.gasUsed).to.eq(4331455)
  })

  it('createPairWithWNat:gas', async () => {
    const tokens: [string, string] = [
      '0x0000000000000000000000000000000000000001',
      await registry.getContractAddressByName('WNat'),
    ]
    const tx = await factory.createPair(...tokens)
    const receipt = await tx.wait()
    expect(receipt.gasUsed).to.eq(5715081)
  })

  it('createPairWithFlareAsset:upgradeFlareAssetPair', async () => {
    const flareAsset = await deployContract(wallet, FlareAssetTest, [0])
    const tokens = ['0x1000000000000000000000000000000000000000', flareAsset.address]
    await registry.setContractAddress('FlareAssetRegistry', flareAssetRegistry.address, [])
    await flareAssetRegistry.addFlareAsset(tokens[1], 2)
    await expect(factory.createPair(tokens[0], tokens[1])).to.be.revertedWith('BlazeSwap: FASSET_UNSUPPORTED')
    await manager.setAllowFlareAssetPairsWithoutPlugin(true)
    await expect(factory.createPair(tokens[0], tokens[1])).not.to.be.reverted

    const bytecode = BlazeSwapPair.bytecode
    const create2Address = getCreate2Address(factory.address, tokens as [string, string], bytecode)
    expect(await factory.isFlareAssetPairWithoutPlugin(create2Address)).to.eq(true)

    const flareAssetReward = await deployContract(wallet, BlazeSwapFlareAssetRewardPlugin, [
      5,
      'FlareAsset Reward Plugin',
    ])
    await manager.setFlareAssetRewardPlugin(flareAssetReward.address)

    await expect(factory.upgradeFlareAssetPair(create2Address)).not.to.be.reverted

    expect(await manager.allowFlareAssetPairsWithoutPlugin()).to.eq(false)
    expect(await factory.isFlareAssetPairWithoutPlugin(create2Address)).to.eq(false)
    await expect(factory.upgradeFlareAssetPair(create2Address)).to.be.revertedWith('BlazeSwap: UPGRADE_NOT_NEEDED')

    const flareAssetPair = IBlazeSwapFlareAssetReward__factory.connect(create2Address, wallet)
    expect(await flareAssetPair.flareAssets()).to.deep.eq([flareAsset.address])
    expect(await flareAssetPair.flareAssetConfigParams()).to.deep.eq([BigNumber.from(10), 'FlareAsset Reward Plugin'])
  })

  it('createPairWithFlareAsset:full', async () => {
    const flareAsset = await deployContract(wallet, FlareAssetTest, [0])
    const tokens = ['0x1000000000000000000000000000000000000000', flareAsset.address]
    await registry.setContractAddress('FlareAssetRegistry', flareAssetRegistry.address, [])
    await flareAssetRegistry.addFlareAsset(tokens[1], 2)

    const bytecode = BlazeSwapPair.bytecode
    const create2Address = getCreate2Address(factory.address, tokens as [string, string], bytecode)

    const flareAssetReward = await deployContract(wallet, BlazeSwapFlareAssetRewardPlugin, [
      5,
      'FlareAsset Reward Plugin',
    ])
    await manager.setFlareAssetRewardPlugin(flareAssetReward.address)

    await expect(factory.createPair(tokens[0], tokens[1])).not.to.be.reverted

    const flareAssetPair = IBlazeSwapFlareAssetReward__factory.connect(create2Address, wallet)
    expect(await flareAssetPair.flareAssets()).to.deep.eq([flareAsset.address])
    expect(await flareAssetPair.flareAssetConfigParams()).to.deep.eq([BigNumber.from(10), 'FlareAsset Reward Plugin'])

    expect(await factory.isFlareAssetPairWithoutPlugin(create2Address)).to.eq(false)
    await expect(factory.upgradeFlareAssetPair(create2Address)).to.be.revertedWith('BlazeSwap: UPGRADE_NOT_NEEDED')
  })
})
