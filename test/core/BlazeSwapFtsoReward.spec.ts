import hre from 'hardhat'
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers'
import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { expect } from 'chai'
import { BigNumber, constants } from 'ethers'

import { pairWNatFixture } from './shared/fixtures'
import {
  expandTo18Decimals,
  getLatestBlockNumber,
  getRewardManagerAddress,
  MINIMUM_LIQUIDITY,
} from './shared/utilities'

import BlazeSwapFtsoReward from '../../artifacts/contracts/core/BlazeSwapFtsoReward.sol/BlazeSwapFtsoReward.json'

import { Coder } from 'abi-coder'

import {
  IBlazeSwapFtsoReward,
  IBlazeSwapFtsoReward__factory,
  IBlazeSwapManager,
  IBlazeSwapPair,
  IBlazeSwapPlugin__factory,
  IERC20,
  FtsoManager,
  FtsoRewardManager,
  IIBlazeSwapPluginImpl__factory,
  IWNat,
  IBlazeSwapExecutorManager__factory,
  IBlazeSwapRewards,
  IBlazeSwapRewards__factory,
  FlareContractRegistry,
  IBlazeSwapRewardsPlugin,
  IBlazeSwapRewardsPlugin__factory,
} from '../../typechain-types'

import { deployContract } from '../shared/shared/utilities'

describe('BlazeSwapFtsoReward', () => {
  let wallet: SignerWithAddress
  let other: SignerWithAddress

  let manager: IBlazeSwapManager
  let registry: FlareContractRegistry
  let ftsoManager: FtsoManager
  let ftsoRewardManager: FtsoRewardManager
  let wNat: IWNat
  let token0: IERC20
  let token1: IERC20
  let pair: IBlazeSwapPair
  let rewardsPlugin: IBlazeSwapRewardsPlugin
  let rewards: IBlazeSwapRewards
  let ftsoReward: IBlazeSwapFtsoReward
  beforeEach(async () => {
    [wallet, other] = await hre.ethers.getSigners()
    const fixture = await loadFixture(pairWNatFixture)
    manager = fixture.manager
    registry = fixture.registry
    ftsoManager = fixture.ftsoManager
    ftsoRewardManager = fixture.ftsoRewardManager
    wNat = fixture.wNat
    token0 = fixture.token0
    token1 = fixture.token1
    pair = fixture.pair
    rewardsPlugin = IBlazeSwapRewardsPlugin__factory.connect(await manager.rewardsPlugin(), wallet)
    rewards = IBlazeSwapRewards__factory.connect(pair.address, other)
    ftsoReward = IBlazeSwapFtsoReward__factory.connect(pair.address, wallet)
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

  function applyFee(amount: BigNumber) {
    return amount.mul(98_10).div(100_00)
  }

  it('initialize:forbiddenDelegated', async () => {
    await expect(
      IIBlazeSwapPluginImpl__factory.connect(pair.address, wallet).initialize(constants.AddressZero)
    ).to.be.revertedWith('BlazeSwap: INVALID_FUNCTION')
  })

  it('initialize:forbiddenDirect', async () => {
    const plugin = IBlazeSwapPlugin__factory.connect(await manager.ftsoRewardPlugin(), wallet)
    const impl = await plugin.implementation()
    const directFtsoReward = IIBlazeSwapPluginImpl__factory.connect(impl, wallet)
    await expect(directFtsoReward.initialize(constants.AddressZero)).to.be.revertedWith('DelegatedCalls: standard call')
  })

  it('accruingFtsoRewards', async () => {
    await addLiquidity(wallet, expandTo18Decimals(2), expandTo18Decimals(8))
    await addLiquidity(other, expandTo18Decimals(1), expandTo18Decimals(4))
    await ftsoManager.startRewardEpoch(1, await getLatestBlockNumber())
    expect(await ftsoReward.accruingFtsoRewards(constants.AddressZero)).to.eq(0)
    expect(await ftsoReward.accruingFtsoRewards(other.address)).to.eq(0)
    await ftsoRewardManager.addRewards(pair.address, 1, 1000)
    const expectedRewards = expandTo18Decimals(8 + 4).div(10)
    expect(await ftsoReward.accruingFtsoRewards(constants.AddressZero)).to.eq(expectedRewards)
    expect(await ftsoReward.accruingFtsoRewards(other.address)).to.eq(expectedRewards.div(3))
    await manager.setFtsoRewardsFeeBips(1_90)
    expect(await ftsoReward.accruingFtsoRewards(constants.AddressZero)).to.eq(applyFee(expectedRewards))
    expect(await ftsoReward.accruingFtsoRewards(other.address)).to.eq(applyFee(expectedRewards).div(3))
  })

  async function replaceFtsoRewardManager() {
    const oldManager = await ftsoManager.rewardManager()
    const newManager = (await deployContract('FtsoRewardManager', [oldManager])) as FtsoRewardManager
    await registry.setContractAddress('WNat', registry.getContractAddressByName('WNat'), [newManager.address])
    await registry.setContractAddress('FtsoManager', ftsoManager.address, [newManager.address])
    await registry.setContractAddress('FtsoRewardManager', newManager.address, [ftsoManager.address])
    await newManager.initialize()
    await newManager.activate()
    return newManager
  }

  it('accruingFtsoRewards:multiple', async () => {
    await addLiquidity(wallet, expandTo18Decimals(2), expandTo18Decimals(8))
    await addLiquidity(other, expandTo18Decimals(1), expandTo18Decimals(4))
    await ftsoManager.startRewardEpoch(1, await getLatestBlockNumber())
    await ftsoRewardManager.addRewards(pair.address, 1, 1000)

    const secondFtsoRewardManager = await replaceFtsoRewardManager()
    await secondFtsoRewardManager.addRewards(pair.address, 1, 2000)

    let expectedRewards = expandTo18Decimals(8 + 4)
      .div(10)
      .mul(3)
    expect(await ftsoReward.accruingFtsoRewards(constants.AddressZero)).to.eq(expectedRewards)
    expect(await ftsoReward.accruingFtsoRewards(other.address)).to.eq(expectedRewards.div(3))

    await ftsoRewardManager.deactivate()
    expectedRewards = expandTo18Decimals(8 + 4)
      .div(10)
      .mul(2)
    expect(await ftsoReward.accruingFtsoRewards(constants.AddressZero)).to.eq(expectedRewards)
    expect(await ftsoReward.accruingFtsoRewards(other.address)).to.eq(expectedRewards.div(3))
  })

  it('epochsWithUndistributedFtsoRewards', async () => {
    await addLiquidity(wallet, expandTo18Decimals(2), expandTo18Decimals(8))
    await addLiquidity(other, expandTo18Decimals(1), expandTo18Decimals(4))
    await ftsoManager.startRewardEpoch(1, await getLatestBlockNumber())
    await ftsoRewardManager.addRewards(pair.address, 1, 1000)
    await ftsoManager.startRewardEpoch(2, await getLatestBlockNumber())
    await ftsoRewardManager.addRewards(pair.address, 2, 500)
    await ftsoManager.startRewardEpoch(3, await getLatestBlockNumber())

    let [epochs, amounts, totalAmounts] = await ftsoReward.epochsWithUndistributedFtsoRewards(constants.AddressZero)
    expect(epochs).to.deep.eq([BigNumber.from('1'), BigNumber.from('2')])
    expect(amounts).to.deep.eq([BigNumber.from('0'), BigNumber.from('0')])
    expect(totalAmounts).to.deep.eq([expandTo18Decimals(8 + 4).div(10), expandTo18Decimals(8 + 4).div(20)])
    ;[epochs, amounts, totalAmounts] = await ftsoReward.epochsWithUndistributedFtsoRewards(other.address)
    expect(epochs).to.deep.eq([BigNumber.from('1'), BigNumber.from('2')])
    expect(amounts).to.deep.eq([
      expandTo18Decimals(8 + 4)
        .div(10)
        .div(3),
      expandTo18Decimals(8 + 4)
        .div(20)
        .div(3),
    ])
    expect(totalAmounts).to.deep.eq([expandTo18Decimals(8 + 4).div(10), expandTo18Decimals(8 + 4).div(20)])

    await manager.setFtsoRewardsFeeBips(1_90)
    ;[epochs, amounts, totalAmounts] = await ftsoReward.epochsWithUndistributedFtsoRewards(other.address)
    expect(epochs).to.deep.eq([BigNumber.from('1'), BigNumber.from('2')])
    expect(amounts).to.deep.eq([
      applyFee(
        expandTo18Decimals(8 + 4)
          .div(10)
          .div(3)
      ),
      applyFee(
        expandTo18Decimals(8 + 4)
          .div(20)
          .div(3)
      ),
    ])
    expect(totalAmounts).to.deep.eq([expandTo18Decimals(8 + 4).div(10), expandTo18Decimals(8 + 4).div(20)])
  })

  it('epochsWithUndistributedFtsoRewards:multiple-separate', async () => {
    await addLiquidity(wallet, expandTo18Decimals(2), expandTo18Decimals(8))
    await ftsoManager.startRewardEpoch(1, await getLatestBlockNumber())
    await ftsoRewardManager.addRewards(pair.address, 1, 1000)
    await ftsoManager.startRewardEpoch(2, await getLatestBlockNumber())

    const secondFtsoRewardManager = await replaceFtsoRewardManager()
    await secondFtsoRewardManager.addRewards(pair.address, 2, 500)

    await ftsoManager.startRewardEpoch(3, await getLatestBlockNumber())

    let [epochs, amounts, totalAmounts] = await ftsoReward.epochsWithUndistributedFtsoRewards(constants.AddressZero)
    expect(epochs).to.deep.eq([BigNumber.from('1'), BigNumber.from('2')])
    expect(amounts).to.deep.eq([BigNumber.from('0'), BigNumber.from('0')])
    expect(totalAmounts).to.deep.eq([expandTo18Decimals(8).div(10), expandTo18Decimals(8).div(20)])

    await ftsoRewardManager.deactivate()
    ;[epochs, amounts, totalAmounts] = await ftsoReward.epochsWithUndistributedFtsoRewards(constants.AddressZero)
    expect(epochs).to.deep.eq([BigNumber.from('2')])
    expect(amounts).to.deep.eq([BigNumber.from('0')])
    expect(totalAmounts).to.deep.eq([expandTo18Decimals(8).div(20)])
  })

  it('epochsWithUndistributedFtsoRewards:multiple-shared', async () => {
    await addLiquidity(wallet, expandTo18Decimals(2), expandTo18Decimals(8))
    await ftsoManager.startRewardEpoch(1, await getLatestBlockNumber())
    await ftsoRewardManager.addRewards(pair.address, 1, 500)

    const secondFtsoRewardManager = await replaceFtsoRewardManager()
    await secondFtsoRewardManager.addRewards(pair.address, 1, 500)

    await ftsoManager.startRewardEpoch(2, await getLatestBlockNumber())
    await secondFtsoRewardManager.addRewards(pair.address, 2, 500)

    await ftsoManager.startRewardEpoch(3, await getLatestBlockNumber())

    let [epochs, amounts, totalAmounts] = await ftsoReward.epochsWithUndistributedFtsoRewards(constants.AddressZero)
    expect(epochs).to.deep.eq([BigNumber.from('1'), BigNumber.from('2')])
    expect(amounts).to.deep.eq([BigNumber.from('0'), BigNumber.from('0')])
    expect(totalAmounts).to.deep.eq([expandTo18Decimals(8).div(10), expandTo18Decimals(8).div(20)])

    await ftsoRewardManager.deactivate()
    ;[epochs, amounts, totalAmounts] = await ftsoReward.epochsWithUndistributedFtsoRewards(constants.AddressZero)
    expect(epochs).to.deep.eq([BigNumber.from('1'), BigNumber.from('2')])
    expect(amounts).to.deep.eq([BigNumber.from('0'), BigNumber.from('0')])
    expect(totalAmounts).to.deep.eq([expandTo18Decimals(8).div(20), expandTo18Decimals(8).div(20)])
  })

  it('distributeFtsoRewards', async () => {
    await ftsoManager.startRewardEpoch(1, await getLatestBlockNumber())
    const wNatAmount = expandTo18Decimals(1000)
    await wNat.transfer(pair.address, wNatAmount)
    await ftsoRewardManager.addRewards(pair.address, 1, 1000)

    await ftsoManager.startRewardEpoch(2, await getLatestBlockNumber())
    await ftsoRewardManager.addRewards(pair.address, 2, 100)
    expect(await ftsoRewardManager.getEpochsWithUnclaimedRewards(pair.address)).to.deep.eq([])

    await ftsoManager.startRewardEpoch(3, await getLatestBlockNumber())
    expect(await ftsoRewardManager.getEpochsWithUnclaimedRewards(pair.address)).to.deep.eq([BigNumber.from('2')])

    const expectedRewards = expandTo18Decimals(1000 / 100) // 10

    const rewardManagerAddress = getRewardManagerAddress(pair.address)

    await expect(ftsoReward.distributeFtsoRewards([2]))
      .to.emit(ftsoReward, 'FtsoRewardsDistributed')
      .withArgs(BigNumber.from('2'), expectedRewards, wallet.address)

    expect(await wNat.balanceOf(rewardManagerAddress)).to.eq(expectedRewards)
  })

  it('distributeFtsoRewards:previous-epochs', async () => {
    await addLiquidity(wallet, expandTo18Decimals(10), expandTo18Decimals(10))

    await ftsoManager.startRewardEpoch(1, await getLatestBlockNumber())
    await ftsoRewardManager.addRewards(pair.address, 1, 1000)

    await addLiquidity(other, expandTo18Decimals(10), expandTo18Decimals(10))

    await ftsoManager.startRewardEpoch(2, await getLatestBlockNumber())
    await ftsoRewardManager.addRewards(pair.address, 2, 500)

    await ftsoManager.startRewardEpoch(3, await getLatestBlockNumber())

    const expectedRewards1 = expandTo18Decimals(10).div(10)
    const expectedRewards2 = expandTo18Decimals(20).div(20)

    const rewardManagerAddress = getRewardManagerAddress(pair.address)

    await expect(ftsoReward.distributeFtsoRewards([2]))
      .to.emit(ftsoReward, 'FtsoRewardsDistributed')
      .withArgs(BigNumber.from('1'), expectedRewards1, wallet.address)
      .to.emit(ftsoReward, 'FtsoRewardsDistributed')
      .withArgs(BigNumber.from('2'), expectedRewards2, wallet.address)

    expect(await wNat.balanceOf(rewardManagerAddress)).to.eq(expectedRewards1.add(expectedRewards2))

    const expectedWalletRewards1 = expectedRewards1
      .mul(expandTo18Decimals(10).sub(MINIMUM_LIQUIDITY))
      .div(expandTo18Decimals(10))

    const expectedWalletRewards2 = expectedRewards2
      .mul(expandTo18Decimals(10).sub(MINIMUM_LIQUIDITY))
      .div(expandTo18Decimals(20))

    const { epochs, amounts } = await ftsoReward.epochsWithUnclaimedFtsoRewards(wallet.address)
    expect(epochs).to.deep.eq([BigNumber.from('1'), BigNumber.from('2')])
    expect(amounts).to.deep.eq([expectedWalletRewards1, expectedWalletRewards2])
  })

  it('distributeFtsoRewards:multiple', async () => {
    let curFtsoRewardManager = ftsoRewardManager
    const amount = expandTo18Decimals(10)

    await addLiquidity(wallet, amount, amount)

    // 1st epoch of 1st RM
    await ftsoManager.startRewardEpoch(1, await getLatestBlockNumber())
    await curFtsoRewardManager.addRewards(pair.address, 1, 10, { value: amount })
    // 2nd epoch of deactivated 2nd RM
    await ftsoManager.startRewardEpoch(2, await getLatestBlockNumber())
    curFtsoRewardManager = await replaceFtsoRewardManager()
    await curFtsoRewardManager.addRewards(pair.address, 2, 20, { value: amount })
    await curFtsoRewardManager.deactivate()
    // 3rd epoch splitted between 3rd, 4th (deactivated), 5th RMs
    await ftsoManager.startRewardEpoch(3, await getLatestBlockNumber())
    curFtsoRewardManager = await replaceFtsoRewardManager()
    await curFtsoRewardManager.addRewards(pair.address, 3, 15, { value: amount })
    curFtsoRewardManager = await replaceFtsoRewardManager()
    await curFtsoRewardManager.addRewards(pair.address, 3, 15, { value: amount })
    await curFtsoRewardManager.deactivate()
    curFtsoRewardManager = await replaceFtsoRewardManager()
    await curFtsoRewardManager.addRewards(pair.address, 3, 15, { value: amount })
    // 4th epoch on 5th RM, 6th RM not used yet
    await ftsoManager.startRewardEpoch(4, await getLatestBlockNumber())
    await curFtsoRewardManager.addRewards(pair.address, 4, 40, { value: amount })
    curFtsoRewardManager = await replaceFtsoRewardManager()
    // start epoch 6
    await ftsoManager.startRewardEpoch(5, await getLatestBlockNumber())

    const expectedRewards1 = expandTo18Decimals(10).div(1000)
    const expectedRewards3 = expandTo18Decimals(10).div(1000).mul(3)
    const expectedRewards4 = expandTo18Decimals(10).div(1000).mul(4)

    const rewardManagerAddress = getRewardManagerAddress(pair.address)

    await expect(ftsoReward.distributeFtsoRewards([4]))
      .to.emit(ftsoReward, 'FtsoRewardsDistributed')
      .withArgs(BigNumber.from('1'), expectedRewards1, wallet.address)
      .to.emit(ftsoReward, 'FtsoRewardsDistributed')
      .withArgs(BigNumber.from('3'), expectedRewards3, wallet.address)
      .to.emit(ftsoReward, 'FtsoRewardsDistributed')
      .withArgs(BigNumber.from('4'), expectedRewards4, wallet.address)

    expect(await wNat.balanceOf(rewardManagerAddress)).to.eq(
      expectedRewards1.add(expectedRewards3).add(expectedRewards4)
    )
  })

  it('epochsWithUnclaimedFtsoRewards', async () => {
    await addLiquidity(wallet, expandTo18Decimals(2), expandTo18Decimals(8))
    await ftsoManager.startRewardEpoch(1, await getLatestBlockNumber())
    await ftsoRewardManager.addRewards(pair.address, 1, 100)
    await addLiquidity(wallet, expandTo18Decimals(1), expandTo18Decimals(4))
    await ftsoManager.startRewardEpoch(2, await getLatestBlockNumber())
    await ftsoRewardManager.addRewards(pair.address, 2, 100)
    await ftsoManager.startRewardEpoch(3, await getLatestBlockNumber())

    await ftsoReward.distributeFtsoRewards([1, 2])

    const expectedRewards1 = expandTo18Decimals(8).div(100)
    const expectedWalletRewards1 = expectedRewards1
      .mul(expandTo18Decimals(4).sub(MINIMUM_LIQUIDITY))
      .div(expandTo18Decimals(4))

    const expectedRewards2 = expandTo18Decimals(12).div(100)
    const expectedWalletRewards2 = expectedRewards2
      .mul(expandTo18Decimals(6).sub(MINIMUM_LIQUIDITY))
      .div(expandTo18Decimals(6))

    const { epochs, amounts } = await ftsoReward.epochsWithUnclaimedFtsoRewards(wallet.address)
    expect(epochs).to.deep.eq([BigNumber.from('1'), BigNumber.from('2')])
    expect(amounts).to.deep.eq([expectedWalletRewards1, expectedWalletRewards2])
  })

  it('claimFtsoRewards:native', async () => {
    await addLiquidity(wallet, expandTo18Decimals(1), expandTo18Decimals(1))

    await ftsoManager.startRewardEpoch(1, await getLatestBlockNumber())
    await ftsoRewardManager.addRewards(pair.address, 1, 100)
    await ftsoManager.startRewardEpoch(2, await getLatestBlockNumber())

    await ftsoReward.distributeFtsoRewards([1])

    const expectedRewards = expandTo18Decimals(1).div(100)
    const expectedWalletRewards = expectedRewards
      .mul(expandTo18Decimals(1).sub(MINIMUM_LIQUIDITY))
      .div(expandTo18Decimals(1))

    await expect(() => ftsoReward.claimFtsoRewards([1], wallet.address, false)).to.changeEtherBalance(
      wallet,
      expectedWalletRewards
    )

    expect(await ftsoReward.claimedFtsoRewards(wallet.address, 1)).to.eq(expectedWalletRewards)
  })

  it('claimFtsoRewards:wrapped', async () => {
    await addLiquidity(wallet, expandTo18Decimals(1), expandTo18Decimals(1))

    await ftsoManager.startRewardEpoch(1, await getLatestBlockNumber())
    await ftsoRewardManager.addRewards(pair.address, 1, 100)
    await ftsoManager.startRewardEpoch(2, await getLatestBlockNumber())

    await ftsoReward.distributeFtsoRewards([1])

    const expectedRewards = expandTo18Decimals(1).div(100)
    const expectedWalletRewards = expectedRewards
      .mul(expandTo18Decimals(1).sub(MINIMUM_LIQUIDITY))
      .div(expandTo18Decimals(1))

    await expect(() => ftsoReward.claimFtsoRewards([1], wallet.address, true)).to.changeTokenBalance(
      wNat,
      wallet,
      expectedWalletRewards
    )

    expect(await ftsoReward.claimedFtsoRewards(wallet.address, 1)).to.eq(expectedWalletRewards)
  })

  it('claimFtsoRewards:nativeTo', async () => {
    await addLiquidity(wallet, expandTo18Decimals(1), expandTo18Decimals(1))

    await ftsoManager.startRewardEpoch(1, await getLatestBlockNumber())
    await ftsoRewardManager.addRewards(pair.address, 1, 100)
    await ftsoManager.startRewardEpoch(2, await getLatestBlockNumber())

    await ftsoReward.distributeFtsoRewards([1])

    const expectedRewards = expandTo18Decimals(1).div(100)
    const expectedWalletRewards = expectedRewards
      .mul(expandTo18Decimals(1).sub(MINIMUM_LIQUIDITY))
      .div(expandTo18Decimals(1))

    await expect(() => ftsoReward.claimFtsoRewards([1], other.address, false)).to.changeEtherBalance(
      other,
      expectedWalletRewards
    )

    expect(await ftsoReward.claimedFtsoRewards(wallet.address, 1)).to.eq(expectedWalletRewards)
  })

  it('claimFtsoRewards:wrappedTo', async () => {
    await addLiquidity(wallet, expandTo18Decimals(1), expandTo18Decimals(1))

    await ftsoManager.startRewardEpoch(1, await getLatestBlockNumber())
    await ftsoRewardManager.addRewards(pair.address, 1, 100)
    await ftsoManager.startRewardEpoch(2, await getLatestBlockNumber())

    await ftsoReward.distributeFtsoRewards([1])

    const expectedRewards = expandTo18Decimals(1).div(100)
    const expectedWalletRewards = expectedRewards
      .mul(expandTo18Decimals(1).sub(MINIMUM_LIQUIDITY))
      .div(expandTo18Decimals(1))

    await expect(() => ftsoReward.claimFtsoRewards([1], other.address, true)).to.changeTokenBalance(
      wNat,
      other,
      expectedWalletRewards
    )

    expect(await ftsoReward.claimedFtsoRewards(wallet.address, 1)).to.eq(expectedWalletRewards)
  })

  it('claimFtsoRewards:shares', async () => {
    await addLiquidity(wallet, expandTo18Decimals(1), expandTo18Decimals(1))
    await addLiquidity(other, expandTo18Decimals(3), expandTo18Decimals(3))

    await ftsoManager.startRewardEpoch(1, await getLatestBlockNumber())
    await ftsoRewardManager.addRewards(pair.address, 1, 100)
    await removeLiquidity(wallet, expandTo18Decimals(1).sub(MINIMUM_LIQUIDITY))
    await ftsoManager.startRewardEpoch(2, await getLatestBlockNumber())
    await ftsoRewardManager.addRewards(pair.address, 2, 100)
    await ftsoManager.startRewardEpoch(3, await getLatestBlockNumber())

    await ftsoReward.distributeFtsoRewards([1, 2])

    const expectedRewards1 = expandTo18Decimals(4).div(100)
    const expectedWalletRewards1 = expectedRewards1
      .mul(expandTo18Decimals(1).sub(MINIMUM_LIQUIDITY))
      .div(expandTo18Decimals(4))
    const expectedOtherRewards1 = expectedRewards1.mul(expandTo18Decimals(3)).div(expandTo18Decimals(4))

    const expectedRewards2 = expandTo18Decimals(3).add(MINIMUM_LIQUIDITY).div(100)
    const expectedOtherRewards2 = expectedRewards2
      .mul(expandTo18Decimals(3))
      .div(expandTo18Decimals(3).add(MINIMUM_LIQUIDITY))
    await expect(ftsoReward.connect(wallet).claimFtsoRewards([1], wallet.address, true))
      .to.emit(ftsoReward, 'FtsoRewardsClaimed')
      .withArgs(wallet.address, wallet.address, BigNumber.from('1'), expectedWalletRewards1, wallet.address)
    await expect(ftsoReward.connect(other).claimFtsoRewards([1, 2], other.address, true))
      .to.emit(ftsoReward, 'FtsoRewardsClaimed')
      .withArgs(other.address, other.address, BigNumber.from('1'), expectedOtherRewards1, other.address)
      .to.emit(ftsoReward, 'FtsoRewardsClaimed')
      .withArgs(other.address, other.address, BigNumber.from('2'), expectedOtherRewards2, other.address)
    expect(await ftsoReward.claimedFtsoRewards(wallet.address, 1)).to.eq(expectedWalletRewards1)
    expect(await ftsoReward.claimedFtsoRewards(wallet.address, 2)).to.eq(BigNumber.from(0))
    expect(await ftsoReward.claimedFtsoRewards(other.address, 1)).to.eq(expectedOtherRewards1)
    expect(await ftsoReward.claimedFtsoRewards(other.address, 2)).to.eq(expectedOtherRewards2)
  })

  it('claimFtsoRewardsByExecutor:None', async () => {
    await addLiquidity(wallet, expandTo18Decimals(1), expandTo18Decimals(1))

    await ftsoManager.startRewardEpoch(1, await getLatestBlockNumber())
    await ftsoRewardManager.addRewards(pair.address, 1, 100)
    await ftsoManager.startRewardEpoch(2, await getLatestBlockNumber())

    await ftsoReward.distributeFtsoRewards([1])

    const expectedRewards = expandTo18Decimals(1).div(100)
    const expectedWalletRewards = expectedRewards
      .mul(expandTo18Decimals(1).sub(MINIMUM_LIQUIDITY))
      .div(expandTo18Decimals(1))

    await expect(
      ftsoReward.connect(other).claimFtsoRewardsByExecutor([1], wallet.address, wallet.address, false)
    ).to.be.revertedWith('BlazeSwap: FORBIDDEN')

    await expect(() =>
      ftsoReward.claimFtsoRewardsByExecutor([1], wallet.address, other.address, false)
    ).to.changeEtherBalance(other, expectedWalletRewards)

    expect(await ftsoReward.claimedFtsoRewards(wallet.address, 1)).to.eq(expectedWalletRewards)
  })

  it('claimFtsoRewardsByExecutor:OwnerOnly', async () => {
    await addLiquidity(wallet, expandTo18Decimals(1), expandTo18Decimals(1))

    await ftsoManager.startRewardEpoch(1, await getLatestBlockNumber())
    await ftsoRewardManager.addRewards(pair.address, 1, 100)
    await ftsoManager.startRewardEpoch(2, await getLatestBlockNumber())

    await ftsoReward.distributeFtsoRewards([1])

    const expectedRewards = expandTo18Decimals(1).div(100)
    const expectedWalletRewards = expectedRewards
      .mul(expandTo18Decimals(1).sub(MINIMUM_LIQUIDITY))
      .div(expandTo18Decimals(1))

    const executorManager = IBlazeSwapExecutorManager__factory.connect(await manager.executorManager(), wallet)
    await executorManager.setExecutorPermission(other.address, 1) // OwnerOnly
    await expect(
      ftsoReward.connect(other).claimFtsoRewardsByExecutor([1], wallet.address, other.address, false)
    ).to.be.revertedWith('BlazeSwap: FORBIDDEN')

    await expect(() =>
      ftsoReward.claimFtsoRewardsByExecutor([1], wallet.address, wallet.address, false)
    ).to.changeEtherBalance(wallet, expectedWalletRewards)

    expect(await ftsoReward.claimedFtsoRewards(wallet.address, 1)).to.eq(expectedWalletRewards)
  })

  it('claimFtsoRewardsByExecutor:AnyAddress', async () => {
    await addLiquidity(wallet, expandTo18Decimals(1), expandTo18Decimals(1))

    await ftsoManager.startRewardEpoch(1, await getLatestBlockNumber())
    await ftsoRewardManager.addRewards(pair.address, 1, 100)
    await ftsoManager.startRewardEpoch(2, await getLatestBlockNumber())

    await ftsoReward.distributeFtsoRewards([1])

    const expectedRewards = expandTo18Decimals(1).div(100)
    const expectedWalletRewards = expectedRewards
      .mul(expandTo18Decimals(1).sub(MINIMUM_LIQUIDITY))
      .div(expandTo18Decimals(1))

    const executorManager = IBlazeSwapExecutorManager__factory.connect(await manager.executorManager(), wallet)
    await executorManager.setExecutorPermission(other.address, 2) // AnyAddress

    await expect(() =>
      ftsoReward.claimFtsoRewardsByExecutor([1], wallet.address, other.address, false)
    ).to.changeEtherBalance(other, expectedWalletRewards)

    expect(await ftsoReward.claimedFtsoRewards(wallet.address, 1)).to.eq(expectedWalletRewards)
  })

  it('claimFtsoRewards:expired', async () => {
    await addLiquidity(wallet, expandTo18Decimals(1), expandTo18Decimals(4))

    await ftsoManager.startRewardEpoch(1, await getLatestBlockNumber())
    await ftsoRewardManager.addRewards(pair.address, 1, 100)
    await ftsoManager.startRewardEpoch(2, await getLatestBlockNumber())
    await ftsoRewardManager.addRewards(pair.address, 2, 100)
    await ftsoManager.startRewardEpoch(3, await getLatestBlockNumber())

    await ftsoReward.distributeFtsoRewards([1, 2])

    await ftsoManager.setRewardEpochToExpireNext(2)

    const { epochs } = await ftsoReward.epochsWithUnclaimedFtsoRewards(wallet.address)
    expect(epochs).to.deep.eq([BigNumber.from('2')])

    await ftsoReward.claimFtsoRewards([1, 2], wallet.address, true)
    expect(await ftsoReward.claimedFtsoRewards(wallet.address, 1)).to.eq(BigNumber.from(0))
    expect(await ftsoReward.claimedFtsoRewards(wallet.address, 2)).not.to.eq(BigNumber.from(0))
  })

  it('ftsoRewardsFeeBips', async () => {
    await rewardsPlugin.setRewardsFeeTo(other.address)
    await manager.setFtsoRewardsFeeBips(1_90)

    await wNat.transfer(pair.address, expandTo18Decimals(100))

    await ftsoManager.startRewardEpoch(1, await getLatestBlockNumber())
    await ftsoRewardManager.addRewards(pair.address, 1, 10000000) // 100000 NAT

    await ftsoManager.startRewardEpoch(2, await getLatestBlockNumber())

    const expectedTotalRewards = expandTo18Decimals(100000)
    const expectedDistributedRewards = applyFee(expectedTotalRewards)

    const rewardManagerAddress = getRewardManagerAddress(pair.address)

    await expect(ftsoReward.distributeFtsoRewards([1]))
      .to.emit(ftsoReward, 'FtsoRewardsDistributed')
      .withArgs(BigNumber.from('1'), expectedDistributedRewards, wallet.address)

    expect(await wNat.balanceOf(rewardManagerAddress)).to.eq(expectedTotalRewards)
  })

  it('withdrawRewardFees', async () => {
    await rewardsPlugin.addRewardsFeeClaimer(other.address)
    await rewardsPlugin.setRewardsFeeTo(other.address)
    await manager.setFtsoRewardsFeeBips(1_90)

    await wNat.transfer(pair.address, expandTo18Decimals(100))

    await ftsoManager.startRewardEpoch(1, await getLatestBlockNumber())
    await ftsoRewardManager.addRewards(pair.address, 1, 10000)

    await ftsoManager.startRewardEpoch(2, await getLatestBlockNumber())

    const expectedTotalRewards = expandTo18Decimals(100)
    const expectedDistributedRewards = applyFee(expectedTotalRewards)
    const expectedRewardFees = expectedTotalRewards.sub(expectedDistributedRewards)

    await ftsoReward.distributeFtsoRewards([1])

    await expect(() => rewards.withdrawRewardFees(true)).to.changeTokenBalance(wNat, other, expectedRewardFees)

    const rewardManagerAddress = getRewardManagerAddress(pair.address)
    expect(await wNat.balanceOf(rewardManagerAddress)).to.eq(expectedDistributedRewards)
  })

  it('claimFtsoRewards:afterFee', async () => {
    await rewardsPlugin.addRewardsFeeClaimer(other.address)
    await rewardsPlugin.setRewardsFeeTo(other.address)
    await manager.setFtsoRewardsFeeBips(1_90)

    await addLiquidity(wallet, expandTo18Decimals(1), expandTo18Decimals(1))

    await ftsoManager.startRewardEpoch(1, await getLatestBlockNumber())
    await ftsoRewardManager.addRewards(pair.address, 1, 10000)

    await ftsoManager.startRewardEpoch(2, await getLatestBlockNumber())

    await ftsoReward.distributeFtsoRewards([1])

    const { epochs, amounts } = await ftsoReward.epochsWithUnclaimedFtsoRewards(wallet.address)

    await rewards.withdrawRewardFees(true)

    await expect(() => ftsoReward.claimFtsoRewards(epochs, wallet.address, true)).to.changeTokenBalance(
      wNat,
      wallet,
      amounts[0]
    )

    await ftsoManager.setRewardEpochToExpireNext(2)

    const rewardManagerAddress = getRewardManagerAddress(pair.address)

    expect(await wNat.balanceOf(rewardManagerAddress)).to.gt(BigNumber.from('0'))

    await rewards.withdrawRewardFees(true)

    expect(await wNat.balanceOf(rewardManagerAddress)).to.eq(BigNumber.from('0'))
  })

  it('multicall:distributeAndClaim', async () => {
    await addLiquidity(wallet, expandTo18Decimals(1), expandTo18Decimals(1))

    await ftsoManager.startRewardEpoch(1, await getLatestBlockNumber())
    await ftsoRewardManager.addRewards(pair.address, 1, 10000)

    await ftsoManager.startRewardEpoch(2, await getLatestBlockNumber())

    const [epochs, amounts, totalAmounts] = await ftsoReward.epochsWithUndistributedFtsoRewards(wallet.address)
    const to = wallet.address
    const wrapped = true

    expect(epochs.length).to.eq(1)
    expect(amounts[0]).to.gt(BigNumber.from('0'))
    expect(totalAmounts[0]).to.gt(BigNumber.from('0'))

    const coder = new Coder(BlazeSwapFtsoReward.abi)
    await expect(
      pair.multicall([
        coder.encodeFunction('distributeFtsoRewards', { epochs }),
        coder.encodeFunction('claimFtsoRewards', { epochs, to, wrapped }),
      ])
    ).not.to.be.reverted

    expect(await ftsoReward.claimedFtsoRewards(wallet.address, epochs[0])).to.eq(amounts[0])
  })
})
