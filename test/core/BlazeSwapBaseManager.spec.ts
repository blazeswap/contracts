import { waffle } from 'hardhat'
import { expect } from 'chai'
import { BigNumber, constants } from 'ethers'

import { baseManagerFixture } from './shared/fixtures'
import { IBlazeSwapBaseManager } from '../../typechain-types'

const { createFixtureLoader } = waffle

describe('BlazeSwapBaseManager', () => {
  const provider = waffle.provider
  const [wallet, other] = provider.getWallets()
  const loadFixture = createFixtureLoader([wallet, other], provider)

  let manager: IBlazeSwapBaseManager
  beforeEach(async () => {
    const fixture = await loadFixture(baseManagerFixture)
    manager = fixture.manager
  })

  it('tradingFeeTo, configSetter', async () => {
    expect(await manager.tradingFeeTo()).to.eq(constants.AddressZero)
    expect(await manager.configSetter()).to.eq(wallet.address)
  })

  it('setConfigSetter', async () => {
    await expect(manager.connect(other).setConfigSetter(other.address)).to.be.revertedWith('Configurable: FORBIDDEN')
    await manager.setConfigSetter(other.address)
    expect(await manager.configSetter()).to.eq(other.address)
    await expect(manager.setConfigSetter(wallet.address)).to.be.revertedWith('Configurable: FORBIDDEN')
  })

  it('setTradingFeeTo', async () => {
    await expect(manager.connect(other).setTradingFeeTo(other.address)).to.be.revertedWith('Configurable: FORBIDDEN')
    await manager.setTradingFeeTo(wallet.address)
    expect(await manager.tradingFeeTo()).to.eq(wallet.address)
  })

  it('setTradingFeeSplit', async () => {
    await expect(manager.connect(other).setTradingFeeSplit(wallet.address, other.address, 0)).to.be.revertedWith(
      'Configurable: FORBIDDEN'
    )
    await expect(manager.setTradingFeeSplit(wallet.address, other.address, 100_01)).to.be.revertedWith(
      'BlazeSwap: OVERFLOW'
    )
    await expect(manager.setTradingFeeSplit(wallet.address, other.address, 100_00)).not.to.be.reverted
    const { recipient, bips } = await manager.getTradingFeeSplit(wallet.address)
    expect(recipient).to.eq(other.address)
    expect(bips).to.eq(BigNumber.from('10000'))
  })

  it('removeTradingFeeSplit', async () => {
    await expect(manager.setTradingFeeSplit(wallet.address, other.address, 50_00)).not.to.be.reverted
    await expect(manager.setTradingFeeSplit(wallet.address, constants.AddressZero, 0)).not.to.be.reverted
    const { recipient, bips } = await manager.getTradingFeeSplit(wallet.address)
    expect(recipient).to.eq(constants.AddressZero)
    expect(bips).to.eq(BigNumber.from('0'))
  })
})
