import { waffle } from 'hardhat'
import { expect } from 'chai'
import { BigNumber, Contract } from 'ethers'

const { deployContract } = waffle

import ConfigurableTest from '../../artifacts/contracts/shared/test/ConfigurableTest.sol/ConfigurableTest.json'
import CentrallyConfigurableTest from '../../artifacts/contracts/shared/test/CentrallyConfigurableTest.sol/CentrallyConfigurableTest.json'

describe('Configurable', () => {
  const provider = waffle.provider
  const [wallet, other] = provider.getWallets()

  let configurable: Contract
  before('deploy ConfigurableTest', async () => {
    configurable = await deployContract(wallet, ConfigurableTest)
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
      centrallyConfigurable = await deployContract(wallet, CentrallyConfigurableTest, [configurable.address])
    })

    it('setValue', async () => {
      await expect(centrallyConfigurable.setValue(5)).to.be.revertedWith('CentrallyConfigurable: FORBIDDEN')
      await centrallyConfigurable.connect(other).setValue(5)
      expect(await centrallyConfigurable.value()).to.eq(BigNumber.from('5'))
    })
  })
})
