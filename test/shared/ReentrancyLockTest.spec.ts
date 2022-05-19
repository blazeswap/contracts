import { waffle } from 'hardhat'
import { expect } from 'chai'
import { Contract } from 'ethers'

const { deployContract } = waffle

import ReentrancyLockTest from '../../artifacts/contracts/shared/test/ReentrancyLockTest.sol/ReentrancyLockTest.json'

describe('ReentrancyLock', () => {
  const provider = waffle.provider
  const [wallet] = provider.getWallets()

  let reentrancyLock: Contract
  before('deploy ReentrancyLockTest', async () => {
    reentrancyLock = await deployContract(wallet, ReentrancyLockTest)
  })

  it('lockedCall', async () => {
    await expect(reentrancyLock.lockedCall(false)).not.to.be.reverted
  })

  it('reentrantCall', async () => {
    await expect(reentrancyLock.lockedCall(true)).to.be.revertedWith('ReentrancyLock: reentrant call')
  })
})
