import hre from 'hardhat'
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers'
import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { expect } from 'chai'
import { constants } from 'ethers'

import { managerFixture } from './shared/fixtures'
import { IBlazeSwapDelegationPlugin, IBlazeSwapDelegationPlugin__factory } from '../../typechain-types'

describe('BlazeSwapDelegationPlugin', () => {
  let wallet: SignerWithAddress
  let other: SignerWithAddress

  let delegationPlugin: IBlazeSwapDelegationPlugin
  beforeEach(async () => {
    [wallet, other] = await hre.ethers.getSigners()
    const fixture = await loadFixture(managerFixture)
    delegationPlugin = IBlazeSwapDelegationPlugin__factory.connect(await fixture.manager.delegationPlugin(), wallet)
  })

  it('setInitialProvider', async () => {
    await expect(delegationPlugin.connect(other).setInitialProvider(other.address)).to.be.revertedWith(
      'CentrallyConfigurable: FORBIDDEN'
    )
    await expect(delegationPlugin.setInitialProvider(constants.AddressZero)).to.be.reverted
    await delegationPlugin.setInitialProvider(other.address)
    expect(await delegationPlugin.initialProvider()).to.eq(other.address)
  })

  it('setMaxDelegatesByPercent', async () => {
    await expect(delegationPlugin.connect(other).setMaxDelegatesByPercent(2)).to.be.revertedWith(
      'CentrallyConfigurable: FORBIDDEN'
    )
    await expect(delegationPlugin.setMaxDelegatesByPercent(0)).to.be.reverted
    await delegationPlugin.setMaxDelegatesByPercent(3)
    expect(await delegationPlugin.maxDelegatesByPercent()).to.eq(3)
  })
})
