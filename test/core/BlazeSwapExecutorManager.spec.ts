import { waffle } from 'hardhat'
import { expect } from 'chai'
import { Contract } from 'ethers'

const { deployContract } = waffle

import BlazeSwapExecutorManager from '../../artifacts/contracts/core/BlazeSwapExecutorManager.sol/BlazeSwapExecutorManager.json'

describe('BlazeSwapExecutorManager', () => {
  const provider = waffle.provider
  const [wallet, executor1, executor2] = provider.getWallets()

  let executorManager: Contract
  before('deploy BlazeSwapExecutorManager', async () => {
    executorManager = await deployContract(wallet, BlazeSwapExecutorManager)
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
