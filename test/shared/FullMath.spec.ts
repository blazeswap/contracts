import { waffle } from 'hardhat'
import { expect } from 'chai'
import { Contract, BigNumber, constants } from 'ethers'

import FullMathTest from '../../artifacts/contracts/shared/test/FullMathTest.sol/FullMathTest.json'

const { deployContract } = waffle

describe('FullMath', () => {
  const provider = waffle.provider
  const [wallet] = provider.getWallets()

  let fm: Contract
  before('deploy FullMathTest', async () => {
    fm = await deployContract(wallet, FullMathTest)
  })

  describe('#mulDiv', () => {
    const Q128 = BigNumber.from(2).pow(128)
    it('accurate without phantom overflow', async () => {
      const result = Q128.div(3)
      expect(
        await fm.mulDiv(
          Q128,
          /*0.5=*/ BigNumber.from(50).mul(Q128).div(100),
          /*1.5=*/ BigNumber.from(150).mul(Q128).div(100)
        )
      ).to.eq(result)

      expect(
        await fm.mulDivRoundingUp(
          Q128,
          /*0.5=*/ BigNumber.from(50).mul(Q128).div(100),
          /*1.5=*/ BigNumber.from(150).mul(Q128).div(100)
        )
      ).to.eq(result.add(1))
    })

    it('accurate with phantom overflow', async () => {
      const result = BigNumber.from(4375).mul(Q128).div(1000)
      expect(await fm.mulDiv(Q128, BigNumber.from(35).mul(Q128), BigNumber.from(8).mul(Q128))).to.eq(result)
      expect(await fm.mulDivRoundingUp(Q128, BigNumber.from(35).mul(Q128), BigNumber.from(8).mul(Q128))).to.eq(result)
    })

    it('accurate with phantom overflow and repeating decimal', async () => {
      const result = BigNumber.from(1).mul(Q128).div(3)
      expect(await fm.mulDiv(Q128, BigNumber.from(1000).mul(Q128), BigNumber.from(3000).mul(Q128))).to.eq(result)
      expect(await fm.mulDivRoundingUp(Q128, BigNumber.from(1000).mul(Q128), BigNumber.from(3000).mul(Q128))).to.eq(
        result.add(1)
      )
    })
  })
})
