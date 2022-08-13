import { waffle } from 'hardhat'
import { expect } from 'chai'
import { BigNumber, constants, Wallet } from 'ethers'

import { expandTo18Decimals, getRewardManagerAddress, getInterfaceID } from './shared/utilities'
import { pairFAssetFixture, TEST_PROVIDERS } from './shared/fixtures'

import BlazeSwapRewardManager from '../../artifacts/contracts/core/BlazeSwapRewardManager.sol/BlazeSwapRewardManager.json'
import {
  FAsset,
  IBlazeSwapAirdrop__factory,
  IBlazeSwapDelegation,
  IBlazeSwapDelegation__factory,
  IBlazeSwapFAssetReward__factory,
  IBlazeSwapFtsoReward__factory,
  IBlazeSwapManager,
  IBlazeSwapPair,
  IBlazeSwapPlugin__factory,
  IERC20,
  IWNat,
} from '../../typechain-types'

const { createFixtureLoader } = waffle

describe('BlazeSwapPairFAsset', () => {
  const provider = waffle.provider
  const [wallet, other1, other2] = provider.getWallets()
  const loadFixture = createFixtureLoader([wallet], provider)

  let manager: IBlazeSwapManager
  let wNat: IWNat
  let token0: IERC20
  let token1: IERC20
  let fAsset: FAsset
  let pair: IBlazeSwapPair
  let delegation: IBlazeSwapDelegation
  let rewardManagerAddress: string
  beforeEach(async () => {
    const fixture = await loadFixture(pairFAssetFixture)
    manager = fixture.manager
    wNat = fixture.wNat
    token0 = fixture.token0
    token1 = fixture.token1
    pair = fixture.pair
    fAsset = ((await pair.type0()) == 2 ? token0 : token1) as FAsset
    delegation = IBlazeSwapDelegation__factory.connect(pair.address, wallet)
    rewardManagerAddress = getRewardManagerAddress(pair.address, BlazeSwapRewardManager.bytecode)
  })

  it('supportsInterface', async () => {
    expect(await pair.supportsInterface(getInterfaceID(IBlazeSwapDelegation__factory.createInterface()))).to.eq(true)
    expect(await pair.supportsInterface(getInterfaceID(IBlazeSwapFtsoReward__factory.createInterface()))).to.eq(false)
    expect(await pair.supportsInterface(getInterfaceID(IBlazeSwapAirdrop__factory.createInterface()))).to.eq(false)
    expect(await pair.supportsInterface(getInterfaceID(IBlazeSwapFAssetReward__factory.createInterface()))).to.eq(false) // created with allowFAssetPairWithoutPlugin
  })

  it('facets', async () => {
    const delegationAddress = await IBlazeSwapPlugin__factory.connect(
      await manager.delegationPlugin(),
      wallet
    ).implementation()
    // pair created without fasset plugin
    expect((await pair.facets()).length).to.eq(1)
    expect(await pair.facetAddresses()).to.deep.eq([delegationAddress])
  })

  it('type0 and type1', async () => {
    expect((await pair.type0()) + (await pair.type1())).to.eq(2)
  })

  it('initial state', async () => {
    const { _delegateAddresses, _bips, _count, _delegationMode } = await fAsset.delegatesOf(pair.address)

    expect(_count).to.eq(BigNumber.from('1'))
    expect(_delegationMode).to.eq(BigNumber.from('1'))
    expect(_delegateAddresses).to.deep.eq([TEST_PROVIDERS[0]])
    expect(_bips).to.deep.eq([BigNumber.from('10000')])

    expect(await delegation.providersCount()).to.eq(BigNumber.from('0'))
    expect(await delegation.mostVotedProviders()).to.deep.eq([constants.AddressZero, constants.AddressZero])
  })

  async function addLiquidity(minter: Wallet, tokenAmount: BigNumber, wNatAmount: BigNumber) {
    await token0.transfer(pair.address, wNat.address == token0.address ? wNatAmount : tokenAmount)
    await token1.transfer(pair.address, wNat.address == token1.address ? wNatAmount : tokenAmount)
    const minterPair = pair.connect(minter)
    await minterPair.mint(minter.address)
  }

  it('changeProviders', async () => {
    await addLiquidity(wallet, expandTo18Decimals(1), expandTo18Decimals(1))
    await addLiquidity(other1, expandTo18Decimals(2), expandTo18Decimals(2))
    await addLiquidity(other2, expandTo18Decimals(3), expandTo18Decimals(3))

    await delegation.voteFor(TEST_PROVIDERS[0])
    await delegation.connect(other1).voteFor(TEST_PROVIDERS[1])
    await delegation.connect(other2).voteFor(TEST_PROVIDERS[2])

    await expect(delegation.changeProviders(await delegation.mostVotedProviders())).not.to.be.reverted

    {
      const { _delegateAddresses, _bips, _count, _delegationMode } = await fAsset.delegatesOf(pair.address)

      expect(_count).to.eq(BigNumber.from('2'))
      expect(_delegationMode).to.eq(BigNumber.from('1'))
      expect(_delegateAddresses).to.deep.eq([TEST_PROVIDERS[2], TEST_PROVIDERS[1]])
      expect(_bips).to.deep.eq([BigNumber.from('5000'), BigNumber.from('5000')])
    }
  })
})
