import { expect } from 'chai'
import { Contract, constants } from 'ethers'

import { deployContract } from './shared/utilities'

const example = '0xC257274276a4E539741Ca11b590B9447B26A8051'

describe('AddressStringUtil', () => {
  let addressStringUtil: Contract
  before('deploy AddressStringUtilTest', async () => {
    addressStringUtil = await deployContract('AddressStringUtilTest')
  })

  describe('#toAsciiString', () => {
    it('zero address', async () => {
      expect(await addressStringUtil.toAsciiString(constants.AddressZero, 40)).to.eq(constants.AddressZero.substr(2))
    })
    it('own address', async () => {
      expect(await addressStringUtil.toAsciiString(addressStringUtil.address, 40)).to.eq(
        addressStringUtil.address.substr(2).toUpperCase()
      )
    })
    it('random address', async () => {
      expect(await addressStringUtil.toAsciiString(example, 40)).to.eq(example.substr(2).toUpperCase())
    })

    it('reverts if len % 2 != 0', async () => {
      await expect(addressStringUtil.toAsciiString(example, 39)).to.be.revertedWith('AddressStringUtil: INVALID_LEN')
    })

    it('reverts if len >= 40', async () => {
      await expect(addressStringUtil.toAsciiString(example, 42)).to.be.revertedWith('AddressStringUtil: INVALID_LEN')
    })

    it('reverts if len == 0', async () => {
      await expect(addressStringUtil.toAsciiString(example, 0)).to.be.revertedWith('AddressStringUtil: INVALID_LEN')
    })

    it('produces len characters', async () => {
      expect(await addressStringUtil.toAsciiString(example, 4)).to.eq(example.substr(2, 4).toUpperCase())
      expect(await addressStringUtil.toAsciiString(example, 10)).to.eq(example.substr(2, 10).toUpperCase())
      expect(await addressStringUtil.toAsciiString(example, 16)).to.eq(example.substr(2, 16).toUpperCase())
    })
  })
})
