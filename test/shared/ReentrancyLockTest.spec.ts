import { expect } from 'chai'
import { Contract } from 'ethers'

import { deployContract } from './shared/utilities'

describe('ReentrancyLock', () => {
  let reentrancyLock: Contract
  before('deploy ReentrancyLockTest', async () => {
    reentrancyLock = await deployContract('ReentrancyLockTest')
  })

  it('lockedCall', async () => {
    await expect(reentrancyLock.lockedCall(false)).not.to.be.reverted
  })

  it('reentrantCall', async () => {
    await expect(reentrancyLock.lockedCall(true)).to.be.revertedWith('ReentrancyLock: reentrant call')
  })
})
