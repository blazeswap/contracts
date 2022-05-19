import { waffle } from 'hardhat'
import { expect } from 'chai'
import { Contract, constants } from 'ethers'

import TransferHelperTest from '../../artifacts/contracts/shared/test/TransferHelperTest.sol/TransferHelperTest.json'
import FakeFallback from '../../artifacts/contracts/shared/test/TransferHelperTest.sol/TransferHelperTestFakeFallback.json'
import FakeERC20Noncompliant from '../../artifacts/contracts/shared/test/TransferHelperTest.sol/TransferHelperTestFakeERC20Noncompliant.json'
import FakeERC20Compliant from '../../artifacts/contracts/shared/test/TransferHelperTest.sol/TransferHelperTestFakeERC20Compliant.json'

const { deployContract } = waffle

describe('TransferHelper', () => {
  const provider = waffle.provider
  const [wallet] = provider.getWallets()

  let transferHelper: Contract
  let fakeFallback: Contract
  let fakeCompliant: Contract
  let fakeNoncompliant: Contract
  before(async () => {
    transferHelper = await deployContract(wallet, TransferHelperTest)
    fakeFallback = await deployContract(wallet, FakeFallback)
    fakeNoncompliant = await deployContract(wallet, FakeERC20Noncompliant)
    fakeCompliant = await deployContract(wallet, FakeERC20Compliant)
  })

  // sets up the fixtures for each token situation that should be tested
  function harness({
    sendTx,
    expectedError,
  }: {
    sendTx: (tokenAddress: string) => Promise<void>
    expectedError: string
  }) {
    it('succeeds with compliant with no revert and true return', async () => {
      await fakeCompliant.setup(true, false)
      await sendTx(fakeCompliant.address)
    })
    it('fails with compliant with no revert and false return', async () => {
      await fakeCompliant.setup(false, false)
      await expect(sendTx(fakeCompliant.address)).to.be.revertedWith(expectedError)
    })
    it('fails with compliant with revert', async () => {
      await fakeCompliant.setup(false, true)
      await expect(sendTx(fakeCompliant.address)).to.be.revertedWith(expectedError)
    })
    it('succeeds with noncompliant (no return) with no revert', async () => {
      await fakeNoncompliant.setup(false)
      await sendTx(fakeNoncompliant.address)
    })
    it('fails with noncompliant (no return) with revert', async () => {
      await fakeNoncompliant.setup(true)
      await expect(sendTx(fakeNoncompliant.address)).to.be.revertedWith(expectedError)
    })
  }

  describe('#safeApprove', () => {
    harness({
      sendTx: (tokenAddress) => transferHelper.safeApprove(tokenAddress, constants.AddressZero, constants.MaxUint256),
      expectedError: 'TransferHelper::safeApprove',
    })
  })
  describe('#safeTransfer', () => {
    harness({
      sendTx: (tokenAddress) => transferHelper.safeTransfer(tokenAddress, constants.AddressZero, constants.MaxUint256),
      expectedError: 'TransferHelper::safeTransfer',
    })
  })
  describe('#safeTransferFrom', () => {
    harness({
      sendTx: (tokenAddress) =>
        transferHelper.safeTransferFrom(
          tokenAddress,
          constants.AddressZero,
          constants.AddressZero,
          constants.MaxUint256
        ),
      expectedError: 'TransferHelper::transferFrom',
    })
  })

  describe('#safeTransferNAT', () => {
    it('succeeds call not reverted', async () => {
      await fakeFallback.setup(false)
      await transferHelper.safeTransferNAT(fakeFallback.address, 0)
    })
    it('fails if call reverts', async () => {
      await fakeFallback.setup(true)
      await expect(transferHelper.safeTransferNAT(fakeFallback.address, 0)).to.be.revertedWith(
        'TransferHelper::safeTransferNAT'
      )
    })
  })
})
