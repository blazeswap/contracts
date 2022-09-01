import { waffle } from 'hardhat'
import { expect } from 'chai'
import { BigNumber, constants, Wallet } from 'ethers'

import { pairWNatFixture, TEST_PROVIDERS } from './shared/fixtures'
import { expandTo18Decimals, getRewardManagerAddress, MINIMUM_LIQUIDITY } from './shared/utilities'

import BlazeSwapRewardManager from '../../artifacts/contracts/core/BlazeSwapRewardManager.sol/BlazeSwapRewardManager.json'
import BlazeSwapPair from '../../artifacts/contracts/core/BlazeSwapPair.sol/BlazeSwapPair.json'
import BlazeSwapDelegation from '../../artifacts/contracts/core/BlazeSwapDelegation.sol/BlazeSwapDelegation.json'

import { Coder } from 'abi-coder'

import {
  IBlazeSwapDelegation,
  IBlazeSwapDelegation__factory,
  IBlazeSwapManager,
  IBlazeSwapPair,
  IBlazeSwapPlugin__factory,
  IERC20,
  IIBlazeSwapPluginImpl__factory,
  IWNat,
} from '../../typechain-types'

const { createFixtureLoader } = waffle

describe('BlazeSwapDelegation', () => {
  const provider = waffle.provider
  const [wallet, other1, other2] = provider.getWallets()
  const loadFixture = createFixtureLoader([wallet], provider)

  let manager: IBlazeSwapManager
  let wNat: IWNat
  let token0: IERC20
  let token1: IERC20
  let pair: IBlazeSwapPair
  let delegation: IBlazeSwapDelegation
  let rewardManagerAddress: string
  beforeEach(async () => {
    const fixture = await loadFixture(pairWNatFixture)
    manager = fixture.manager
    wNat = fixture.wNat
    token0 = fixture.token0
    token1 = fixture.token1
    pair = fixture.pair
    delegation = IBlazeSwapDelegation__factory.connect(pair.address, wallet)
    rewardManagerAddress = getRewardManagerAddress(pair.address, BlazeSwapRewardManager.bytecode)
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

  async function addLiquidity(minter: Wallet, tokenAmount: BigNumber, wNatAmount: BigNumber) {
    await token0.transfer(pair.address, wNat.address == token0.address ? wNatAmount : tokenAmount)
    await token1.transfer(pair.address, wNat.address == token1.address ? wNatAmount : tokenAmount)
    const minterPair = pair.connect(minter)
    await minterPair.mint(minter.address)
  }

  async function removeLiquidity(minter: Wallet, amount: BigNumber) {
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
    expect(await delegation.mostVotedProviders()).to.deep.eq([constants.AddressZero, constants.AddressZero])
    await delegation.voteFor(TEST_PROVIDERS[0])
    expect(await delegation.mostVotedProviders()).to.deep.eq([TEST_PROVIDERS[0], constants.AddressZero])
    await delegation.connect(other1).voteFor(TEST_PROVIDERS[1])
    expect(await delegation.mostVotedProviders()).to.deep.eq([TEST_PROVIDERS[0], TEST_PROVIDERS[1]])
    await delegation.connect(other2).voteFor(TEST_PROVIDERS[2])
    expect(await delegation.mostVotedProviders()).to.deep.eq([TEST_PROVIDERS[2], TEST_PROVIDERS[1]])
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
    expect(await delegation.mostVotedProviders()).to.deep.eq([TEST_PROVIDERS[2], TEST_PROVIDERS[1]])

    // transfer LP tokens
    await pair.connect(other2).transfer(other1.address, expandTo18Decimals(3))

    expect(await delegation.providersCount()).to.eq(BigNumber.from('2'))
    expect(await delegation.providerVotes(TEST_PROVIDERS[1])).to.eq(expandTo18Decimals(5))
    expect(await delegation.providerVotes(TEST_PROVIDERS[2])).to.eq(expandTo18Decimals(0))
    expect(await delegation.mostVotedProviders()).to.deep.eq([TEST_PROVIDERS[0], TEST_PROVIDERS[1]])
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
    expect(await delegation.mostVotedProviders()).to.deep.eq([TEST_PROVIDERS[0], TEST_PROVIDERS[2]])
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
    expect(await delegation.mostVotedProviders()).to.deep.eq([TEST_PROVIDERS[0], TEST_PROVIDERS[1]])
  })

  it('changeProviders: no votes', async () => {
    await expect(delegation.changeProviders([TEST_PROVIDERS[0], constants.AddressZero])).to.be.revertedWith(
      'BlazeSwap: INVALID_PROVIDERS'
    )
  })

  it('changeProviders: 100% to one provider', async () => {
    await addLiquidity(wallet, expandTo18Decimals(1), expandTo18Decimals(1))

    await delegation.voteFor(TEST_PROVIDERS[1])

    await expect(delegation.changeProviders([TEST_PROVIDERS[1], constants.AddressZero])).not.to.be.reverted

    const { _delegateAddresses, _bips, _count, _delegationMode } = await wNat.delegatesOf(rewardManagerAddress)

    expect(_count).to.eq(BigNumber.from('1'))
    expect(_delegationMode).to.eq(BigNumber.from('1'))
    expect(_delegateAddresses).to.deep.eq([TEST_PROVIDERS[1]])
    expect(_bips).to.deep.eq([BigNumber.from('10000')])

    expect(await delegation.currentProviders()).to.deep.eq([TEST_PROVIDERS[1]])
  })

  it('changeProviders: 50% to two providers', async () => {
    await addLiquidity(wallet, expandTo18Decimals(1), expandTo18Decimals(1))
    await addLiquidity(other1, expandTo18Decimals(2), expandTo18Decimals(2))

    await delegation.voteFor(TEST_PROVIDERS[0])
    await delegation.connect(other1).voteFor(TEST_PROVIDERS[1])

    await expect(delegation.changeProviders([TEST_PROVIDERS[0], TEST_PROVIDERS[1]])).not.to.be.reverted

    const { _delegateAddresses, _bips, _count, _delegationMode } = await wNat.delegatesOf(rewardManagerAddress)

    expect(_count).to.eq(BigNumber.from('2'))
    expect(_delegationMode).to.eq(BigNumber.from('1'))
    expect(_delegateAddresses).to.deep.eq([TEST_PROVIDERS[0], TEST_PROVIDERS[1]])
    expect(_bips).to.deep.eq([BigNumber.from('5000'), BigNumber.from('5000')])

    expect(await delegation.currentProviders()).to.deep.eq([TEST_PROVIDERS[0], TEST_PROVIDERS[1]])
  })

  it('changeProviders: both AddressZero', async () => {
    await expect(delegation.changeProviders([constants.AddressZero, constants.AddressZero])).to.be.revertedWith(
      'BlazeSwap: INVALID_PROVIDERS'
    )
  })

  it('changeProviders: only one if multiple voted', async () => {
    await addLiquidity(wallet, expandTo18Decimals(1), expandTo18Decimals(1))
    await addLiquidity(other1, expandTo18Decimals(2), expandTo18Decimals(2))

    await delegation.voteFor(TEST_PROVIDERS[0])
    await delegation.connect(other1).voteFor(TEST_PROVIDERS[1])

    await expect(delegation.changeProviders([TEST_PROVIDERS[1], constants.AddressZero])).to.be.revertedWith(
      'BlazeSwap: INVALID_PROVIDERS'
    )
  })

  it('changeProviders: same providers', async () => {
    await addLiquidity(wallet, expandTo18Decimals(1), expandTo18Decimals(1))
    await addLiquidity(other1, expandTo18Decimals(2), expandTo18Decimals(2))

    await delegation.voteFor(TEST_PROVIDERS[0])
    await delegation.connect(other1).voteFor(TEST_PROVIDERS[1])

    await expect(delegation.changeProviders([TEST_PROVIDERS[0], TEST_PROVIDERS[1]])).not.to.be.reverted
    // same providers
    await expect(delegation.changeProviders([TEST_PROVIDERS[1], TEST_PROVIDERS[0]])).to.be.revertedWith(
      'BlazeSwap: INVALID_PROVIDERS'
    )
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
    await expect(delegation.changeProviders([TEST_PROVIDERS[2], TEST_PROVIDERS[0]])).to.be.revertedWith(
      'BlazeSwap: INVALID_PROVIDERS'
    )
  })

  it('changeProviders: switch to more voted providers', async () => {
    await addLiquidity(wallet, expandTo18Decimals(1), expandTo18Decimals(1))
    await addLiquidity(other1, expandTo18Decimals(2), expandTo18Decimals(2))
    await addLiquidity(other2, expandTo18Decimals(3), expandTo18Decimals(3))

    await delegation.voteFor(TEST_PROVIDERS[0])
    await delegation.connect(other1).voteFor(TEST_PROVIDERS[1])
    await delegation.connect(other2).voteFor(TEST_PROVIDERS[2])

    await expect(delegation.changeProviders([TEST_PROVIDERS[0], TEST_PROVIDERS[1]])).not.to.be.reverted
    await expect(delegation.changeProviders([TEST_PROVIDERS[0], TEST_PROVIDERS[2]])).not.to.be.reverted
    await expect(delegation.changeProviders([TEST_PROVIDERS[1], TEST_PROVIDERS[2]])).not.to.be.reverted

    const { _delegateAddresses, _bips, _count, _delegationMode } = await wNat.delegatesOf(rewardManagerAddress)

    expect(_count).to.eq(BigNumber.from('2'))
    expect(_delegationMode).to.eq(BigNumber.from('1'))
    expect(_delegateAddresses).to.deep.eq([TEST_PROVIDERS[1], TEST_PROVIDERS[2]])
    expect(_bips).to.deep.eq([BigNumber.from('5000'), BigNumber.from('5000')])
  })

  it('changeProviders: switch to more voted providers (even if less than before)', async () => {
    await addLiquidity(wallet, expandTo18Decimals(1), expandTo18Decimals(1))
    await addLiquidity(other1, expandTo18Decimals(2), expandTo18Decimals(2))
    await addLiquidity(other2, expandTo18Decimals(3), expandTo18Decimals(3))

    await delegation.voteFor(TEST_PROVIDERS[0])
    await delegation.connect(other1).voteFor(TEST_PROVIDERS[1])
    await delegation.connect(other2).voteFor(TEST_PROVIDERS[2])

    await expect(delegation.changeProviders([TEST_PROVIDERS[1], TEST_PROVIDERS[2]])).not.to.be.reverted

    await removeLiquidity(other2, expandTo18Decimals(3))

    await expect(delegation.changeProviders([TEST_PROVIDERS[0], TEST_PROVIDERS[1]])).not.to.be.reverted

    const { _delegateAddresses, _bips, _count, _delegationMode } = await wNat.delegatesOf(rewardManagerAddress)

    expect(_count).to.eq(BigNumber.from('2'))
    expect(_delegationMode).to.eq(BigNumber.from('1'))
    expect(_delegateAddresses).to.deep.eq([TEST_PROVIDERS[0], TEST_PROVIDERS[1]])
    expect(_bips).to.deep.eq([BigNumber.from('5000'), BigNumber.from('5000')])
  })

  it('changeProviders: flash attack', async () => {
    await addLiquidity(wallet, expandTo18Decimals(5), expandTo18Decimals(5))

    // can remove in different blocks
    await delegation.voteFor(TEST_PROVIDERS[1])
    await expect(delegation.changeProviders([TEST_PROVIDERS[1], constants.AddressZero])).not.to.be.reverted
    await expect(pair.transfer(pair.address, expandTo18Decimals(1))).not.to.be.reverted
    await expect(pair.burn(other1.address)).not.to.be.reverted

    // cannot remove in same transaction
    const delegationCoder = new Coder(BlazeSwapDelegation.abi)
    const pairCoder = new Coder(BlazeSwapPair.abi)
    await expect(
      pair.multicall([
        delegationCoder.encodeFunction('voteFor', { provider: TEST_PROVIDERS[2] }),
        delegationCoder.encodeFunction('changeProviders', { newProviders: [TEST_PROVIDERS[2], constants.AddressZero] }),
        pairCoder.encodeFunction('transfer', { to: pair.address, value: expandTo18Decimals(1) }),
        pairCoder.encodeFunction('burn', { to: other1.address }),
      ])
    ).to.be.revertedWith('BlazeSwap: FLASH_ATTACK')
  })

  it('currentProviders, providersAtCurrentEpoch, providersAtEpoch', async () => {
    await addLiquidity(wallet, expandTo18Decimals(5), expandTo18Decimals(5))

    expect(await delegation.currentProviders()).to.deep.eq([TEST_PROVIDERS[0]])
    expect(await delegation.providersAtCurrentEpoch()).to.deep.eq([constants.AddressZero])
    expect(await delegation.providersAtEpoch(1)).to.deep.eq([constants.AddressZero])
  })

  it('withdrawRewardFees', async () => {
    const rewardAmount = expandTo18Decimals(2)

    await expect(delegation.withdrawRewardFees()).not.to.be.reverted

    await wNat.transfer(rewardManagerAddress, rewardAmount)

    await expect(delegation.withdrawRewardFees()).to.be.revertedWith('BlazeSwap: ZERO_ADDRESS')

    await manager.setRewardsFeeTo(other1.address)

    await expect(() => delegation.withdrawRewardFees()).to.changeTokenBalance(wNat, other1, rewardAmount)
  })
})
