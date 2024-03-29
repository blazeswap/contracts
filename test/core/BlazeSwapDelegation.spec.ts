import hre from 'hardhat'
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers'
import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { expect } from 'chai'
import { BigNumber, constants } from 'ethers'

import { pairWNatFixture, TEST_PROVIDERS } from './shared/fixtures'
import { expandTo18Decimals, getRewardManagerAddress, MINIMUM_LIQUIDITY } from './shared/utilities'

import BlazeSwapPair from '../../artifacts/contracts/core/BlazeSwapPair.sol/BlazeSwapPair.json'
import BlazeSwapDelegation from '../../artifacts/contracts/core/BlazeSwapDelegation.sol/BlazeSwapDelegation.json'

import { Coder } from 'abi-coder'

import {
  BlazeSwapDelegationPlugin__factory,
  IBlazeSwapDelegation,
  IBlazeSwapDelegation__factory,
  IBlazeSwapManager,
  IBlazeSwapPair,
  IBlazeSwapPlugin__factory,
  IERC20,
  IIBlazeSwapPluginImpl__factory,
  IWNat,
} from '../../typechain-types'

describe('BlazeSwapDelegation', () => {
  let wallet: SignerWithAddress
  let other1: SignerWithAddress
  let other2: SignerWithAddress

  let manager: IBlazeSwapManager
  let wNat: IWNat
  let token0: IERC20
  let token1: IERC20
  let pair: IBlazeSwapPair
  let delegation: IBlazeSwapDelegation
  let rewardManagerAddress: string
  beforeEach(async () => {
    [wallet, other1, other2] = await hre.ethers.getSigners()
    const fixture = await loadFixture(pairWNatFixture)
    manager = fixture.manager
    wNat = fixture.wNat
    token0 = fixture.token0
    token1 = fixture.token1
    pair = fixture.pair
    delegation = IBlazeSwapDelegation__factory.connect(pair.address, wallet)
    rewardManagerAddress = getRewardManagerAddress(pair.address)
  })

  it('initialize:forbiddenDelegated', async () => {
    await expect(
      IIBlazeSwapPluginImpl__factory.connect(pair.address, wallet).initialize(constants.AddressZero)
    ).to.be.revertedWith('BlazeSwap: INVALID_FUNCTION')
  })

  it('initialize:forbiddenDirect', async () => {
    const plugin = IBlazeSwapPlugin__factory.connect(await manager.delegationPlugin(), wallet)
    const impl = await plugin.implementation()
    const directFtsoReward = IIBlazeSwapPluginImpl__factory.connect(impl, wallet)
    await expect(directFtsoReward.initialize(constants.AddressZero)).to.be.revertedWith('DelegatedCalls: standard call')
  })

  it('initial state reward manager', async () => {
    const { _delegateAddresses, _bips, _count, _delegationMode } = await wNat.delegatesOf(rewardManagerAddress)

    expect(_count).to.eq(BigNumber.from('1'))
    expect(_delegationMode).to.eq(BigNumber.from('1'))
    expect(_delegateAddresses).to.deep.eq([TEST_PROVIDERS[0]])
    expect(_bips).to.deep.eq([BigNumber.from('10000')])
  })

  it('voteFor and voteOf', async () => {
    expect(await delegation.voteOf(wallet.address)).to.eq(constants.AddressZero)
    await expect(delegation.voteFor(TEST_PROVIDERS[0])).not.to.be.reverted
    expect(await delegation.voteOf(wallet.address)).to.eq(TEST_PROVIDERS[0])
    await expect(delegation.voteFor(TEST_PROVIDERS[1])).not.to.be.reverted
    expect(await delegation.voteOf(wallet.address)).to.eq(TEST_PROVIDERS[1])
  })

  async function addLiquidity(minter: SignerWithAddress, tokenAmount: BigNumber, wNatAmount: BigNumber) {
    await token0.transfer(pair.address, wNat.address == token0.address ? wNatAmount : tokenAmount)
    await token1.transfer(pair.address, wNat.address == token1.address ? wNatAmount : tokenAmount)
    const minterPair = pair.connect(minter)
    await minterPair.mint(minter.address)
  }

  async function removeLiquidity(minter: SignerWithAddress, amount: BigNumber) {
    const minterPair = pair.connect(minter)
    await minterPair.transfer(pair.address, amount)
    await minterPair.burn(minter.address)
  }

  it('providersCount, providersAll', async () => {
    await addLiquidity(wallet, expandTo18Decimals(1), expandTo18Decimals(1))
    await addLiquidity(other1, expandTo18Decimals(2), expandTo18Decimals(2))
    await addLiquidity(other2, expandTo18Decimals(3), expandTo18Decimals(3))
    // start
    expect(await delegation.providersCount()).to.eq(BigNumber.from('0'))
    expect(await delegation.providersAll()).to.deep.eq([])
    // vote
    await delegation.voteFor(TEST_PROVIDERS[0])
    await delegation.connect(other1).voteFor(TEST_PROVIDERS[1])
    await delegation.connect(other2).voteFor(TEST_PROVIDERS[2])
    expect(await delegation.providersCount()).to.eq(BigNumber.from('3'))
    expect(await delegation.providersAll()).to.deep.eq(TEST_PROVIDERS)
  })

  it('providers, providersVotes', async () => {
    await addLiquidity(wallet, expandTo18Decimals(1), expandTo18Decimals(1))
    await addLiquidity(other1, expandTo18Decimals(2), expandTo18Decimals(2))
    await addLiquidity(other2, expandTo18Decimals(3), expandTo18Decimals(3))
    await delegation.voteFor(TEST_PROVIDERS[0])
    await delegation.connect(other1).voteFor(TEST_PROVIDERS[1])
    await delegation.connect(other2).voteFor(TEST_PROVIDERS[2])
    expect(await delegation.providers(0)).to.eq(TEST_PROVIDERS[0])
    expect(await delegation.providerVotes(TEST_PROVIDERS[0])).to.eq(expandTo18Decimals(1).sub(MINIMUM_LIQUIDITY))
    expect(await delegation.providers(1)).to.eq(TEST_PROVIDERS[1])
    expect(await delegation.providerVotes(TEST_PROVIDERS[1])).to.eq(expandTo18Decimals(2))
    expect(await delegation.providers(2)).to.eq(TEST_PROVIDERS[2])
    expect(await delegation.providerVotes(TEST_PROVIDERS[2])).to.eq(expandTo18Decimals(3))
  })

  it('providersWithVotes, mostVotedProviders', async () => {
    await addLiquidity(wallet, expandTo18Decimals(1), expandTo18Decimals(1))
    await addLiquidity(other1, expandTo18Decimals(2), expandTo18Decimals(2))
    await addLiquidity(other2, expandTo18Decimals(3), expandTo18Decimals(3))
    expect(await delegation.mostVotedProviders(2)).to.deep.eq([[], []])
    await delegation.voteFor(TEST_PROVIDERS[0])
    expect(await delegation.mostVotedProviders(2)).to.deep.eq([
      [TEST_PROVIDERS[0]],
      [expandTo18Decimals(1).sub(MINIMUM_LIQUIDITY)],
    ])
    await delegation.connect(other1).voteFor(TEST_PROVIDERS[1])
    expect(await delegation.mostVotedProviders(2)).to.deep.eq([
      [TEST_PROVIDERS[1], TEST_PROVIDERS[0]],
      [expandTo18Decimals(2), expandTo18Decimals(1).sub(MINIMUM_LIQUIDITY)],
    ])
    await delegation.connect(other2).voteFor(TEST_PROVIDERS[2])
    expect(await delegation.mostVotedProviders(2)).to.deep.eq([
      [TEST_PROVIDERS[2], TEST_PROVIDERS[1]],
      [expandTo18Decimals(3), expandTo18Decimals(2)],
    ])
    const [providers, votes] = await delegation.providersWithVotes()
    expect(providers).to.deep.eq(TEST_PROVIDERS)
    expect(votes).to.deep.eq([
      expandTo18Decimals(1).sub(MINIMUM_LIQUIDITY),
      expandTo18Decimals(2),
      expandTo18Decimals(3),
    ])
  })

  it('providersSubset, providerSubsetWithVotes', async () => {
    await addLiquidity(wallet, expandTo18Decimals(1), expandTo18Decimals(1))
    await addLiquidity(other1, expandTo18Decimals(2), expandTo18Decimals(2))
    await addLiquidity(other2, expandTo18Decimals(3), expandTo18Decimals(3))
    await delegation.voteFor(TEST_PROVIDERS[0])
    await delegation.connect(other1).voteFor(TEST_PROVIDERS[1])
    await delegation.connect(other2).voteFor(TEST_PROVIDERS[2])
    expect(await delegation.providersSubset(0, 100)).to.deep.eq(TEST_PROVIDERS)
    expect(await delegation.providersSubset(0, 3)).to.deep.eq(TEST_PROVIDERS)
    expect(await delegation.providersSubset(0, 1)).to.deep.eq([TEST_PROVIDERS[0]])
    expect(await delegation.providersSubset(1, 2)).to.deep.eq([TEST_PROVIDERS[1], TEST_PROVIDERS[2]])

    const [providers, votes] = await delegation.providersSubsetWithVotes(1, 1)
    expect(providers).to.deep.eq([TEST_PROVIDERS[1]])
    expect(votes).to.deep.eq([expandTo18Decimals(2)])
  })

  it('move votes', async () => {
    await addLiquidity(wallet, expandTo18Decimals(1), expandTo18Decimals(1))
    await addLiquidity(other1, expandTo18Decimals(2), expandTo18Decimals(2))
    await addLiquidity(other2, expandTo18Decimals(3), expandTo18Decimals(3))

    await delegation.voteFor(TEST_PROVIDERS[0])
    await delegation.connect(other1).voteFor(TEST_PROVIDERS[1])
    await delegation.connect(other2).voteFor(TEST_PROVIDERS[2])

    expect(await delegation.providersCount()).to.eq(BigNumber.from('3'))
    expect(await delegation.providerVotes(TEST_PROVIDERS[1])).to.eq(expandTo18Decimals(2))
    expect(await delegation.providerVotes(TEST_PROVIDERS[2])).to.eq(expandTo18Decimals(3))
    expect(await delegation.mostVotedProviders(2)).to.deep.eq([
      [TEST_PROVIDERS[2], TEST_PROVIDERS[1]],
      [expandTo18Decimals(3), expandTo18Decimals(2)],
    ])

    // transfer LP tokens
    await pair.connect(other2).transfer(other1.address, expandTo18Decimals(3))

    expect(await delegation.providersCount()).to.eq(BigNumber.from('2'))
    expect(await delegation.providerVotes(TEST_PROVIDERS[1])).to.eq(expandTo18Decimals(5))
    expect(await delegation.providerVotes(TEST_PROVIDERS[2])).to.eq(expandTo18Decimals(0))
    expect(await delegation.mostVotedProviders(2)).to.deep.eq([
      [TEST_PROVIDERS[1], TEST_PROVIDERS[0]],
      [expandTo18Decimals(5), expandTo18Decimals(1).sub(MINIMUM_LIQUIDITY)],
    ])
  })

  it('change votes', async () => {
    await addLiquidity(wallet, expandTo18Decimals(1), expandTo18Decimals(1))
    await addLiquidity(other1, expandTo18Decimals(2), expandTo18Decimals(2))
    await addLiquidity(other2, expandTo18Decimals(3), expandTo18Decimals(3))

    await delegation.voteFor(TEST_PROVIDERS[0])
    await delegation.connect(other1).voteFor(TEST_PROVIDERS[1])
    await delegation.connect(other2).voteFor(TEST_PROVIDERS[2])

    // change vote
    await delegation.connect(other1).voteFor(TEST_PROVIDERS[0])

    expect(await delegation.providersCount()).to.eq(BigNumber.from('2'))
    expect(await delegation.mostVotedProviders(2)).to.deep.eq([
      [TEST_PROVIDERS[2], TEST_PROVIDERS[0]],
      [expandTo18Decimals(3), expandTo18Decimals(3).sub(MINIMUM_LIQUIDITY)],
    ])
  })

  it('burn votes', async () => {
    await addLiquidity(wallet, expandTo18Decimals(2), expandTo18Decimals(2))
    await addLiquidity(other1, expandTo18Decimals(3), expandTo18Decimals(3))
    await addLiquidity(other2, expandTo18Decimals(4), expandTo18Decimals(4))

    await delegation.voteFor(TEST_PROVIDERS[0])
    await delegation.connect(other1).voteFor(TEST_PROVIDERS[1])
    await delegation.connect(other2).voteFor(TEST_PROVIDERS[2])

    // burn tokens
    await removeLiquidity(other2, expandTo18Decimals(3))

    expect(await delegation.providersCount()).to.eq(BigNumber.from('3'))
    expect(await delegation.mostVotedProviders(2)).to.deep.eq([
      [TEST_PROVIDERS[1], TEST_PROVIDERS[0]],
      [expandTo18Decimals(3), expandTo18Decimals(2).sub(MINIMUM_LIQUIDITY)],
    ])
  })

  it('changeProviders: no votes', async () => {
    await addLiquidity(wallet, expandTo18Decimals(1), expandTo18Decimals(1))

    await delegation.voteFor(TEST_PROVIDERS[1])

    await expect(delegation.changeProviders([TEST_PROVIDERS[0]])).to.be.revertedWith('BlazeSwap: NO_VOTES')
  })

  it('changeProviders: 100% to one provider', async () => {
    await addLiquidity(wallet, expandTo18Decimals(1), expandTo18Decimals(1))

    await delegation.voteFor(TEST_PROVIDERS[1])

    await expect(delegation.changeProviders([TEST_PROVIDERS[1]])).not.to.be.reverted

    const { _delegateAddresses, _bips, _count, _delegationMode } = await wNat.delegatesOf(rewardManagerAddress)

    expect(_count).to.eq(BigNumber.from('1'))
    expect(_delegationMode).to.eq(BigNumber.from('1'))
    expect(_delegateAddresses).to.deep.eq([TEST_PROVIDERS[1]])
    expect(_bips).to.deep.eq([BigNumber.from('10000')])

    expect(await delegation.currentProviders()).to.deep.eq([[TEST_PROVIDERS[1]], [BigNumber.from(100_00)]])
  })

  it('changeProviders: 50% to two providers', async () => {
    await addLiquidity(wallet, expandTo18Decimals(1), expandTo18Decimals(1))
    await addLiquidity(other1, expandTo18Decimals(2), expandTo18Decimals(2))

    await delegation.voteFor(TEST_PROVIDERS[0])
    await delegation.connect(other1).voteFor(TEST_PROVIDERS[1])

    await expect(delegation.changeProviders([TEST_PROVIDERS[1], TEST_PROVIDERS[0]])).not.to.be.reverted

    const { _delegateAddresses, _bips, _count, _delegationMode } = await wNat.delegatesOf(rewardManagerAddress)

    expect(_count).to.eq(BigNumber.from('2'))
    expect(_delegationMode).to.eq(BigNumber.from('1'))
    expect(_delegateAddresses).to.deep.eq([TEST_PROVIDERS[1], TEST_PROVIDERS[0]])
    expect(_bips).to.deep.eq([BigNumber.from('5000'), BigNumber.from('5000')])

    expect(await delegation.currentProviders()).to.deep.eq([
      [TEST_PROVIDERS[1], TEST_PROVIDERS[0]],
      [BigNumber.from(50_00), BigNumber.from(50_00)],
    ])
  })

  it('changeProviders: no providers', async () => {
    await expect(delegation.changeProviders([])).to.be.revertedWith('BlazeSwap: NO_PROVIDERS')
  })

  it('changeProviders: AddressZero', async () => {
    await addLiquidity(wallet, expandTo18Decimals(1), expandTo18Decimals(1))

    await delegation.voteFor(TEST_PROVIDERS[1])

    await expect(delegation.changeProviders([constants.AddressZero])).to.be.revertedWith('BlazeSwap: ZERO_ADDRESS')
  })

  it('changeProviders: not sorted', async () => {
    await addLiquidity(wallet, expandTo18Decimals(1), expandTo18Decimals(1))
    await addLiquidity(other1, expandTo18Decimals(2), expandTo18Decimals(2))
    await addLiquidity(other2, expandTo18Decimals(2), expandTo18Decimals(2))

    await delegation.voteFor(TEST_PROVIDERS[0])
    await delegation.connect(other1).voteFor(TEST_PROVIDERS[1])
    await delegation.connect(other2).voteFor(TEST_PROVIDERS[2])

    await expect(delegation.changeProviders([TEST_PROVIDERS[0], TEST_PROVIDERS[1]])).to.be.revertedWith(
      'BlazeSwap: NOT_SORTED'
    )

    await expect(delegation.changeProviders([TEST_PROVIDERS[1], TEST_PROVIDERS[0]])).not.to.be.reverted
    await expect(delegation.changeProviders([TEST_PROVIDERS[1], TEST_PROVIDERS[2]])).not.to.be.reverted
  })

  it('changeProviders: duplicated addresses', async () => {
    await addLiquidity(wallet, expandTo18Decimals(1), expandTo18Decimals(1))
    await addLiquidity(other1, expandTo18Decimals(2), expandTo18Decimals(2))

    await delegation.voteFor(TEST_PROVIDERS[0])
    await delegation.connect(other1).voteFor(TEST_PROVIDERS[1])

    await expect(delegation.changeProviders([TEST_PROVIDERS[0], TEST_PROVIDERS[0]])).to.be.revertedWith(
      'BlazeSwap: DUPLICATED_PROVIDERS'
    )
  })

  it('changeProviders: wrong number', async () => {
    await addLiquidity(wallet, expandTo18Decimals(1), expandTo18Decimals(1))
    await addLiquidity(other1, expandTo18Decimals(2), expandTo18Decimals(2))
    await addLiquidity(other2, expandTo18Decimals(3), expandTo18Decimals(3))

    await delegation.voteFor(TEST_PROVIDERS[0])
    await delegation.connect(other1).voteFor(TEST_PROVIDERS[1])
    await delegation.connect(other2).voteFor(TEST_PROVIDERS[2])

    await expect(delegation.changeProviders([TEST_PROVIDERS[2]])).to.be.revertedWith('BlazeSwap: PROVIDERS_COUNT')
    await expect(
      delegation.changeProviders([TEST_PROVIDERS[2], TEST_PROVIDERS[1], TEST_PROVIDERS[0]])
    ).to.be.revertedWith('BlazeSwap: PROVIDERS_COUNT')
  })

  it('changeProviders: 3 providers', async () => {
    await addLiquidity(wallet, expandTo18Decimals(1), expandTo18Decimals(1))
    await addLiquidity(other1, expandTo18Decimals(2), expandTo18Decimals(2))
    await addLiquidity(other2, expandTo18Decimals(3), expandTo18Decimals(3))

    await delegation.voteFor(TEST_PROVIDERS[0])
    await delegation.connect(other1).voteFor(TEST_PROVIDERS[1])
    await delegation.connect(other2).voteFor(TEST_PROVIDERS[2])

    const delegationPlugin = BlazeSwapDelegationPlugin__factory.connect(await manager.delegationPlugin(), wallet)
    await delegationPlugin.setMaxDelegatesByPercent(3)

    await expect(delegation.changeProviders([TEST_PROVIDERS[2], TEST_PROVIDERS[1], TEST_PROVIDERS[0]])).not.to.be
      .reverted

    const { _delegateAddresses, _bips, _count, _delegationMode } = await wNat.delegatesOf(rewardManagerAddress)

    expect(_count).to.eq(BigNumber.from('3'))
    expect(_delegationMode).to.eq(BigNumber.from('1'))
    expect(_delegateAddresses).to.deep.eq([TEST_PROVIDERS[2], TEST_PROVIDERS[1], TEST_PROVIDERS[0]])
    expect(_bips).to.deep.eq([BigNumber.from('3334'), BigNumber.from('3333'), BigNumber.from('3333')])
  })

  it('changeProviders: same providers', async () => {
    await addLiquidity(wallet, expandTo18Decimals(1), expandTo18Decimals(1))
    await addLiquidity(other1, expandTo18Decimals(2), expandTo18Decimals(2))

    await delegation.voteFor(TEST_PROVIDERS[0])
    await delegation.connect(other1).voteFor(TEST_PROVIDERS[1])

    await expect(delegation.changeProviders([TEST_PROVIDERS[1], TEST_PROVIDERS[0]])).not.to.be.reverted
    // same providers
    await expect(delegation.changeProviders([TEST_PROVIDERS[1], TEST_PROVIDERS[0]])).not.to.be.reverted
  })

  it('changeProviders: same vote power', async () => {
    await addLiquidity(wallet, expandTo18Decimals(1), expandTo18Decimals(1))
    await addLiquidity(other1, expandTo18Decimals(2), expandTo18Decimals(2))
    await addLiquidity(other2, expandTo18Decimals(2), expandTo18Decimals(2))

    await delegation.voteFor(TEST_PROVIDERS[0])
    await delegation.connect(other1).voteFor(TEST_PROVIDERS[1])
    await delegation.connect(other2).voteFor(TEST_PROVIDERS[2])

    await expect(delegation.changeProviders([TEST_PROVIDERS[1], TEST_PROVIDERS[0]])).not.to.be.reverted
    // same vote power
    await expect(delegation.changeProviders([TEST_PROVIDERS[2], TEST_PROVIDERS[0]])).not.to.be.reverted
  })

  it('changeProviders: same vote power with fewer providers', async () => {
    await addLiquidity(wallet, expandTo18Decimals(1), expandTo18Decimals(1))
    await addLiquidity(other1, expandTo18Decimals(2), expandTo18Decimals(2))

    await delegation.voteFor(TEST_PROVIDERS[0])
    await delegation.connect(other1).voteFor(TEST_PROVIDERS[1])

    await expect(delegation.changeProviders([TEST_PROVIDERS[1], TEST_PROVIDERS[0]])).not.to.be.reverted

    await delegation.connect(other1).voteFor(TEST_PROVIDERS[0])

    await expect(delegation.changeProviders([TEST_PROVIDERS[0]])).not.to.be.reverted
  })

  it('changeProviders: switch to more voted providers', async () => {
    await addLiquidity(wallet, expandTo18Decimals(1), expandTo18Decimals(1))
    await addLiquidity(other1, expandTo18Decimals(2), expandTo18Decimals(2))
    await addLiquidity(other2, expandTo18Decimals(3), expandTo18Decimals(3))

    await delegation.voteFor(TEST_PROVIDERS[0])
    await delegation.connect(other1).voteFor(TEST_PROVIDERS[1])
    await delegation.connect(other2).voteFor(TEST_PROVIDERS[2])

    await expect(delegation.changeProviders([TEST_PROVIDERS[1], TEST_PROVIDERS[0]])).not.to.be.reverted
    await expect(delegation.changeProviders([TEST_PROVIDERS[2], TEST_PROVIDERS[0]])).not.to.be.reverted
    await expect(delegation.changeProviders([TEST_PROVIDERS[2], TEST_PROVIDERS[1]])).not.to.be.reverted

    const { _delegateAddresses, _bips, _count, _delegationMode } = await wNat.delegatesOf(rewardManagerAddress)

    expect(_count).to.eq(BigNumber.from('2'))
    expect(_delegationMode).to.eq(BigNumber.from('1'))
    expect(_delegateAddresses).to.deep.eq([TEST_PROVIDERS[2], TEST_PROVIDERS[1]])
    expect(_bips).to.deep.eq([BigNumber.from('5000'), BigNumber.from('5000')])
  })

  it('changeProviders: switch to more voted providers (even if less than before)', async () => {
    await addLiquidity(wallet, expandTo18Decimals(1), expandTo18Decimals(1))
    await addLiquidity(other1, expandTo18Decimals(2), expandTo18Decimals(2))
    await addLiquidity(other2, expandTo18Decimals(3), expandTo18Decimals(3))

    await delegation.voteFor(TEST_PROVIDERS[0])
    await delegation.connect(other1).voteFor(TEST_PROVIDERS[1])
    await delegation.connect(other2).voteFor(TEST_PROVIDERS[2])

    await expect(delegation.changeProviders([TEST_PROVIDERS[2], TEST_PROVIDERS[1]])).not.to.be.reverted

    await removeLiquidity(other2, expandTo18Decimals(3))

    await expect(delegation.changeProviders([TEST_PROVIDERS[1], TEST_PROVIDERS[0]])).not.to.be.reverted

    const { _delegateAddresses, _bips, _count, _delegationMode } = await wNat.delegatesOf(rewardManagerAddress)

    expect(_count).to.eq(BigNumber.from('2'))
    expect(_delegationMode).to.eq(BigNumber.from('1'))
    expect(_delegateAddresses).to.deep.eq([TEST_PROVIDERS[1], TEST_PROVIDERS[0]])
    expect(_bips).to.deep.eq([BigNumber.from('5000'), BigNumber.from('5000')])
  })

  it('changeProviders: flash attack', async () => {
    await addLiquidity(wallet, expandTo18Decimals(5), expandTo18Decimals(5))

    // can remove in different blocks
    await delegation.voteFor(TEST_PROVIDERS[1])
    await expect(delegation.changeProviders([TEST_PROVIDERS[1]])).not.to.be.reverted
    await expect(pair.transfer(pair.address, expandTo18Decimals(1))).not.to.be.reverted
    await expect(pair.burn(other1.address)).not.to.be.reverted

    // cannot remove in same transaction
    const delegationCoder = new Coder(BlazeSwapDelegation.abi)
    const pairCoder = new Coder(BlazeSwapPair.abi)
    await expect(
      pair.multicall([
        delegationCoder.encodeFunction('voteFor', { provider: TEST_PROVIDERS[2] }),
        delegationCoder.encodeFunction('changeProviders', { newProviders: [TEST_PROVIDERS[2]] }),
        pairCoder.encodeFunction('transfer', { to: pair.address, value: expandTo18Decimals(1) }),
        pairCoder.encodeFunction('burn', { to: other1.address }),
      ])
    ).to.be.revertedWith('BlazeSwap: FLASH_ATTACK')
  })

  it('currentProviders, providersAtCurrentEpoch, providersAtEpoch', async () => {
    await addLiquidity(wallet, expandTo18Decimals(5), expandTo18Decimals(5))

    expect(await delegation.currentProviders()).to.deep.eq([[TEST_PROVIDERS[0]], [BigNumber.from(100_00)]])
    expect(await delegation.providersAtCurrentEpoch()).to.deep.eq([[constants.AddressZero], [BigNumber.from(100_00)]])
    expect(await delegation.providersAtEpoch(1)).to.deep.eq([[constants.AddressZero], [BigNumber.from(100_00)]])
  })
})
