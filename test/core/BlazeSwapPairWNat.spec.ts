import hre from 'hardhat'
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers'
import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { expect } from 'chai'
import { BigNumber } from 'ethers'

import { expandTo18Decimals, getRewardManagerAddress, getInterfaceID } from './shared/utilities'
import { pairWNatFixture, TEST_PROVIDERS } from './shared/fixtures'

import {
  DistributionToDelegators,
  IBlazeSwapAirdrop__factory,
  IBlazeSwapDelegation,
  IBlazeSwapDelegation__factory,
  IBlazeSwapFactory,
  IBlazeSwapFlareAssetReward__factory,
  IBlazeSwapFtsoReward__factory,
  IBlazeSwapManager,
  IBlazeSwapPair,
  IBlazeSwapPair__factory,
  IBlazeSwapPluginImpl__factory,
  IBlazeSwapPlugin__factory,
  IBlazeSwapRewards__factory,
  IERC20,
  IWNat,
} from '../../typechain-types'

import { deployContract } from '../shared/shared/utilities'

describe('BlazeSwapPairWNat', () => {
  let wallet: SignerWithAddress
  let other1: SignerWithAddress
  let other2: SignerWithAddress

  let manager: IBlazeSwapManager
  let factory: IBlazeSwapFactory
  let wNat: IWNat
  let token0: IERC20
  let token1: IERC20
  let pair: IBlazeSwapPair
  let delegation: IBlazeSwapDelegation
  let distribution: DistributionToDelegators
  let rewardManagerAddress: string
  beforeEach(async () => {
    [wallet, other1, other2] = await hre.ethers.getSigners()
    const fixture = await loadFixture(pairWNatFixture)
    manager = fixture.manager
    factory = fixture.factory
    wNat = fixture.wNat
    token0 = fixture.token0
    token1 = fixture.token1
    pair = fixture.pair
    delegation = IBlazeSwapDelegation__factory.connect(pair.address, wallet)
    distribution = fixture.distribution
    rewardManagerAddress = getRewardManagerAddress(pair.address)
  })

  it('supportsInterface', async () => {
    expect(await pair.supportsInterface(getInterfaceID(IBlazeSwapRewards__factory.createInterface()))).to.eq(true)
    expect(await pair.supportsInterface(getInterfaceID(IBlazeSwapDelegation__factory.createInterface()))).to.eq(true)
    expect(await pair.supportsInterface(getInterfaceID(IBlazeSwapFtsoReward__factory.createInterface()))).to.eq(true)
    expect(await pair.supportsInterface(getInterfaceID(IBlazeSwapAirdrop__factory.createInterface()))).to.eq(true)
    expect(await pair.supportsInterface(getInterfaceID(IBlazeSwapFlareAssetReward__factory.createInterface()))).to.eq(
      false
    )
  })

  it('airdropEnded', async () => {
    await distribution.setSingleVotePowerBlockNumber(35, 1)
    await distribution.setMonthToExpireNext(36)

    const token = await deployContract('ERC20Test', [expandTo18Decimals(10000)])

    await factory.createPair(wNat.address, token.address)
    const pairAddress = await factory.getPair(wNat.address, token.address)
    const newPair = IBlazeSwapPair__factory.connect(pairAddress, wallet)

    expect(await newPair.supportsInterface(getInterfaceID(IBlazeSwapRewards__factory.createInterface()))).to.eq(true)
    expect(await newPair.supportsInterface(getInterfaceID(IBlazeSwapDelegation__factory.createInterface()))).to.eq(true)
    expect(await newPair.supportsInterface(getInterfaceID(IBlazeSwapFtsoReward__factory.createInterface()))).to.eq(true)
    expect(await newPair.supportsInterface(getInterfaceID(IBlazeSwapAirdrop__factory.createInterface()))).to.eq(false)
  })

  it('facets', async () => {
    const rewardsAddress = await IBlazeSwapPlugin__factory.connect(
      await manager.rewardsPlugin(),
      wallet
    ).implementation()
    const delegationAddress = await IBlazeSwapPlugin__factory.connect(
      await manager.delegationPlugin(),
      wallet
    ).implementation()
    const ftsoRewardAddress = await IBlazeSwapPlugin__factory.connect(
      await manager.ftsoRewardPlugin(),
      wallet
    ).implementation()
    const airdropAddress = await IBlazeSwapPlugin__factory.connect(
      await manager.airdropPlugin(),
      wallet
    ).implementation()
    expect((await pair.facets()).length).to.eq(4)
    expect(await pair.facetAddresses()).to.deep.eq([
      rewardsAddress,
      delegationAddress,
      ftsoRewardAddress,
      airdropAddress,
    ])

    const [delegationSelectors] = await IBlazeSwapPluginImpl__factory.connect(
      delegationAddress,
      wallet
    ).pluginMetadata()
    expect(await pair.facetFunctionSelectors(delegationAddress)).to.deep.eq(delegationSelectors)
    expect(
      await pair.facetAddress(await IBlazeSwapFtsoReward__factory.createInterface().getSighash('distributeFtsoRewards'))
    ).to.eq(ftsoRewardAddress)
  })

  it('initial state', async () => {
    const { _delegateAddresses, _bips, _count, _delegationMode } = await wNat.delegatesOf(pair.address)

    expect(_count).to.eq(BigNumber.from('1'))
    expect(_delegationMode).to.eq(BigNumber.from('1'))
    expect(_delegateAddresses).to.deep.eq([TEST_PROVIDERS[0]])
    expect(_bips).to.deep.eq([BigNumber.from('10000')])

    expect(await delegation.providersCount()).to.eq(BigNumber.from('0'))
    expect(await delegation.mostVotedProviders(10)).to.deep.eq([[], []])
  })

  async function addLiquidity(minter: SignerWithAddress, tokenAmount: BigNumber, wNatAmount: BigNumber) {
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

    const [newProviders] = await delegation.mostVotedProviders(2)
    await expect(delegation.changeProviders(newProviders)).not.to.be.reverted

    {
      const { _delegateAddresses, _bips, _count, _delegationMode } = await wNat.delegatesOf(pair.address)

      expect(_count).to.eq(BigNumber.from('2'))
      expect(_delegationMode).to.eq(BigNumber.from('1'))
      expect(_delegateAddresses).to.deep.eq([TEST_PROVIDERS[2], TEST_PROVIDERS[1]])
      expect(_bips).to.deep.eq([BigNumber.from('5000'), BigNumber.from('5000')])
    }
  })
})
