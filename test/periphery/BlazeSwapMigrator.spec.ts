import hre from 'hardhat'
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers'
import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { expect } from 'chai'
import { BigNumber, constants } from 'ethers'

import { expandTo18Decimals, getApprovalSignature, MINIMUM_LIQUIDITY } from '../core/shared/utilities'

import { migratorFixture } from './shared/fixtures'
import {
  IBlazeSwapBaseFactory,
  IBlazeSwapBasePair__factory,
  IBlazeSwapFactory,
  IBlazeSwapMigrator,
  IERC20,
} from '../../typechain-types'

describe('BlazeSwapMigrator', () => {
  let wallet: SignerWithAddress
  let walletOther: SignerWithAddress

  let token: IERC20
  let tokenDeflationary: IERC20
  let wNatOld: IERC20
  let wNat: IERC20
  let factoryOld: IBlazeSwapBaseFactory
  let factory: IBlazeSwapFactory
  let migrator: IBlazeSwapMigrator
  beforeEach(async function () {
    ;[wallet, walletOther] = await hre.ethers.getSigners()
    const fixture = await loadFixture(migratorFixture)
    token = fixture.token
    tokenDeflationary = fixture.tokenDeflationary
    wNatOld = fixture.wNatOld
    wNat = fixture.wNat
    factoryOld = fixture.factoryOld
    factory = fixture.factory
    migrator = fixture.migrator
  })

  async function addLiquidity(
    curFactory: IBlazeSwapBaseFactory,
    tokenA: IERC20,
    tokenB: IERC20,
    tokenAAmount: BigNumber,
    tokenBAmount: BigNumber,
    to: string
  ) {
    let pairAddress = await curFactory.getPair(tokenA.address, tokenB.address)
    if (pairAddress == constants.AddressZero) {
      await curFactory.createPair(tokenA.address, tokenB.address)
      pairAddress = await curFactory.getPair(tokenA.address, tokenB.address)
    }
    await tokenA.transfer(pairAddress, tokenAAmount)
    await tokenB.transfer(pairAddress, tokenBAmount)
    const pair = IBlazeSwapBasePair__factory.connect(pairAddress, wallet)
    await pair.mint(to)
    return pair
  }

  it('pairWithLiquidity', async () => {
    const tokenAmount = expandTo18Decimals(1)
    const wNatAmount = expandTo18Decimals(4)
    const pairOld = await addLiquidity(factoryOld, token, wNatOld, tokenAmount, wNatAmount, wallet.address)

    expect(
      await migrator.pairWithLiquidity(factory.address, token.address, wNatOld.address, wallet.address)
    ).to.deep.eq([
      constants.AddressZero,
      BigNumber.from('0'),
      BigNumber.from('0'),
      BigNumber.from('0'),
      BigNumber.from('0'),
    ])

    expect(
      await migrator.pairWithLiquidity(factoryOld.address, token.address, wNatOld.address, wallet.address)
    ).to.deep.eq([
      pairOld.address,
      tokenAmount,
      wNatAmount,
      expandTo18Decimals(2).sub(MINIMUM_LIQUIDITY),
      expandTo18Decimals(2),
    ])
  })

  it('migrate with create pair', async () => {
    const tokenAmount = expandTo18Decimals(1)
    const wNatAmount = expandTo18Decimals(4)
    await addLiquidity(factoryOld, token, wNatOld, tokenAmount, wNatAmount, walletOther.address)
    const pairOld = await addLiquidity(factoryOld, token, wNatOld, tokenAmount, wNatAmount, wallet.address)

    const expectedLiquidity = expandTo18Decimals(2)

    await pairOld.approve(migrator.address, constants.MaxUint256)
    await expect(
      migrator.migrate(
        pairOld.address,
        token.address,
        wNatOld.address,
        expectedLiquidity,
        tokenAmount,
        wNatAmount,
        0,
        0,
        constants.MaxUint256
      )
    ).not.to.be.reverted

    const pair = IBlazeSwapBasePair__factory.connect(await factory.getPair(token.address, wNatOld.address), wallet)
    expect(await pair.balanceOf(wallet.address)).to.eq(expectedLiquidity.sub(MINIMUM_LIQUIDITY))
  })

  it('migrate with different rate', async () => {
    const tokenAmount = expandTo18Decimals(1)
    const wNatAmount = expandTo18Decimals(4)
    await addLiquidity(factoryOld, token, wNatOld, tokenAmount, wNatAmount, walletOther.address)
    const pairOld = await addLiquidity(factoryOld, token, wNatOld, tokenAmount, wNatAmount, wallet.address)

    const expectedLiquidity = expandTo18Decimals(2)

    const pair = await addLiquidity(factory, token, wNatOld, tokenAmount, expandTo18Decimals(1), walletOther.address)

    await pairOld.approve(migrator.address, constants.MaxUint256)

    await expect(
      migrator.migrate(
        pairOld.address,
        token.address,
        wNatOld.address,
        expectedLiquidity,
        tokenAmount,
        wNatAmount,
        0,
        0,
        constants.MaxUint256
      )
    ).to.be.revertedWith('BlazeSwapMigrator: INSUFFICIENT_B_AMOUNT')

    await expect(
      migrator.migrate(
        pairOld.address,
        token.address,
        wNatOld.address,
        expectedLiquidity,
        0,
        0,
        0,
        0,
        constants.MaxUint256
      )
    )
      .to.emit(wNatOld, 'Transfer')
      .withArgs(migrator.address, pair.address, expandTo18Decimals(1))
      .to.emit(wNatOld, 'Transfer')
      .withArgs(migrator.address, wallet.address, expandTo18Decimals(3))

    expect(await pair.balanceOf(wallet.address)).to.eq(expandTo18Decimals(1))
  })

  it('migrate deflationary token', async () => {
    const tokenAmount = expandTo18Decimals(1).mul(100).div(99)
    const receivedTokenAmount = expandTo18Decimals(1)
    const resentTokenAmount = receivedTokenAmount.mul(99).div(100)
    const receivedResentTokenAmount = resentTokenAmount.mul(99).div(100)
    const wNatAmount = expandTo18Decimals(4)
    await addLiquidity(factoryOld, tokenDeflationary, wNatOld, tokenAmount, wNatAmount, walletOther.address)
    const pairOld = await addLiquidity(factoryOld, tokenDeflationary, wNatOld, tokenAmount, wNatAmount, wallet.address)

    const expectedLiquidity = expandTo18Decimals(2)

    const pair = await addLiquidity(
      factory,
      tokenDeflationary,
      wNatOld,
      tokenAmount,
      expandTo18Decimals(1),
      walletOther.address
    )

    await pairOld.approve(migrator.address, constants.MaxUint256)

    await expect(
      migrator.migrate(
        pairOld.address,
        tokenDeflationary.address,
        wNatOld.address,
        expectedLiquidity,
        resentTokenAmount,
        receivedResentTokenAmount,
        1_00,
        0,
        constants.MaxUint256
      )
    )
      .to.emit(wNatOld, 'Transfer')
      .withArgs(migrator.address, pair.address, receivedResentTokenAmount)
      .to.emit(wNatOld, 'Transfer')
      .withArgs(migrator.address, wallet.address, wNatAmount.sub(receivedResentTokenAmount))

    expect(await pair.balanceOf(wallet.address)).to.eq(receivedResentTokenAmount)
  })

  it('migrate with permit', async () => {
    const tokenAmount = expandTo18Decimals(1)
    const wNatAmount = expandTo18Decimals(4)
    await addLiquidity(factoryOld, token, wNatOld, tokenAmount, wNatAmount, walletOther.address)
    const pairOld = await addLiquidity(factoryOld, token, wNatOld, tokenAmount, wNatAmount, wallet.address)

    const expectedLiquidity = expandTo18Decimals(2)

    const nonce = await pairOld.nonces(wallet.address)
    const { v, r, s } = await getApprovalSignature(
      wallet,
      pairOld,
      { owner: wallet.address, spender: migrator.address, value: expectedLiquidity },
      nonce,
      constants.MaxUint256
    )

    await expect(
      migrator.migrateWithPermit(
        pairOld.address,
        token.address,
        wNatOld.address,
        expectedLiquidity,
        tokenAmount,
        wNatAmount,
        0,
        0,
        constants.MaxUint256,
        v,
        r,
        s
      )
    ).not.to.be.reverted

    const pair = IBlazeSwapBasePair__factory.connect(await factory.getPair(token.address, wNatOld.address), wallet)
    expect(await pair.balanceOf(wallet.address)).to.eq(expectedLiquidity.sub(MINIMUM_LIQUIDITY))
  })

  it('migrateWNAT', async () => {
    const tokenAmount = expandTo18Decimals(1)
    const wNatAmount = expandTo18Decimals(4)
    await addLiquidity(factoryOld, token, wNatOld, tokenAmount, wNatAmount, walletOther.address)
    const pairOld = await addLiquidity(factoryOld, token, wNatOld, tokenAmount, wNatAmount, wallet.address)

    const expectedLiquidity = expandTo18Decimals(2)

    await pairOld.approve(migrator.address, constants.MaxUint256)
    await expect(
      migrator.migrateWNAT(
        pairOld.address,
        token.address,
        wNatOld.address,
        expectedLiquidity,
        tokenAmount,
        wNatAmount,
        0,
        constants.MaxUint256
      )
    ).not.to.be.reverted

    const pair = IBlazeSwapBasePair__factory.connect(await factory.getPair(token.address, wNat.address), wallet)
    expect(await pair.balanceOf(wallet.address)).to.eq(expectedLiquidity.sub(MINIMUM_LIQUIDITY))
  })

  it('migrateWNAT with permit', async () => {
    const tokenAmount = expandTo18Decimals(1).mul(100).div(99)
    const wNatAmount = expandTo18Decimals(4)
    await addLiquidity(factoryOld, tokenDeflationary, wNatOld, tokenAmount, wNatAmount, walletOther.address)
    await addLiquidity(factoryOld, tokenDeflationary, wNatOld, tokenAmount, wNatAmount, wallet.address)

    const [pairOldAddress, reserveToken, reserveWNAT, liquidity, totalSupply] = await migrator.pairWithLiquidity(
      factoryOld.address,
      tokenDeflationary.address,
      wNatOld.address,
      wallet.address
    )

    const pair = await addLiquidity(
      factory,
      tokenDeflationary,
      wNat,
      tokenAmount,
      expandTo18Decimals(1),
      walletOther.address
    )

    const pairOld = IBlazeSwapBasePair__factory.connect(pairOldAddress, wallet)
    const nonce = await pairOld.nonces(wallet.address)
    const { v, r, s } = await getApprovalSignature(
      wallet,
      pairOld,
      { owner: wallet.address, spender: migrator.address, value: liquidity },
      nonce,
      constants.MaxUint256
    )

    const amountTokenMin = reserveToken.mul(liquidity).div(totalSupply).mul(99).div(100)
    const amountTokenMinReceived = amountTokenMin.mul(99).div(100)
    const amountWNATMin = amountTokenMinReceived
    const liquidityMinted = amountWNATMin

    await expect(
      migrator.migrateWNATWithPermit(
        pairOld.address,
        tokenDeflationary.address,
        wNatOld.address,
        liquidity,
        amountTokenMin,
        amountWNATMin,
        1_00,
        constants.MaxUint256,
        v,
        r,
        s
      )
    )
      .to.emit(wNat, 'Transfer')
      .withArgs(migrator.address, pair.address, amountWNATMin)
      .to.emit(wNat, 'Transfer')
      .withArgs(migrator.address, wallet.address, reserveWNAT.mul(liquidity).div(totalSupply).sub(amountWNATMin))

    expect(
      await migrator.pairWithLiquidity(factory.address, tokenDeflationary.address, wNat.address, wallet.address)
    ).to.deep.eq([
      pair.address,
      expandTo18Decimals(1).add(amountTokenMinReceived),
      expandTo18Decimals(1).add(amountWNATMin),
      liquidityMinted,
      expandTo18Decimals(1).add(liquidityMinted),
    ])
  })

  it('revert if expired', async () => {
    await expect(
      migrator.migrate(constants.AddressZero, constants.AddressZero, constants.AddressZero, 0, 0, 0, 0, 0, 0)
    ).to.be.revertedWith('BlazeSwapMigrator: EXPIRED')
  })
})
