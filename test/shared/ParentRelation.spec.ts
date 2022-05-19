import { waffle } from 'hardhat'
import { expect } from 'chai'
import { BigNumber, Contract } from 'ethers'

const { deployContract } = waffle

import Child from '../../artifacts/contracts/shared/test/ParentRelationTest.sol/Child.json'
import ParentRelationTest from '../../artifacts/contracts/shared/test/ParentRelationTest.sol/ParentRelationTest.json'

describe('ParentRelation', () => {
  const provider = waffle.provider
  const [wallet, other] = provider.getWallets()

  let pr: Contract
  let child: Contract
  before('deploy ParentRelationTest', async () => {
    pr = await deployContract(wallet, ParentRelationTest)
    child = new Contract(await pr.c(), JSON.stringify(Child.abi), provider).connect(wallet)
  })

  it('allow calls from parent', async () => {
    expect(await pr.test()).to.eq(BigNumber.from('1'))
  })

  it('forbid calls from other addresses', async () => {
    await expect(child.test()).to.be.revertedWith('ParentRelation: FORBIDDEN')
    await expect(child.connect(other).test()).to.be.revertedWith('ParentRelation: FORBIDDEN')
  })
})
