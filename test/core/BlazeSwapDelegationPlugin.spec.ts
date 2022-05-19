import { waffle } from 'hardhat'
import { expect } from 'chai'

import { managerFixture } from './shared/fixtures'
import { IBlazeSwapDelegationPlugin, IBlazeSwapDelegationPlugin__factory } from '../../typechain-types'

const { createFixtureLoader } = waffle

describe('BlazeSwapDelegationPlugin', () => {
  const provider = waffle.provider
  const [wallet, other] = provider.getWallets()
  const loadFixture = createFixtureLoader([wallet, other], provider)

  let delegationPlugin: IBlazeSwapDelegationPlugin
  beforeEach(async () => {
    const fixture = await loadFixture(managerFixture)
    delegationPlugin = IBlazeSwapDelegationPlugin__factory.connect(await fixture.manager.delegationPlugin(), wallet)
  })

  it('setInitialProvider', async () => {
    await expect(delegationPlugin.connect(other).setInitialProvider(other.address)).to.be.revertedWith(
      'Configurable: FORBIDDEN'
    )
    await delegationPlugin.setInitialProvider(other.address)
    expect(await delegationPlugin.initialProvider()).to.eq(other.address)
  })
})
