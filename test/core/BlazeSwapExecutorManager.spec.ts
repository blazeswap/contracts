import hre from 'hardhat'
import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { expect } from 'chai'
import { Contract } from 'ethers'

import { deployContract } from '../shared/shared/utilities'

describe('BlazeSwapExecutorManager', () => {
  let wallet: SignerWithAddress
  let executor1: SignerWithAddress
  let executor2: SignerWithAddress

  let executorManager: Contract
  before('deploy BlazeSwapExecutorManager', async () => {
    [wallet, executor1, executor2] = await hre.ethers.getSigners()
    executorManager = await deployContract('BlazeSwapExecutorManager')
  })

  it('default permission', async () => {
    expect(await executorManager.executorPermission(wallet.address, executor1.address)).to.eq(0) // None
  })

  it('set executor permission', async () => {
    await expect(executorManager.setExecutorPermission(executor1.address, 1))
      .to.emit(executorManager, 'Grant')
      .withArgs(wallet.address, executor1.address, 1)

    await expect(executorManager.setExecutorPermission(executor2.address, 2))
      .to.emit(executorManager, 'Grant')
      .withArgs(wallet.address, executor2.address, 2)

    expect(await executorManager.executorPermission(wallet.address, executor1.address)).to.eq(1) // OwnerOnly
    expect(await executorManager.executorPermission(wallet.address, executor2.address)).to.eq(2) // AnyAddress
  })

  it('remove executor permission', async () => {
    await expect(executorManager.setExecutorPermission(executor1.address, 1))
      .to.emit(executorManager, 'Grant')
      .withArgs(wallet.address, executor1.address, 1)

    await expect(executorManager.setExecutorPermission(executor1.address, 0))
      .to.emit(executorManager, 'Grant')
      .withArgs(wallet.address, executor1.address, 0)

    expect(await executorManager.executorPermission(wallet.address, executor1.address)).to.eq(0) // None
  })

  it('invalid permission', async () => {
    await expect(executorManager.setExecutorPermission(executor1.address, 4)).to.be.reverted
  })

  it('invalid executor', async () => {
    await expect(executorManager.setExecutorPermission(wallet.address, 1)).to.be.revertedWith(
      'BlazeSwap: SELF_EXECUTOR'
    )
  })
})
