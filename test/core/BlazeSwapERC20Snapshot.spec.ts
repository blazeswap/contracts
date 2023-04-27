import hre from 'hardhat'
import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { expect } from 'chai'
import { BigNumber, constants } from 'ethers'
import { defaultAbiCoder } from '@ethersproject/abi'
import { keccak256 } from '@ethersproject/keccak256'
import { hexlify } from '@ethersproject/bytes'
import { toUtf8Bytes } from '@ethersproject/strings'

import { expandTo18Decimals, getApprovalSignature, getLatestBlockNumber } from './shared/utilities'

import { BlazeSwapERC20SnapshotTest } from '../../typechain-types'

import { deployContract } from '../shared/shared/utilities'

const TOTAL_SUPPLY = expandTo18Decimals(10000)
const TEST_AMOUNT = expandTo18Decimals(10)

describe('BlazeSwapERC20Snapshot', () => {
  let wallet: SignerWithAddress
  let other: SignerWithAddress

  let token: BlazeSwapERC20SnapshotTest
  beforeEach(async () => {
    [wallet, other] = await hre.ethers.getSigners()
    token = (await deployContract('BlazeSwapERC20SnapshotTest', [TOTAL_SUPPLY])) as BlazeSwapERC20SnapshotTest
  })

  it('name, symbol, decimals, totalSupply, balanceOf, DOMAIN_SEPARATOR, PERMIT_TYPEHASH', async () => {
    const name = await token.name()
    expect(name).to.eq('BlazeSwap')
    expect(await token.symbol()).to.eq('BLAZE-LP')
    expect(await token.decimals()).to.eq(18)
    expect(await token.totalSupply()).to.eq(TOTAL_SUPPLY)
    expect(await token.balanceOf(wallet.address)).to.eq(TOTAL_SUPPLY)
    expect(await token.DOMAIN_SEPARATOR()).to.eq(
      keccak256(
        defaultAbiCoder.encode(
          ['bytes32', 'bytes32', 'bytes32', 'uint256', 'address'],
          [
            keccak256(
              toUtf8Bytes('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')
            ),
            keccak256(toUtf8Bytes(name)),
            keccak256(toUtf8Bytes('1')),
            14,
            token.address,
          ]
        )
      )
    )
    expect(await token.PERMIT_TYPEHASH()).to.eq(
      keccak256(toUtf8Bytes('Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)'))
    )
  })

  it('approve', async () => {
    await expect(token.approve(other.address, TEST_AMOUNT))
      .to.emit(token, 'Approval')
      .withArgs(wallet.address, other.address, TEST_AMOUNT)
    expect(await token.allowance(wallet.address, other.address)).to.eq(TEST_AMOUNT)
  })

  it('transfer', async () => {
    await expect(token.transfer(other.address, TEST_AMOUNT))
      .to.emit(token, 'Transfer')
      .withArgs(wallet.address, other.address, TEST_AMOUNT)
    expect(await token.balanceOf(wallet.address)).to.eq(TOTAL_SUPPLY.sub(TEST_AMOUNT))
    expect(await token.balanceOf(other.address)).to.eq(TEST_AMOUNT)
  })

  it('transfer:fail', async () => {
    await expect(token.transfer(other.address, TOTAL_SUPPLY.add(1))).to.be.reverted // ds-math-sub-underflow
    await expect(token.connect(other).transfer(wallet.address, 1)).to.be.reverted // ds-math-sub-underflow
  })

  it('transferFrom', async () => {
    await token.approve(other.address, TEST_AMOUNT)
    await expect(token.connect(other).transferFrom(wallet.address, other.address, TEST_AMOUNT))
      .to.emit(token, 'Transfer')
      .withArgs(wallet.address, other.address, TEST_AMOUNT)
    expect(await token.allowance(wallet.address, other.address)).to.eq(0)
    expect(await token.balanceOf(wallet.address)).to.eq(TOTAL_SUPPLY.sub(TEST_AMOUNT))
    expect(await token.balanceOf(other.address)).to.eq(TEST_AMOUNT)
  })

  it('transferFrom:max', async () => {
    await token.approve(other.address, constants.MaxUint256)
    await expect(token.connect(other).transferFrom(wallet.address, other.address, TEST_AMOUNT))
      .to.emit(token, 'Transfer')
      .withArgs(wallet.address, other.address, TEST_AMOUNT)
    expect(await token.allowance(wallet.address, other.address)).to.eq(constants.MaxUint256)
    expect(await token.balanceOf(wallet.address)).to.eq(TOTAL_SUPPLY.sub(TEST_AMOUNT))
    expect(await token.balanceOf(other.address)).to.eq(TEST_AMOUNT)
  })

  it('permit', async () => {
    const nonce = await token.nonces(wallet.address)
    const deadline = constants.MaxUint256
    const { v, r, s } = await getApprovalSignature(
      wallet,
      token,
      { owner: wallet.address, spender: other.address, value: TEST_AMOUNT },
      nonce,
      deadline
    )

    await expect(token.permit(wallet.address, other.address, TEST_AMOUNT, deadline, v, hexlify(r), hexlify(s)))
      .to.emit(token, 'Approval')
      .withArgs(wallet.address, other.address, TEST_AMOUNT)
    expect(await token.allowance(wallet.address, other.address)).to.eq(TEST_AMOUNT)
    expect(await token.nonces(wallet.address)).to.eq(BigNumber.from(1))
  })

  it('balanceOfAt, totalSupplyAt', async () => {
    const initialBlock = await getLatestBlockNumber()
    await token.transfer(other.address, TEST_AMOUNT)
    const intermediateBlock = getLatestBlockNumber()
    await token.burn(TEST_AMOUNT)
    const finalBlock = getLatestBlockNumber()
    expect(await token.totalSupplyAt(0)).to.eq(0)
    expect(await token.totalSupplyAt(initialBlock)).to.eq(TOTAL_SUPPLY)
    expect(await token.totalSupplyAt(intermediateBlock)).to.eq(TOTAL_SUPPLY)
    expect(await token.totalSupplyAt(finalBlock)).to.eq(TOTAL_SUPPLY.sub(TEST_AMOUNT))
    expect(await token.balanceOfAt(wallet.address, 0)).to.eq(0)
    expect(await token.balanceOfAt(wallet.address, initialBlock)).to.eq(TOTAL_SUPPLY)
    expect(await token.balanceOfAt(other.address, initialBlock)).to.eq(0)
    expect(await token.balanceOfAt(wallet.address, intermediateBlock)).to.eq(TOTAL_SUPPLY.sub(TEST_AMOUNT))
    expect(await token.balanceOfAt(other.address, intermediateBlock)).to.eq(TEST_AMOUNT)
    expect(await token.balanceOfAt(wallet.address, finalBlock)).to.eq(TOTAL_SUPPLY.sub(TEST_AMOUNT).sub(TEST_AMOUNT))
    expect(await token.balanceOfAt(other.address, finalBlock)).to.eq(TEST_AMOUNT)
    expect(await token.balanceOfAt('0x1234567890123456789012345678901234567890', finalBlock)).to.eq(0)
  })
})
