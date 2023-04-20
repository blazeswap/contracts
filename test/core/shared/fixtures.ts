import { waffle } from 'hardhat'
import { BigNumber, Wallet, providers, constants } from 'ethers'
import { keccak256, toUtf8Bytes } from 'ethers/lib/utils'

import { expandTo18Decimals } from './utilities'

import ERC20Test from '../../../artifacts/contracts/core/test/ERC20Test.sol/ERC20Test.json'
import FlareAssetTest from '../../../artifacts/contracts/core/test/FlareAssetTest.sol/FlareAssetTest.json'
import WNAT from '../../../artifacts/contracts/core/test/WNAT.sol/WNAT.json'
import BlazeSwapBaseManager from '../../../artifacts/contracts/core/BlazeSwapBaseManager.sol/BlazeSwapBaseManager.json'
import BlazeSwapManager from '../../../artifacts/contracts/core/BlazeSwapManager.sol/BlazeSwapManager.json'
import BlazeSwapBaseFactory from '../../../artifacts/contracts/core/BlazeSwapBaseFactory.sol/BlazeSwapBaseFactory.json'
import BlazeSwapFactory from '../../../artifacts/contracts/core/BlazeSwapFactory.sol/BlazeSwapFactory.json'
import DistributionToDelegatorsABI from '../../../artifacts/contracts/core/test/DistributionToDelegators.sol/DistributionToDelegators.json'
import BlazeSwapAirdropPlugin from '../../../artifacts/contracts/core/BlazeSwapAirdropPlugin.sol/BlazeSwapAirdropPlugin.json'
import BlazeSwapDelegationPlugin from '../../../artifacts/contracts/core/BlazeSwapDelegationPlugin.sol/BlazeSwapDelegationPlugin.json'
import BlazeSwapFtsoRewardPlugin from '../../../artifacts/contracts/core/BlazeSwapFtsoRewardPlugin.sol/BlazeSwapFtsoRewardPlugin.json'
import BlazeSwapRewardsPlugin from '../../../artifacts/contracts/core/BlazeSwapRewardsPlugin.sol/BlazeSwapRewardsPlugin.json'
import FlareAssetRegistryABI from '../../../artifacts/contracts/core/test/FlareAssetRegistry.sol/FlareAssetRegistry.json'
import FlareContractRegistryABI from '../../../artifacts/contracts/core/test/FlareContractRegistry.sol/FlareContractRegistry.json'
import FtsoManagerABI from '../../../artifacts/contracts/core/test/FtsoManager.sol/FtsoManager.json'
import FtsoRewardManagerABI from '../../../artifacts/contracts/core/test/FtsoRewardManager.sol/FtsoRewardManager.json'
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

const { deployContract } = waffle

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

export async function flareFixture([wallet]: Wallet[], provider: providers.Web3Provider): Promise<FlareFixture> {
  await provider.send('hardhat_setCode', [FLARE_CONTRACT_REGISTRY, FlareContractRegistryABI.deployedBytecode])
  const registry = FlareContractRegistry__factory.connect(FLARE_CONTRACT_REGISTRY, wallet)
  const wNat = (await deployContract(wallet, WNAT)) as IWNat
  const ftsoManager = (await deployContract(wallet, FtsoManagerABI, [constants.AddressZero])) as FtsoManager
  const ftsoRewardManager = (await deployContract(wallet, FtsoRewardManagerABI, [
    constants.AddressZero,
  ])) as FtsoRewardManager
  const distribution = (await deployContract(wallet, DistributionToDelegatorsABI)) as DistributionToDelegators
  const flareAssetRegistry = (await deployContract(wallet, FlareAssetRegistryABI)) as FlareAssetRegistry

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

export async function baseManagerFixture([wallet]: Wallet[], _: providers.Web3Provider): Promise<BaseManagerFixture> {
  const manager = (await deployContract(wallet, BlazeSwapBaseManager, [wallet.address])) as IBlazeSwapBaseManager
  return { manager }
}

export async function managerFixture([wallet]: Wallet[], provider: providers.Web3Provider): Promise<ManagerFixture> {
  const { registry, wNat, ftsoManager, ftsoRewardManager, distribution, flareAssetRegistry } = await flareFixture(
    [wallet],
    provider
  )

  const manager = (await deployContract(wallet, BlazeSwapManager, [wallet.address])) as IBlazeSwapManager
  const rewardsPlugin = await deployContract(wallet, BlazeSwapRewardsPlugin, [manager.address])
  await manager.setRewardsPlugin(rewardsPlugin.address)
  const delegationPlugin = await deployContract(wallet, BlazeSwapDelegationPlugin, [manager.address])
  await delegationPlugin.setInitialProvider(TEST_PROVIDERS[0])
  await delegationPlugin.setMaxDelegatesByPercent(2)
  await manager.setDelegationPlugin(delegationPlugin.address)
  const ftsoRewardPlugin = await deployContract(wallet, BlazeSwapFtsoRewardPlugin)
  await manager.setFtsoRewardPlugin(ftsoRewardPlugin.address)
  const airdropPlugin = await deployContract(wallet, BlazeSwapAirdropPlugin)
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

export async function baseFactoryFixture(
  [wallet]: Wallet[],
  provider: providers.Web3Provider
): Promise<BaseFactoryFixture> {
  const { manager } = await baseManagerFixture([wallet], provider)
  const factory = (await deployContract(wallet, BlazeSwapBaseFactory, [manager.address])) as IBlazeSwapBaseFactory
  return { manager, factory }
}

export async function factoryFixture([wallet]: Wallet[], provider: providers.Web3Provider): Promise<FactoryFixture> {
  const { registry, wNat, ftsoManager, ftsoRewardManager, distribution, flareAssetRegistry, manager } =
    await managerFixture([wallet], provider)

  const factory = (await deployContract(wallet, BlazeSwapFactory, [manager.address])) as IBlazeSwapFactory
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

export async function basePairFixture([wallet]: Wallet[], provider: providers.Web3Provider): Promise<BasePairFixture> {
  const { manager, factory } = await baseFactoryFixture([wallet], provider)

  const tokenA = (await deployContract(wallet, ERC20Test, [expandTo18Decimals(10000)])) as IERC20 & IERC20Metadata
  const tokenB = (await deployContract(wallet, ERC20Test, [expandTo18Decimals(10000)])) as IERC20 & IERC20Metadata

  await factory.createPair(tokenA.address, tokenB.address)
  const pairAddress = await factory.getPair(tokenA.address, tokenB.address)
  const pair = IBlazeSwapBasePair__factory.connect(pairAddress, wallet)

  const token0Address = await pair.token0()
  const token0 = tokenA.address === token0Address ? tokenA : tokenB
  const token1 = tokenA.address === token0Address ? tokenB : tokenA

  return { manager, factory, token0, token1, pair }
}

export async function pairFixture([wallet]: Wallet[], provider: providers.Web3Provider): Promise<PairFixture> {
  const { registry, wNat, ftsoManager, ftsoRewardManager, distribution, flareAssetRegistry, manager, factory } =
    await factoryFixture([wallet], provider)

  const tokenA = (await deployContract(wallet, ERC20Test, [expandTo18Decimals(10000)])) as IERC20 & IERC20Metadata
  const tokenB = (await deployContract(wallet, ERC20Test, [expandTo18Decimals(10000)])) as IERC20 & IERC20Metadata

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

export async function pairWNatFixture([wallet]: Wallet[], provider: providers.Web3Provider): Promise<PairFixture> {
  const { registry, wNat, ftsoManager, ftsoRewardManager, distribution, flareAssetRegistry, manager, factory } =
    await factoryFixture([wallet], provider)

  // provide FtsoRewardManager supply
  await wallet.sendTransaction({ to: ftsoRewardManager.address, value: expandTo18Decimals(1000000) })

  const tokenA = (await deployContract(wallet, ERC20Test, [expandTo18Decimals(10000)])) as IERC20 & IERC20Metadata
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

export async function pairFlareAssetFixture(
  [wallet]: Wallet[],
  provider: providers.Web3Provider
): Promise<PairFixture> {
  const { registry, wNat, ftsoManager, ftsoRewardManager, distribution, flareAssetRegistry, manager, factory } =
    await factoryFixture([wallet], provider)

  await manager.setAllowFlareAssetPairsWithoutPlugin(ASSET_TYPE_FASSET, 1) // YesUpgradable

  // provide FtsoRewardManager supply
  await wallet.sendTransaction({ to: ftsoRewardManager.address, value: expandTo18Decimals(1000000) })

  const tokenA = (await deployContract(wallet, ERC20Test, [expandTo18Decimals(10000)])) as IERC20 & IERC20Metadata
  const tokenB = (await deployContract(wallet, FlareAssetTest, [expandTo18Decimals(10000)])) as IERC20 & IERC20Metadata
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

export async function pairWNatFlareAssetFixture(
  [wallet]: Wallet[],
  provider: providers.Web3Provider
): Promise<PairFixture> {
  const { registry, wNat, ftsoManager, ftsoRewardManager, distribution, flareAssetRegistry, manager, factory } =
    await factoryFixture([wallet], provider)

  await manager.setAllowFlareAssetPairsWithoutPlugin(ASSET_TYPE_FASSET, 1) // YesUpgradable

  // provide FtsoRewardManager supply
  await wallet.sendTransaction({ to: ftsoRewardManager.address, value: expandTo18Decimals(1000000) })

  const tokenA = (await deployContract(wallet, FlareAssetTest, [expandTo18Decimals(10000)])) as IERC20 & IERC20Metadata
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

export async function pairFlareAssetsFixture(
  [wallet]: Wallet[],
  provider: providers.Web3Provider
): Promise<PairFixture> {
  const { registry, wNat, ftsoManager, ftsoRewardManager, distribution, flareAssetRegistry, manager, factory } =
    await factoryFixture([wallet], provider)

  await manager.setAllowFlareAssetPairsWithoutPlugin(ASSET_TYPE_FASSET, 1) // YesUpgradable

  // provide FtsoRewardManager supply
  await wallet.sendTransaction({ to: ftsoRewardManager.address, value: expandTo18Decimals(1000000) })

  const tokenA = (await deployContract(wallet, FlareAssetTest, [expandTo18Decimals(10000)])) as IERC20 & IERC20Metadata
  const tokenB = (await deployContract(wallet, FlareAssetTest, [expandTo18Decimals(10000)])) as IERC20 & IERC20Metadata
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
