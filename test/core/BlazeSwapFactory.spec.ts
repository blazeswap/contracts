import { waffle } from 'hardhat'
import { expect } from 'chai'
import { BigNumber, constants } from 'ethers'

import { getCreate2Address } from './shared/utilities'
import { factoryFixture } from './shared/fixtures'

import BlazeSwapPair from '../../artifacts/contracts/core/BlazeSwapPair.sol/BlazeSwapPair.json'
import FAssetTest from '../../artifacts/contracts/core/test/FAssetTest.sol/FAssetTest.json'
import AssetManagerController from '../../artifacts/contracts/core/test/AssetManagerController.sol/AssetManagerController.json'
import BlazeSwapFAssetRewardPlugin from '../../artifacts/contracts/core/BlazeSwapFAssetRewardPlugin.sol/BlazeSwapFAssetRewardPlugin.json'
import {
  IBlazeSwapFactory,
  IBlazeSwapFAssetReward__factory,
  IBlazeSwapManager,
  IBlazeSwapPair__factory,
} from '../../typechain-types'

const { createFixtureLoader, deployContract } = waffle

describe('BlazeSwapFactory', () => {
  const provider = waffle.provider
  const [wallet, other] = provider.getWallets()
  const loadFixture = createFixtureLoader([wallet, other], provider)

  let manager: IBlazeSwapManager
  let factory: IBlazeSwapFactory
  let TEST_ADDRESSES: [string, string]
  beforeEach(async () => {
    const fixture = await loadFixture(factoryFixture)
    manager = fixture.manager
    factory = fixture.factory
    TEST_ADDRESSES = ['0x1000000000000000000000000000000000000000', await manager.wNat()]
  })

  it('manager, configSetter, allPairsLength', async () => {
    expect(await factory.manager()).not.to.eq(constants.AddressZero)
    expect(await factory.allPairsLength()).to.eq(0)
  })

  async function createPair(tokens: [string, string]) {
    const bytecode = BlazeSwapPair.bytecode
    const create2Address = getCreate2Address(factory.address, tokens, bytecode)
    await expect(factory.createPair(...tokens))
      .to.emit(factory, 'PairCreated')
      .withArgs(TEST_ADDRESSES[0], TEST_ADDRESSES[1], create2Address, BigNumber.from(1))

    await expect(factory.createPair(tokens[0], tokens[1])).to.be.reverted // BlazeSwap: PAIR_EXISTS
    await expect(factory.createPair(tokens[1], tokens[0])).to.be.reverted // BlazeSwap: PAIR_EXISTS
    expect(await factory.getPair(tokens[0], tokens[1])).to.eq(create2Address)
    expect(await factory.getPair(tokens[1], tokens[0])).to.eq(create2Address)
    expect(await factory.allPairs(0)).to.eq(create2Address)
    expect(await factory.allPairsLength()).to.eq(1)

    const pair = IBlazeSwapPair__factory.connect(create2Address, wallet)
    expect(await pair.factory()).to.eq(factory.address)
    expect(await pair.token0()).to.eq(TEST_ADDRESSES[0])
    expect(await pair.token1()).to.eq(TEST_ADDRESSES[1])
  }

  it('createPair', async () => {
    await createPair(TEST_ADDRESSES)
  })

  it('createPair:reverse', async () => {
    await createPair(TEST_ADDRESSES.slice().reverse() as [string, string])
  })

  it('createPair:gas', async () => {
    const tx = await factory.createPair(...TEST_ADDRESSES)
    const receipt = await tx.wait()
    expect(receipt.gasUsed).to.eq(6063017)
  })

  it('createPairWithFakeFAsset', async () => {
    const fAsset = await deployContract(wallet, FAssetTest, [other.address, 0])
    const tokens = ['0x1000000000000000000000000000000000000000', fAsset.address]
    await expect(factory.createPair(tokens[0], tokens[1])).to.be.revertedWith('BlazeSwap: FASSET_UNSUPPORTED')
    const controller = await deployContract(wallet, AssetManagerController)
    await manager.setAssetManagerController(controller.address)
    await expect(factory.createPair(tokens[0], tokens[1])).not.to.be.reverted
    const bytecode = BlazeSwapPair.bytecode
    const create2Address = getCreate2Address(factory.address, tokens as [string, string], bytecode)
    await expect(factory.upgradeFAssetPair(create2Address)).to.be.revertedWith('BlazeSwap: UPGRADE_NOT_NEEDED')
  })

  it('createPairWithFAsset:upgradeFAssetPair', async () => {
    const fAsset = await deployContract(wallet, FAssetTest, [other.address, 0])
    const tokens = ['0x1000000000000000000000000000000000000000', fAsset.address]
    const controller1 = await deployContract(wallet, AssetManagerController)
    await manager.setAssetManagerController(controller1.address)
    const controller2 = await deployContract(wallet, AssetManagerController)
    await controller1.replaceWith(controller2.address)
    await controller2.addAssetManager(other.address)
    await expect(factory.createPair(tokens[0], tokens[1])).to.be.revertedWith('BlazeSwap: FASSET_UNSUPPORTED')
    await manager.setAllowFAssetPairsWithoutPlugin(true)
    await expect(factory.createPair(tokens[0], tokens[1])).not.to.be.reverted

    const bytecode = BlazeSwapPair.bytecode
    const create2Address = getCreate2Address(factory.address, tokens as [string, string], bytecode)
    expect(await factory.isFAssetPairWithoutPlugin(create2Address)).to.eq(true)

    const fAssetReward = await deployContract(wallet, BlazeSwapFAssetRewardPlugin, [5, 'FAsset Reward Plugin'])
    await manager.setFAssetsRewardPlugin(fAssetReward.address)

    await expect(factory.upgradeFAssetPair(create2Address)).not.to.be.reverted

    expect(await manager.allowFAssetPairsWithoutPlugin()).to.eq(false)
    expect(await factory.isFAssetPairWithoutPlugin(create2Address)).to.eq(false)
    await expect(factory.upgradeFAssetPair(create2Address)).to.be.revertedWith('BlazeSwap: UPGRADE_NOT_NEEDED')

    const fAssetPair = IBlazeSwapFAssetReward__factory.connect(create2Address, wallet)
    expect(await fAssetPair.fAssets()).to.deep.eq([fAsset.address])
    expect(await fAssetPair.fAssetConfigParams()).to.deep.eq([BigNumber.from(10), 'FAsset Reward Plugin'])
  })

  it('createPairWithFAsset:full', async () => {
    const fAsset = await deployContract(wallet, FAssetTest, [other.address, 0])
    const tokens = ['0x1000000000000000000000000000000000000000', fAsset.address]
    const controller = await deployContract(wallet, AssetManagerController)
    await manager.setAssetManagerController(controller.address)
    await controller.addAssetManager(other.address)

    const bytecode = BlazeSwapPair.bytecode
    const create2Address = getCreate2Address(factory.address, tokens as [string, string], bytecode)

    const fAssetReward = await deployContract(wallet, BlazeSwapFAssetRewardPlugin, [5, 'FAsset Reward Plugin'])
    await manager.setFAssetsRewardPlugin(fAssetReward.address)

    await expect(factory.createPair(tokens[0], tokens[1])).not.to.be.reverted

    const fAssetPair = IBlazeSwapFAssetReward__factory.connect(create2Address, wallet)
    expect(await fAssetPair.fAssets()).to.deep.eq([fAsset.address])
    expect(await fAssetPair.fAssetConfigParams()).to.deep.eq([BigNumber.from(10), 'FAsset Reward Plugin'])

    expect(await factory.isFAssetPairWithoutPlugin(create2Address)).to.eq(false)
    await expect(factory.upgradeFAssetPair(create2Address)).to.be.revertedWith('BlazeSwap: UPGRADE_NOT_NEEDED')
  })
})
