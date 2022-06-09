import { waffle } from 'hardhat'
import { Wallet, providers } from 'ethers'

import { expandTo18Decimals } from './utilities'

import ERC20Test from '../../../artifacts/contracts/core/test/ERC20Test.sol/ERC20Test.json'
import FAssetTest from '../../../artifacts/contracts/core/test/FAssetTest.sol/FAssetTest.json'
import WNAT from '../../../artifacts/contracts/core/test/WNAT.sol/WNAT.json'
import BlazeSwapBaseManager from '../../../artifacts/contracts/core/BlazeSwapBaseManager.sol/BlazeSwapBaseManager.json'
import BlazeSwapManager from '../../../artifacts/contracts/core/BlazeSwapManager.sol/BlazeSwapManager.json'
import BlazeSwapBaseFactory from '../../../artifacts/contracts/core/BlazeSwapBaseFactory.sol/BlazeSwapBaseFactory.json'
import BlazeSwapFactory from '../../../artifacts/contracts/core/BlazeSwapFactory.sol/BlazeSwapFactory.json'
import PriceSubmitter from '../../../artifacts/contracts/core/test/PriceSubmitter.sol/PriceSubmitter.json'
import BlazeSwapDelegationPlugin from '../../../artifacts/contracts/core/BlazeSwapDelegationPlugin.sol/BlazeSwapDelegationPlugin.json'
import BlazeSwapFtsoRewardPlugin from '../../../artifacts/contracts/core/BlazeSwapFtsoRewardPlugin.sol/BlazeSwapFtsoRewardPlugin.json'
import AssetManagerController from '../../../artifacts/contracts/core/test/AssetManagerController.sol/AssetManagerController.json'
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
  FtsoManager__factory,
  FtsoRewardManager,
  FtsoRewardManager__factory,
  IPriceSubmitter,
  IWNat,
  PriceSubmitter__factory,
} from '../../../typechain-types'

const { deployContract } = waffle

const PRICE_SUBMITTER = '0x1000000000000000000000000000000000000003'

export const TEST_PROVIDERS = [
  '0x0000000000000000000000000000000000000001',
  '0x0000000000000000000000000000000000000002',
  '0x0000000000000000000000000000000000000003',
]

interface BaseManagerFixture {
  manager: IBlazeSwapBaseManager
}

interface ManagerFixture {
  manager: IBlazeSwapManager
  wNat: IWNat
  priceSubmitter: IPriceSubmitter
}

export async function baseManagerFixture([wallet]: Wallet[], _: providers.Web3Provider): Promise<BaseManagerFixture> {
  const manager = (await deployContract(wallet, BlazeSwapBaseManager, [wallet.address])) as IBlazeSwapBaseManager
  return { manager }
}

export async function managerFixture([wallet]: Wallet[], provider: providers.Web3Provider): Promise<ManagerFixture> {
  const wNat = (await deployContract(wallet, WNAT)) as IWNat
  await provider.send('hardhat_setCode', [PRICE_SUBMITTER, PriceSubmitter.deployedBytecode])
  const priceSubmitter = PriceSubmitter__factory.connect(PRICE_SUBMITTER, wallet)
  await priceSubmitter.initialize(wNat.address)
  const manager = (await deployContract(wallet, BlazeSwapManager, [wallet.address])) as IBlazeSwapManager
  const delegationPlugin = await deployContract(wallet, BlazeSwapDelegationPlugin, [manager.address])
  await delegationPlugin.setInitialProvider(TEST_PROVIDERS[0])
  await manager.setDelegationPlugin(delegationPlugin.address)
  const ftsoRewardPlugin = await deployContract(wallet, BlazeSwapFtsoRewardPlugin)
  await manager.setFtsoRewardPlugin(ftsoRewardPlugin.address)
  return { manager, wNat, priceSubmitter }
}

interface BaseFactoryFixture extends BaseManagerFixture {
  factory: IBlazeSwapBaseFactory
}

interface FactoryFixture extends ManagerFixture {
  factory: IBlazeSwapFactory
  priceSubmitter: IPriceSubmitter
  ftsoManager: FtsoManager
  ftsoRewardManager: FtsoRewardManager
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
  await provider.send('hardhat_setCode', [PRICE_SUBMITTER, PriceSubmitter.deployedBytecode])
  const { manager, wNat, priceSubmitter } = await managerFixture([wallet], provider)
  const ftsoManager = FtsoManager__factory.connect(await priceSubmitter.getFtsoManager(), wallet)
  const ftsoRewardManager = FtsoRewardManager__factory.connect(await ftsoManager.rewardManager(), wallet)
  const factory = (await deployContract(wallet, BlazeSwapFactory, [manager.address])) as IBlazeSwapFactory
  return { manager, wNat, factory, priceSubmitter, ftsoManager, ftsoRewardManager }
}

interface BasePairFixture extends BaseFactoryFixture {
  token0: IERC20
  token1: IERC20
  pair: IBlazeSwapBasePair
}

interface PairFixture extends FactoryFixture {
  token0: IERC20
  token1: IERC20
  pair: IBlazeSwapPair
}

export async function basePairFixture([wallet]: Wallet[], provider: providers.Web3Provider): Promise<BasePairFixture> {
  const { manager, factory } = await baseFactoryFixture([wallet], provider)

  const tokenA = (await deployContract(wallet, ERC20Test, [expandTo18Decimals(10000)])) as IERC20
  const tokenB = (await deployContract(wallet, ERC20Test, [expandTo18Decimals(10000)])) as IERC20

  await factory.createPair(tokenA.address, tokenB.address)
  const pairAddress = await factory.getPair(tokenA.address, tokenB.address)
  const pair = IBlazeSwapBasePair__factory.connect(pairAddress, wallet)

  const token0Address = await pair.token0()
  const token0 = tokenA.address === token0Address ? tokenA : tokenB
  const token1 = tokenA.address === token0Address ? tokenB : tokenA

  return { manager, factory, token0, token1, pair }
}

export async function pairFixture([wallet]: Wallet[], provider: providers.Web3Provider): Promise<PairFixture> {
  const { manager, wNat, factory, priceSubmitter, ftsoManager, ftsoRewardManager } = await factoryFixture(
    [wallet],
    provider
  )

  const tokenA = (await deployContract(wallet, ERC20Test, [expandTo18Decimals(10000)])) as IERC20
  const tokenB = (await deployContract(wallet, ERC20Test, [expandTo18Decimals(10000)])) as IERC20

  await factory.createPair(tokenA.address, tokenB.address)
  const pairAddress = await factory.getPair(tokenA.address, tokenB.address)
  const pair = IBlazeSwapPair__factory.connect(pairAddress, wallet)

  const token0Address = await pair.token0()
  const token0 = tokenA.address === token0Address ? tokenA : tokenB
  const token1 = tokenA.address === token0Address ? tokenB : tokenA

  return { manager, wNat, factory, priceSubmitter, ftsoManager, ftsoRewardManager, token0, token1, pair }
}

export async function pairWNatFixture([wallet]: Wallet[], provider: providers.Web3Provider): Promise<PairFixture> {
  const { manager, wNat, factory, priceSubmitter, ftsoManager, ftsoRewardManager } = await factoryFixture(
    [wallet],
    provider
  )
  // provide FtsoRewardManager supply
  await wallet.sendTransaction({ to: ftsoRewardManager.address, value: expandTo18Decimals(1000000) })

  const tokenA = (await deployContract(wallet, ERC20Test, [expandTo18Decimals(10000)])) as IERC20
  const tokenB = wNat as IERC20
  // provide WNAT supply
  await wNat.deposit({ value: expandTo18Decimals(10000) })

  await factory.createPair(tokenA.address, tokenB.address)
  const pairAddress = await factory.getPair(tokenA.address, tokenB.address)
  const pair = IBlazeSwapPair__factory.connect(pairAddress, wallet)

  const token0Address = await pair.token0()
  const token0 = tokenA.address === token0Address ? tokenA : tokenB
  const token1 = tokenA.address === token0Address ? tokenB : tokenA

  return { manager, wNat, factory, priceSubmitter, ftsoManager, ftsoRewardManager, token0, token1, pair }
}

export async function pairFAssetFixture([wallet]: Wallet[], provider: providers.Web3Provider): Promise<PairFixture> {
  const { manager, wNat, factory, priceSubmitter, ftsoManager, ftsoRewardManager } = await factoryFixture(
    [wallet],
    provider
  )
  const assetManagerAddress = '0x1230000000000000000000000000000000000123'
  const controller = await deployContract(wallet, AssetManagerController)
  await controller.addAssetManager(assetManagerAddress)
  await manager.setAssetManagerController(controller.address)
  await manager.setAllowFAssetPairsWithoutPlugin(true)

  // provide FtsoRewardManager supply
  await wallet.sendTransaction({ to: ftsoRewardManager.address, value: expandTo18Decimals(1000000) })

  const tokenA = (await deployContract(wallet, ERC20Test, [expandTo18Decimals(10000)])) as IERC20
  const tokenB = (await deployContract(wallet, FAssetTest, [assetManagerAddress, expandTo18Decimals(10000)])) as IERC20

  await factory.createPair(tokenA.address, tokenB.address)
  const pairAddress = await factory.getPair(tokenA.address, tokenB.address)
  const pair = IBlazeSwapPair__factory.connect(pairAddress, wallet)

  const token0Address = await pair.token0()
  const token0 = tokenA.address === token0Address ? tokenA : tokenB
  const token1 = tokenA.address === token0Address ? tokenB : tokenA

  return { manager, wNat, factory, priceSubmitter, ftsoManager, ftsoRewardManager, token0, token1, pair }
}

export async function pairWNatFAssetFixture(
  [wallet]: Wallet[],
  provider: providers.Web3Provider
): Promise<PairFixture> {
  const { manager, wNat, factory, priceSubmitter, ftsoManager, ftsoRewardManager } = await factoryFixture(
    [wallet],
    provider
  )
  const assetManagerAddress = '0x1230000000000000000000000000000000000123'
  const controller = await deployContract(wallet, AssetManagerController)
  await controller.addAssetManager(assetManagerAddress)
  await manager.setAssetManagerController(controller.address)
  await manager.setAllowFAssetPairsWithoutPlugin(true)

  // provide FtsoRewardManager supply
  await wallet.sendTransaction({ to: ftsoRewardManager.address, value: expandTo18Decimals(1000000) })

  const tokenA = (await deployContract(wallet, FAssetTest, [assetManagerAddress, expandTo18Decimals(10000)])) as IERC20
  const tokenB = wNat as IERC20
  // provide WNAT supply
  await wNat.deposit({ value: expandTo18Decimals(10000) })

  await factory.createPair(tokenA.address, tokenB.address)
  const pairAddress = await factory.getPair(tokenA.address, tokenB.address)
  const pair = IBlazeSwapPair__factory.connect(pairAddress, wallet)

  const token0Address = await pair.token0()
  const token0 = tokenA.address === token0Address ? tokenA : tokenB
  const token1 = tokenA.address === token0Address ? tokenB : tokenA

  return { manager, wNat, factory, priceSubmitter, ftsoManager, ftsoRewardManager, token0, token1, pair }
}
