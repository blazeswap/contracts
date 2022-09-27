import { waffle } from 'hardhat'
import { expect } from 'chai'
import { BigNumber, Wallet } from 'ethers'

import { expandTo18Decimals, getRewardManagerAddress, getInterfaceID } from './shared/utilities'
import { pairFlareAssetsFixture, TEST_PROVIDERS } from './shared/fixtures'

import {
  FlareAsset,
  IBlazeSwapAirdrop__factory,
  IBlazeSwapDelegation,
  IBlazeSwapDelegation__factory,
  IBlazeSwapFlareAssetReward__factory,
  IBlazeSwapFtsoReward__factory,
  IBlazeSwapManager,
  IBlazeSwapPair,
  IBlazeSwapPlugin__factory,
  IERC20,
  IWNat,
} from '../../typechain-types'

const { createFixtureLoader } = waffle

describe('BlazeSwapPairFlareAssets', () => {
  const provider = waffle.provider
  const [wallet, other1, other2] = provider.getWallets()
  const loadFixture = createFixtureLoader([wallet], provider)

  let manager: IBlazeSwapManager
  let wNat: IWNat
  let token0: IERC20
  let token1: IERC20
  let flareAsset0: FlareAsset
  let flareAsset1: FlareAsset
  let pair: IBlazeSwapPair
  let delegation: IBlazeSwapDelegation
  let rewardManagerAddress: string
  beforeEach(async () => {
    const fixture = await loadFixture(pairFlareAssetsFixture)
    manager = fixture.manager
    wNat = fixture.wNat
    token0 = fixture.token0
    token1 = fixture.token1
    pair = fixture.pair
    flareAsset0 = token0 as FlareAsset
    flareAsset1 = token1 as FlareAsset
    delegation = IBlazeSwapDelegation__factory.connect(pair.address, wallet)
    rewardManagerAddress = getRewardManagerAddress(pair.address)
  })

  it('supportsInterface', async () => {
    expect(await pair.supportsInterface(getInterfaceID(IBlazeSwapDelegation__factory.createInterface()))).to.eq(true)
    expect(await pair.supportsInterface(getInterfaceID(IBlazeSwapFtsoReward__factory.createInterface()))).to.eq(false)
    expect(await pair.supportsInterface(getInterfaceID(IBlazeSwapAirdrop__factory.createInterface()))).to.eq(false)
    expect(await pair.supportsInterface(getInterfaceID(IBlazeSwapFlareAssetReward__factory.createInterface()))).to.eq(
      false
    ) // created with allowFlareAssetPairWithoutPlugin
  })

  it('facets', async () => {
    const delegationAddress = await IBlazeSwapPlugin__factory.connect(
      await manager.delegationPlugin(),
      wallet
    ).implementation()
    // pair created without flareasset plugin
    expect((await pair.facets()).length).to.eq(1)
    expect(await pair.facetAddresses()).to.deep.eq([delegationAddress])
  })

  it('type0 and type1', async () => {
    expect((await pair.type0()) + (await pair.type1())).to.eq(4)
  })

  it('initial state', async () => {
    {
      const { _delegateAddresses, _bips, _count, _delegationMode } = await flareAsset0.delegatesOf(pair.address)

      expect(_count).to.eq(BigNumber.from('1'))
      expect(_delegationMode).to.eq(BigNumber.from('1'))
      expect(_delegateAddresses).to.deep.eq([TEST_PROVIDERS[0]])
      expect(_bips).to.deep.eq([BigNumber.from('10000')])
    }
    {
      const { _delegateAddresses, _bips, _count } = await flareAsset1.delegatesOf(pair.address)

      expect(_count).to.eq(BigNumber.from('0'))
      expect(_delegateAddresses).to.deep.eq([])
      expect(_bips).to.deep.eq([])
    }

    expect(await delegation.providersCount()).to.eq(BigNumber.from('0'))
    expect(await delegation.mostVotedProviders(10)).to.deep.eq([[], []])
  })

  async function addLiquidity(minter: Wallet, token0Amount: BigNumber, token1Amount: BigNumber) {
    await token0.transfer(pair.address, token0Amount)
    await token1.transfer(pair.address, token1Amount)
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

    const [newProviders] = await delegation.mostVotedProviders(2)
    await expect(delegation.changeProviders(newProviders)).not.to.be.reverted

    {
      const { _delegateAddresses, _bips, _count, _delegationMode } = await flareAsset0.delegatesOf(pair.address)

      expect(_count).to.eq(BigNumber.from('2'))
      expect(_delegationMode).to.eq(BigNumber.from('1'))
      expect(_delegateAddresses).to.deep.eq([TEST_PROVIDERS[2], TEST_PROVIDERS[1]])
      expect(_bips).to.deep.eq([BigNumber.from('5000'), BigNumber.from('5000')])
    }
    {
      const { _delegateAddresses, _bips, _count } = await flareAsset1.delegatesOf(pair.address)

      expect(_count).to.eq(BigNumber.from('0'))
      expect(_delegateAddresses).to.deep.eq([])
      expect(_bips).to.deep.eq([])
    }
  })
})
