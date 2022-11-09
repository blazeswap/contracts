import { waffle } from 'hardhat'
import { Wallet, providers } from 'ethers'

import { expandTo18Decimals } from '../../core/shared/utilities'

import { factoryFixture } from '../../core/shared/fixtures'

import DeflatingERC20Test from '../../../artifacts/contracts/periphery/test/DeflatingERC20Test.sol/DeflatingERC20Test.json'
import ERC20Test from '../../../artifacts/contracts/core/test/ERC20Test.sol/ERC20Test.json'
import BlazeSwapBaseFactory from '../../../artifacts/contracts/core/BlazeSwapBaseFactory.sol/BlazeSwapBaseFactory.json'
import BlazeSwapMigrator from '../../../artifacts/contracts/periphery/BlazeSwapMigrator.sol/BlazeSwapMigrator.json'
import BlazeSwapRouter from '../../../artifacts/contracts/periphery/BlazeSwapRouter.sol/BlazeSwapRouter.json'
import RouterEventEmitterArtifact from '../../../artifacts/contracts/periphery/test/RouterEventEmitter.sol/RouterEventEmitter.json'
import WNAT from '../../../artifacts/contracts/core/test/WNAT.sol/WNAT.json'
import {
  IBlazeSwapFactory,
  IBlazeSwapManager,
  IBlazeSwapPair,
  IBlazeSwapPair__factory,
  IBlazeSwapMigrator,
  IBlazeSwapRouter,
  IERC20,
  IWNat,
  RouterEventEmitter,
  IBlazeSwapBaseFactory,
} from '../../../typechain-types'

const { deployContract } = waffle

interface Fixture {
  token0: IERC20
  token1: IERC20
  wNat: IWNat
  wNatPartner: IERC20
  manager: IBlazeSwapManager
  factory: IBlazeSwapFactory
  router: IBlazeSwapRouter
  routerSplitFee: IBlazeSwapRouter
  routerEventEmitter: RouterEventEmitter
  pair: IBlazeSwapPair
  wNatPair: IBlazeSwapPair
}

export async function routerFixture([wallet]: Wallet[], provider: providers.Web3Provider): Promise<Fixture> {
  // deploy factory
  const { manager, factory, wNat } = await factoryFixture([wallet], provider)

  // deploy tokens
  const tokenA = (await deployContract(wallet, ERC20Test, [expandTo18Decimals(10000)])) as IERC20
  const tokenB = (await deployContract(wallet, ERC20Test, [expandTo18Decimals(10000)])) as IERC20
  const wNatPartner = (await deployContract(wallet, ERC20Test, [expandTo18Decimals(10000)])) as IERC20

  // deploy routers
  const router = (await deployContract(wallet, BlazeSwapRouter, [
    factory.address,
    wNat.address,
    false,
  ])) as IBlazeSwapRouter

  // split fee
  const routerSplitFee = (await deployContract(wallet, BlazeSwapRouter, [
    factory.address,
    wNat.address,
    true,
  ])) as IBlazeSwapRouter

  // event emitter for testing
  const routerEventEmitter = (await deployContract(wallet, RouterEventEmitterArtifact)) as RouterEventEmitter

  // initialize
  await factory.createPair(tokenA.address, tokenB.address)
  const pairAddress = await factory.getPair(tokenA.address, tokenB.address)
  const pair = IBlazeSwapPair__factory.connect(pairAddress, wallet)

  const token0Address = await pair.token0()
  const token0 = tokenA.address === token0Address ? tokenA : tokenB
  const token1 = tokenA.address === token0Address ? tokenB : tokenA

  await factory.createPair(wNat.address, wNatPartner.address)
  const wNatPairAddress = await factory.getPair(wNat.address, wNatPartner.address)
  const wNatPair = IBlazeSwapPair__factory.connect(wNatPairAddress, wallet)

  return {
    token0,
    token1,
    wNat,
    wNatPartner,
    manager,
    factory,
    router,
    routerSplitFee,
    routerEventEmitter,
    pair,
    wNatPair,
  }
}

interface MigratorFixture {
  factoryOld: IBlazeSwapBaseFactory
  factory: IBlazeSwapFactory
  wNatOld: IERC20
  wNat: IERC20
  token: IERC20
  tokenDeflationary: IERC20
  migrator: IBlazeSwapMigrator
}

export async function migratorFixture([wallet]: Wallet[], provider: providers.Web3Provider): Promise<MigratorFixture> {
  // deploy factory
  const { manager, factory, wNat } = await factoryFixture([wallet], provider)

  // deploy old factory & wNat
  const factoryOld = (await deployContract(wallet, BlazeSwapBaseFactory, [manager.address])) as IBlazeSwapBaseFactory
  const wNatOld = (await deployContract(wallet, WNAT)) as IWNat

  // fund wNat
  await wNat.deposit({ value: expandTo18Decimals(10000) })
  await wNatOld.deposit({ value: expandTo18Decimals(10000) })

  // deploy tokens
  const token = (await deployContract(wallet, ERC20Test, [expandTo18Decimals(10000)])) as IERC20
  const tokenDeflationary = (await deployContract(wallet, DeflatingERC20Test, [expandTo18Decimals(10000)])) as IERC20

  // migrator
  const migrator = (await deployContract(wallet, BlazeSwapMigrator, [
    factory.address,
    wNat.address,
  ])) as IBlazeSwapMigrator

  return {
    factoryOld,
    factory,
    wNatOld,
    wNat,
    token,
    tokenDeflationary,
    migrator,
  }
}
