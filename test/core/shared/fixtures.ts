import hre from 'hardhat'
import { BigNumber, constants } from 'ethers'
import { keccak256, toUtf8Bytes } from 'ethers/lib/utils'

import { expandTo18Decimals } from './utilities'

import FlareContractRegistryABI from '../../../artifacts/contracts/core/test/FlareContractRegistry.sol/FlareContractRegistry.json'
import {
  IBlazeSwapBaseFactory,
  IBlazeSwapBaseManager,
  IBlazeSwapBasePair,
  IBlazeSwapBasePair__factory,
  IBlazeSwapFactory,
  IBlazeSwapManager,
  IBlazeSwapPair,
  IBlazeSwapPair__factory,
  IERC20,
  FtsoManager,
  FtsoRewardManager,
  IWNat,
  DistributionToDelegators,
  FlareAssetRegistry,
  FlareContractRegistry,
  FlareContractRegistry__factory,
  IERC20Metadata,
} from '../../../typechain-types'

import { deployContract } from '../../shared/shared/utilities'

const FLARE_CONTRACT_REGISTRY = '0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019'

export const ASSET_TYPE_GENERIC = constants.HashZero
export const ASSET_TYPE_WNAT = keccak256(toUtf8Bytes('wrapped native'))
export const ASSET_TYPE_FASSET = keccak256(toUtf8Bytes('f-asset'))
export const ASSET_TYPE_LAYERCAKE = keccak256(toUtf8Bytes('layer cake')) // fake

export const TEST_ADDRESS = [
  '0x0000000000000000000000000000000000000001',
  '0x0000000000000000000000000000000000000002',
  '0x0000000000000000000000000000000000000003',
  '0x0000000000000000000000000000000000000004',
  '0x0000000000000000000000000000000000000005',
]

export const TEST_PROVIDERS = [TEST_ADDRESS[0], TEST_ADDRESS[1], TEST_ADDRESS[2]]

interface FlareFixture {
  registry: FlareContractRegistry
  wNat: IWNat
  ftsoManager: FtsoManager
  ftsoRewardManager: FtsoRewardManager
  distribution: DistributionToDelegators
  flareAssetRegistry: FlareAssetRegistry
}

export async function flareFixture(): Promise<FlareFixture> {
  const [wallet] = await hre.ethers.getSigners()
  await hre.ethers.provider.send('hardhat_setCode', [
    FLARE_CONTRACT_REGISTRY,
    FlareContractRegistryABI.deployedBytecode,
  ])
  const registry = FlareContractRegistry__factory.connect(FLARE_CONTRACT_REGISTRY, wallet)
  const wNat = (await deployContract('WNAT')) as IWNat
  const ftsoManager = (await deployContract('FtsoManager', [constants.AddressZero])) as FtsoManager
  const ftsoRewardManager = (await deployContract('FtsoRewardManager', [constants.AddressZero])) as FtsoRewardManager
  const distribution = (await deployContract('DistributionToDelegators')) as DistributionToDelegators
  const flareAssetRegistry = (await deployContract('FlareAssetRegistry')) as FlareAssetRegistry

  const updatableContracts = [
    ftsoManager.address,
    ftsoRewardManager.address,
    distribution.address,
    flareAssetRegistry.address,
  ]
  await registry.setContractAddress('WNat', wNat.address, updatableContracts)
  await registry.setContractAddress('FtsoManager', ftsoManager.address, updatableContracts)
  await registry.setContractAddress('FtsoRewardManager', ftsoRewardManager.address, updatableContracts)
  await registry.setContractAddress('DistributionToDelegators', distribution.address, [])
  await registry.setContractAddress('FlareAssetRegistry', flareAssetRegistry.address, [])

  await ftsoManager.initialize()
  await ftsoRewardManager.initialize()
  await ftsoRewardManager.activate()
  return { registry, wNat, ftsoManager, ftsoRewardManager, distribution, flareAssetRegistry }
}

interface BaseManagerFixture {
  manager: IBlazeSwapBaseManager
}

interface ManagerFixture extends FlareFixture {
  manager: IBlazeSwapManager
}

export async function baseManagerFixture(): Promise<BaseManagerFixture> {
  const [wallet] = await hre.ethers.getSigners()
  const manager = (await deployContract('BlazeSwapBaseManager', [wallet.address])) as IBlazeSwapBaseManager
  return { manager }
}

export async function managerFixture(): Promise<ManagerFixture> {
  const { registry, wNat, ftsoManager, ftsoRewardManager, distribution, flareAssetRegistry } = await flareFixture()

  const [wallet] = await hre.ethers.getSigners()
  const manager = (await deployContract('BlazeSwapManager', [wallet.address])) as IBlazeSwapManager
  const rewardsPlugin = await deployContract('BlazeSwapRewardsPlugin', [manager.address])
  await manager.setRewardsPlugin(rewardsPlugin.address)
  const delegationPlugin = await deployContract('BlazeSwapDelegationPlugin', [manager.address])
  await delegationPlugin.setInitialProvider(TEST_PROVIDERS[0])
  await delegationPlugin.setMaxDelegatesByPercent(2)
  await manager.setDelegationPlugin(delegationPlugin.address)
  const ftsoRewardPlugin = await deployContract('BlazeSwapFtsoRewardPlugin')
  await manager.setFtsoRewardPlugin(ftsoRewardPlugin.address)
  const airdropPlugin = await deployContract('BlazeSwapAirdropPlugin')
  await manager.setAirdropPlugin(airdropPlugin.address)
  return {
    registry,
    wNat,
    ftsoManager,
    ftsoRewardManager,
    distribution,
    flareAssetRegistry,
    manager,
  }
}

interface BaseFactoryFixture extends BaseManagerFixture {
  factory: IBlazeSwapBaseFactory
}

interface FactoryFixture extends ManagerFixture {
  factory: IBlazeSwapFactory
}

export async function baseFactoryFixture(): Promise<BaseFactoryFixture> {
  const { manager } = await baseManagerFixture()
  const factory = (await deployContract('BlazeSwapBaseFactory', [manager.address])) as IBlazeSwapBaseFactory
  return { manager, factory }
}

export async function factoryFixture(): Promise<FactoryFixture> {
  const { registry, wNat, ftsoManager, ftsoRewardManager, distribution, flareAssetRegistry, manager } =
    await managerFixture()

  const factory = (await deployContract('BlazeSwapFactory', [manager.address])) as IBlazeSwapFactory
  await manager.setFactory(factory.address)
  return {
    registry,
    wNat,
    ftsoManager,
    ftsoRewardManager,
    distribution,
    flareAssetRegistry,
    manager,
    factory,
  }
}

interface BasePairFixture extends BaseFactoryFixture {
  token0: IERC20 & IERC20Metadata
  token1: IERC20 & IERC20Metadata
  pair: IBlazeSwapBasePair
}

interface PairFixture extends FactoryFixture {
  token0: IERC20 & IERC20Metadata
  token1: IERC20 & IERC20Metadata
  pair: IBlazeSwapPair
}

export async function basePairFixture(): Promise<BasePairFixture> {
  const { manager, factory } = await baseFactoryFixture()

  const tokenA = (await deployContract('ERC20Test', [expandTo18Decimals(10000)])) as IERC20 & IERC20Metadata
  const tokenB = (await deployContract('ERC20Test', [expandTo18Decimals(10000)])) as IERC20 & IERC20Metadata

  await factory.createPair(tokenA.address, tokenB.address)
  const pairAddress = await factory.getPair(tokenA.address, tokenB.address)
  const pair = IBlazeSwapBasePair__factory.connect(pairAddress, factory.signer)

  const token0Address = await pair.token0()
  const token0 = tokenA.address === token0Address ? tokenA : tokenB
  const token1 = tokenA.address === token0Address ? tokenB : tokenA

  return { manager, factory, token0, token1, pair }
}

export async function pairFixture(): Promise<PairFixture> {
  const { registry, wNat, ftsoManager, ftsoRewardManager, distribution, flareAssetRegistry, manager, factory } =
    await factoryFixture()

  const tokenA = (await deployContract('ERC20Test', [expandTo18Decimals(10000)])) as IERC20 & IERC20Metadata
  const tokenB = (await deployContract('ERC20Test', [expandTo18Decimals(10000)])) as IERC20 & IERC20Metadata

  await factory.createPair(tokenA.address, tokenB.address)
  const pairAddress = await factory.getPair(tokenA.address, tokenB.address)
  const pair = IBlazeSwapPair__factory.connect(pairAddress, factory.signer)

  const token0Address = await pair.token0()
  const token0 = tokenA.address === token0Address ? tokenA : tokenB
  const token1 = tokenA.address === token0Address ? tokenB : tokenA

  return {
    registry,
    wNat,
    ftsoManager,
    ftsoRewardManager,
    distribution,
    flareAssetRegistry,
    manager,
    factory,
    token0,
    token1,
    pair,
  }
}

export async function pairWNatFixture(): Promise<PairFixture> {
  const { registry, wNat, ftsoManager, ftsoRewardManager, distribution, flareAssetRegistry, manager, factory } =
    await factoryFixture()

  const [wallet] = await hre.ethers.getSigners()

  // provide FtsoRewardManager supply
  await wallet.sendTransaction({ to: ftsoRewardManager.address, value: expandTo18Decimals(1000000) })

  const tokenA = (await deployContract('ERC20Test', [expandTo18Decimals(10000)])) as IERC20 & IERC20Metadata
  const tokenB = wNat as IERC20 & IERC20Metadata
  // provide WNAT supply
  await wNat.deposit({ value: expandTo18Decimals(10000) })

  await factory.createPair(tokenA.address, tokenB.address)
  const pairAddress = await factory.getPair(tokenA.address, tokenB.address)
  const pair = IBlazeSwapPair__factory.connect(pairAddress, factory.signer)

  const token0Address = await pair.token0()
  const token0 = tokenA.address === token0Address ? tokenA : tokenB
  const token1 = tokenA.address === token0Address ? tokenB : tokenA

  return {
    registry,
    wNat,
    ftsoManager,
    ftsoRewardManager,
    distribution,
    flareAssetRegistry,
    manager,
    factory,
    token0,
    token1,
    pair,
  }
}

export async function pairFlareAssetFixture(): Promise<PairFixture> {
  const { registry, wNat, ftsoManager, ftsoRewardManager, distribution, flareAssetRegistry, manager, factory } =
    await factoryFixture()

  const [wallet] = await hre.ethers.getSigners()

  await manager.setAllowFlareAssetPairsWithoutPlugin(ASSET_TYPE_FASSET, 1) // YesUpgradable

  // provide FtsoRewardManager supply
  await wallet.sendTransaction({ to: ftsoRewardManager.address, value: expandTo18Decimals(1000000) })

  const tokenA = (await deployContract('ERC20Test', [expandTo18Decimals(10000)])) as IERC20 & IERC20Metadata
  const tokenB = (await deployContract('FlareAssetTest', [expandTo18Decimals(10000)])) as IERC20 & IERC20Metadata
  await flareAssetRegistry.addFlareAsset(tokenB.address, 'f-asset', 1)

  await factory.createPair(tokenA.address, tokenB.address)
  const pairAddress = await factory.getPair(tokenA.address, tokenB.address)
  const pair = IBlazeSwapPair__factory.connect(pairAddress, wallet)

  const token0Address = await pair.token0()
  const token0 = tokenA.address === token0Address ? tokenA : tokenB
  const token1 = tokenA.address === token0Address ? tokenB : tokenA

  return {
    registry,
    wNat,
    ftsoManager,
    ftsoRewardManager,
    distribution,
    flareAssetRegistry,
    manager,
    factory,
    token0,
    token1,
    pair,
  }
}

export async function pairWNatFlareAssetFixture(): Promise<PairFixture> {
  const { registry, wNat, ftsoManager, ftsoRewardManager, distribution, flareAssetRegistry, manager, factory } =
    await factoryFixture()

  const [wallet] = await hre.ethers.getSigners()

  await manager.setAllowFlareAssetPairsWithoutPlugin(ASSET_TYPE_FASSET, 1) // YesUpgradable

  // provide FtsoRewardManager supply
  await wallet.sendTransaction({ to: ftsoRewardManager.address, value: expandTo18Decimals(1000000) })

  const tokenA = (await deployContract('FlareAssetTest', [expandTo18Decimals(10000)])) as IERC20 & IERC20Metadata
  await flareAssetRegistry.addFlareAsset(tokenA.address, 'f-asset', 3)
  const tokenB = wNat as IERC20 & IERC20Metadata
  // provide WNAT supply
  await wNat.deposit({ value: expandTo18Decimals(10000) })

  await factory.createPair(tokenA.address, tokenB.address)
  const pairAddress = await factory.getPair(tokenA.address, tokenB.address)
  const pair = IBlazeSwapPair__factory.connect(pairAddress, wallet)

  const token0Address = await pair.token0()
  const token0 = tokenA.address === token0Address ? tokenA : tokenB
  const token1 = tokenA.address === token0Address ? tokenB : tokenA

  return {
    registry,
    wNat,
    ftsoManager,
    ftsoRewardManager,
    distribution,
    flareAssetRegistry,
    manager,
    factory,
    token0,
    token1,
    pair,
  }
}

export async function pairFlareAssetsFixture(): Promise<PairFixture> {
  const { registry, wNat, ftsoManager, ftsoRewardManager, distribution, flareAssetRegistry, manager, factory } =
    await factoryFixture()

  const [wallet] = await hre.ethers.getSigners()

  await manager.setAllowFlareAssetPairsWithoutPlugin(ASSET_TYPE_FASSET, 1) // YesUpgradable

  // provide FtsoRewardManager supply
  await wallet.sendTransaction({ to: ftsoRewardManager.address, value: expandTo18Decimals(1000000) })

  const tokenA = (await deployContract('FlareAssetTest', [expandTo18Decimals(10000)])) as IERC20 & IERC20Metadata
  const tokenB = (await deployContract('FlareAssetTest', [expandTo18Decimals(10000)])) as IERC20 & IERC20Metadata
  const isAB = BigNumber.from(tokenA.address).lt(BigNumber.from(tokenB.address))
  await flareAssetRegistry.addFlareAsset(tokenA.address, 'f-asset', isAB ? 2 : 0)
  await flareAssetRegistry.addFlareAsset(tokenB.address, 'f-asset', isAB ? 0 : 2)

  await factory.createPair(tokenA.address, tokenB.address)
  const pairAddress = await factory.getPair(tokenA.address, tokenB.address)
  const pair = IBlazeSwapPair__factory.connect(pairAddress, wallet)

  const token0Address = await pair.token0()
  const token0 = tokenA.address === token0Address ? tokenA : tokenB
  const token1 = tokenA.address === token0Address ? tokenB : tokenA

  return {
    registry,
    wNat,
    ftsoManager,
    ftsoRewardManager,
    distribution,
    flareAssetRegistry,
    manager,
    factory,
    token0,
    token1,
    pair,
  }
}
