import { waffle } from 'hardhat'
import { expect } from 'chai'
import { constants } from 'ethers'

import { managerFixture } from './shared/fixtures'
import { IBlazeSwapRewardsPlugin, IBlazeSwapRewardsPlugin__factory } from '../../typechain-types'

const { createFixtureLoader } = waffle

describe('BlazeSwapRewardsPlugin', () => {
  const provider = waffle.provider
  const [wallet, other] = provider.getWallets()
  const loadFixture = createFixtureLoader([wallet, other], provider)

  let rewardsPlugin: IBlazeSwapRewardsPlugin
  beforeEach(async () => {
    const fixture = await loadFixture(managerFixture)
    rewardsPlugin = IBlazeSwapRewardsPlugin__factory.connect(await fixture.manager.rewardsPlugin(), wallet)
  })

  it('addRewardsFeeClaimer, removeRewardsFeeClaimer, isRewardsFeeClaimer, rewardsFeeClaimers', async () => {
    expect(await rewardsPlugin.rewardsFeeClaimers()).to.deep.eq([])
    await expect(rewardsPlugin.connect(other).addRewardsFeeClaimer(other.address)).to.be.revertedWith(
      'Configurable: FORBIDDEN'
    )
    await expect(rewardsPlugin.connect(other).removeRewardsFeeClaimer(other.address)).to.be.revertedWith(
      'Configurable: FORBIDDEN'
    )

    await rewardsPlugin.addRewardsFeeClaimer(wallet.address)
    await rewardsPlugin.addRewardsFeeClaimer(other.address)
    await rewardsPlugin.addRewardsFeeClaimer(other.address)

    expect(await rewardsPlugin.rewardsFeeClaimers()).to.deep.eq([wallet.address, other.address])

    await rewardsPlugin.removeRewardsFeeClaimer(wallet.address)

    expect(await rewardsPlugin.isRewardsFeeClaimer(wallet.address)).to.eq(false)

    expect(await rewardsPlugin.isRewardsFeeClaimer(other.address)).to.eq(true)
  })

  it('rewardsFeeTo', async () => {
    expect(await rewardsPlugin.rewardsFeeTo()).to.eq(constants.AddressZero)
  })

  it('setRewardsFeeTo', async () => {
    await expect(rewardsPlugin.connect(other).setRewardsFeeTo(other.address)).to.be.revertedWith(
      'Configurable: FORBIDDEN'
    )
    await rewardsPlugin.setRewardsFeeTo(other.address)
    expect(await rewardsPlugin.rewardsFeeTo()).to.eq(other.address)
  })

  it('setAllowWNatReplacement', async () => {
    await expect(rewardsPlugin.connect(other).setAllowWNatReplacement(true)).to.be.revertedWith(
      'Configurable: FORBIDDEN'
    )
    await rewardsPlugin.setAllowWNatReplacement(true)
    expect(await rewardsPlugin.allowWNatReplacement()).to.eq(true)
    await rewardsPlugin.setAllowWNatReplacement(false)
    expect(await rewardsPlugin.allowWNatReplacement()).to.eq(false)
  })
})
