import { waffle } from 'hardhat'
import { expect } from 'chai'
import { BigNumber, constants } from 'ethers'

import { getCreate2Address } from './shared/utilities'
import { baseFactoryFixture } from './shared/fixtures'

import BlazeSwapBasePair from '../../artifacts/contracts/core/BlazeSwapBasePair.sol/BlazeSwapBasePair.json'
import { IBlazeSwapBaseFactory, IBlazeSwapBasePair__factory } from '../../typechain-types'

const { createFixtureLoader } = waffle

const TEST_ADDRESSES: [string, string] = [
  '0x1000000000000000000000000000000000000000',
  '0x2000000000000000000000000000000000000000',
]

describe('BlazeSwapBaseFactory', () => {
  const provider = waffle.provider
  const [wallet, other] = provider.getWallets()
  const loadFixture = createFixtureLoader([wallet, other], provider)

  let factory: IBlazeSwapBaseFactory
  beforeEach(async () => {
    const fixture = await loadFixture(baseFactoryFixture)
    factory = fixture.factory
  })

  it('manager, allPairsLength', async () => {
    expect(await factory.manager()).not.to.eq(constants.AddressZero)
    expect(await factory.allPairsLength()).to.eq(0)
  })

  async function createPair(tokens: [string, string]) {
    const bytecode = BlazeSwapBasePair.bytecode
    const create2Address = getCreate2Address(factory.address, tokens, bytecode)
    await expect(factory.createPair(...tokens))
      .to.emit(factory, 'PairCreated')
      .withArgs(TEST_ADDRESSES[0], TEST_ADDRESSES[1], create2Address, BigNumber.from(1))

    await expect(factory.createPair(tokens[0], tokens[1])).to.be.reverted // BlazeSwap: PAIR_EXISTS
    await expect(factory.createPair(tokens[1], tokens[0])).to.be.reverted // BlazeSwap: PAIR_EXISTS
    expect(await factory.getPair(tokens[0], tokens[1])).to.eq(create2Address)
    expect(await factory.getPair(tokens[1], tokens[0])).to.eq(create2Address)
    expect(await factory.allPairs(0)).to.eq(create2Address)
    expect(await factory.allPairsLength()).to.eq(1)

    const pair = IBlazeSwapBasePair__factory.connect(create2Address, wallet)
    expect(await pair.factory()).to.eq(factory.address)
    expect(await pair.token0()).to.eq(TEST_ADDRESSES[0])
    expect(await pair.token1()).to.eq(TEST_ADDRESSES[1])
  }

  it('createPair', async () => {
    await createPair(TEST_ADDRESSES)
  })

  it('createPair:reverse', async () => {
    await createPair(TEST_ADDRESSES.slice().reverse() as [string, string])
  })

  it('createPair:gas', async () => {
    const tx = await factory.createPair(...TEST_ADDRESSES)
    const receipt = await tx.wait()
    expect(receipt.gasUsed).to.eq(2759507)
  })
})
