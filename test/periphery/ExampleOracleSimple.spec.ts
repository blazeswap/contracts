import { waffle } from 'hardhat'
import { expect } from 'chai'

import { expandTo18Decimals, setNextBlockTime, encodePrice } from '../core/shared/utilities'
import { routerFixture } from './shared/fixtures'

import ExampleOracleSimpleArtifact from '../../artifacts/contracts/periphery/examples/ExampleOracleSimple.sol/ExampleOracleSimple.json'
import { ExampleOracleSimple, IBlazeSwapPair, IERC20 } from '../../typechain-types'

const { createFixtureLoader, deployContract } = waffle

const token0Amount = expandTo18Decimals(5)
const token1Amount = expandTo18Decimals(10)

describe('ExampleOracleSimple', () => {
  const provider = waffle.provider
  const [wallet] = provider.getWallets()
  const loadFixture = createFixtureLoader([wallet], provider)

  let token0: IERC20
  let token1: IERC20
  let pair: IBlazeSwapPair
  let exampleOracleSimple: ExampleOracleSimple

  async function addLiquidity() {
    await token0.transfer(pair.address, token0Amount)
    await token1.transfer(pair.address, token1Amount)
    await pair.mint(wallet.address)
  }

  beforeEach(async function () {
    const fixture = await loadFixture(routerFixture)

    token0 = fixture.token0
    token1 = fixture.token1
    pair = fixture.pair
    await addLiquidity()
    exampleOracleSimple = (await deployContract(wallet, ExampleOracleSimpleArtifact, [
      fixture.factory.address,
      token0.address,
      token1.address,
    ])) as ExampleOracleSimple
  })

  it('update', async () => {
    const blockTimestamp = (await pair.getReserves())[2]
    // await mineBlock(provider, blockTimestamp + 60 * 60 * 23) // ganache
    await setNextBlockTime(provider, blockTimestamp + 60 * 60 * 23) // hardhat
    await expect(exampleOracleSimple.update()).to.be.reverted
    // await mineBlock(provider, blockTimestamp + 60 * 60 * 24) // ganache
    await setNextBlockTime(provider, blockTimestamp + 60 * 60 * 24) // hardhat
    await exampleOracleSimple.update()

    const expectedPrice = encodePrice(token0Amount, token1Amount)

    expect(await exampleOracleSimple.price0Average()).to.eq(expectedPrice[0])
    expect(await exampleOracleSimple.price1Average()).to.eq(expectedPrice[1])

    expect(await exampleOracleSimple.consult(token0.address, token0Amount)).to.eq(token1Amount)
    expect(await exampleOracleSimple.consult(token1.address, token1Amount)).to.eq(token0Amount)
  })
})
