import { expect } from 'chai'
import { Contract, constants } from 'ethers'
import { formatBytes32String } from '@ethersproject/strings'

import { deployContract } from './shared/utilities'

// last byte in bytes32 strings is null terminator
const fullBytes32Name = 'NAME'.repeat(8).substring(0, 31)
const fullBytes32Symbol = 'SYMB'.repeat(8).substring(0, 31)

describe('SafeERC20Namer', () => {
  let safeNamer: Contract
  before('deploy SafeERC20NamerTest', async () => {
    safeNamer = await deployContract('SafeERC20NamerTest')
  })

  function deployCompliant({ name, symbol }: { name: string; symbol: string }): Promise<Contract> {
    return deployContract('NamerTestFakeCompliantERC20', [name, symbol])
  }

  function deployNoncompliant({ name, symbol }: { name: string; symbol: string }): Promise<Contract> {
    return deployContract('NamerTestFakeNoncompliantERC20', [formatBytes32String(name), formatBytes32String(symbol)])
  }

  function deployOptional(): Promise<Contract> {
    return deployContract('NamerTestFakeOptionalERC20')
  }

  async function getName(tokenAddress: string): Promise<string> {
    return safeNamer.tokenName(tokenAddress)
  }

  async function getSymbol(tokenAddress: string): Promise<string> {
    return safeNamer.tokenSymbol(tokenAddress)
  }

  describe('#tokenName', () => {
    it('works with compliant', async () => {
      const token = await deployCompliant({ name: 'token name', symbol: 'tn' })
      expect(await getName(token.address)).to.eq('token name')
    })
    it('works with noncompliant', async () => {
      const token = await deployNoncompliant({
        name: 'token name',
        symbol: 'tn',
      })
      expect(await getName(token.address)).to.eq('token name')
    })
    it('works with empty bytes32', async () => {
      const token = await deployNoncompliant({ name: '', symbol: '' })
      expect(await getName(token.address)).to.eq(token.address.toUpperCase().substr(2))
    })
    it('works with noncompliant full bytes32', async () => {
      const token = await deployNoncompliant({
        name: fullBytes32Name,
        symbol: fullBytes32Symbol,
      })
      expect(await getName(token.address)).to.eq(fullBytes32Name)
    })
    it('works with optional', async () => {
      const token = await deployOptional()
      expect(await getName(token.address)).to.eq(token.address.toUpperCase().substr(2))
    })
    it('works with non-code address', async () => {
      expect(await getName(constants.AddressZero)).to.eq(constants.AddressZero.substr(2))
    })
    it('works with really long strings', async () => {
      const token = await deployCompliant({
        name: 'token name'.repeat(32),
        symbol: 'tn'.repeat(32),
      })
      expect(await getName(token.address)).to.eq('token name'.repeat(32))
    })
    it('falls back to address with empty strings', async () => {
      const token = await deployCompliant({ name: '', symbol: '' })
      expect(await getName(token.address)).to.eq(token.address.toUpperCase().substr(2))
    })
  })

  describe('#tokenSymbol', () => {
    it('works with compliant', async () => {
      const token = await deployCompliant({ name: 'token name', symbol: 'tn' })
      expect(await getSymbol(token.address)).to.eq('tn')
    })
    it('works with noncompliant', async () => {
      const token = await deployNoncompliant({
        name: 'token name',
        symbol: 'tn',
      })
      expect(await getSymbol(token.address)).to.eq('tn')
    })
    it('works with empty bytes32', async () => {
      const token = await deployNoncompliant({ name: '', symbol: '' })
      expect(await getSymbol(token.address)).to.eq(token.address.substr(2, 6).toUpperCase())
    })
    it('works with noncompliant full bytes32', async () => {
      const token = await deployNoncompliant({
        name: fullBytes32Name,
        symbol: fullBytes32Symbol,
      })
      expect(await getSymbol(token.address)).to.eq(fullBytes32Symbol)
    })
    it('works with optional', async () => {
      const token = await deployOptional()
      expect(await getSymbol(token.address)).to.eq(token.address.substr(2, 6).toUpperCase())
    })
    it('works with non-code address', async () => {
      expect(await getSymbol(constants.AddressZero)).to.eq(constants.AddressZero.substr(2, 6))
    })
    it('works with really long strings', async () => {
      const token = await deployCompliant({
        name: 'token name'.repeat(32),
        symbol: 'tn'.repeat(32),
      })
      expect(await getSymbol(token.address)).to.eq('tn'.repeat(32))
    })
    it('falls back to address with empty strings', async () => {
      const token = await deployCompliant({ name: '', symbol: '' })
      expect(await getSymbol(token.address)).to.eq(token.address.substr(2, 6).toUpperCase())
    })
  })
})
