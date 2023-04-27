import hre from 'hardhat'
import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { expect } from 'chai'
import { BigNumber, Contract } from 'ethers'

import { deployContract } from './shared/utilities'

describe('Configurable', () => {
  let wallet: SignerWithAddress
  let other: SignerWithAddress
  let configurable: Contract
  before('deploy ConfigurableTest', async () => {
    [wallet, other] = await hre.ethers.getSigners()
    await wallet.getAddress()
    configurable = await deployContract('ConfigurableTest')
  })

  it('configSetter, value', async () => {
    expect(await configurable.configSetter()).to.eq(wallet.address)
    expect(await configurable.value()).to.eq(BigNumber.from('0'))
  })

  it('setConfigSetter', async () => {
    await expect(configurable.connect(other).setConfigSetter(other.address)).to.be.revertedWith(
      'Configurable: FORBIDDEN'
    )
    await configurable.setConfigSetter(other.address)
    expect(await configurable.configSetter()).to.eq(other.address)
    await expect(configurable.setConfigSetter(wallet.address)).to.be.revertedWith('Configurable: FORBIDDEN')
  })

  it('setValue', async () => {
    await expect(configurable.setValue(5)).to.be.revertedWith('Configurable: FORBIDDEN')
    await configurable.connect(other).setValue(5)
    expect(await configurable.value()).to.eq(BigNumber.from('5'))
  })

  describe('CentrallyConfigurable', () => {
    let centrallyConfigurable: Contract
    before('deploy CentrallyConfigurableTest', async () => {
      centrallyConfigurable = await deployContract('CentrallyConfigurableTest', [configurable.address])
    })

    it('setValue', async () => {
      await expect(centrallyConfigurable.setValue(5)).to.be.revertedWith('CentrallyConfigurable: FORBIDDEN')
      await centrallyConfigurable.connect(other).setValue(5)
      expect(await centrallyConfigurable.value()).to.eq(BigNumber.from('5'))
    })
  })
})
