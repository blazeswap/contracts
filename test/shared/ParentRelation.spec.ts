import hre from 'hardhat'
import { expect } from 'chai'
import { BigNumber, Contract } from 'ethers'
import type { Signer } from 'ethers'

import { deployContract } from './shared/utilities'

import Child from '../../artifacts/contracts/shared/test/ParentRelationTest.sol/Child.json'

describe('ParentRelation', () => {
  let wallet: Signer
  let other: Signer
  let pr: Contract
  let child: Contract
  before('deploy ParentRelationTest', async () => {
    [wallet, other] = await hre.ethers.getSigners()
    pr = await deployContract('ParentRelationTest')
    child = new Contract(await pr.c(), JSON.stringify(Child.abi), wallet)
  })

  it('allow calls from parent', async () => {
    expect(await pr.test()).to.eq(BigNumber.from('1'))
  })

  it('forbid calls from other addresses', async () => {
    await expect(child.test()).to.be.revertedWith('ParentRelation: FORBIDDEN')
    await expect(child.connect(other).test()).to.be.revertedWith('ParentRelation: FORBIDDEN')
  })
})
