import hre from 'hardhat'
import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { BigNumber, Contract, constants, utils } from 'ethers'
import { getAddress } from '@ethersproject/address'
import { keccak256 } from '@ethersproject/keccak256'
import { pack as solidityPack } from '@ethersproject/solidity'
import { toUtf8Bytes } from '@ethersproject/strings'
import { Signature } from '@ethersproject/bytes'

export const MINIMUM_LIQUIDITY = BigNumber.from(10).pow(3)

const PERMIT_TYPEHASH = keccak256(
  toUtf8Bytes('Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)')
)

export function expandTo18Decimals(n: number): BigNumber {
  return BigNumber.from(n).mul(BigNumber.from(10).pow(18))
}

export function getCreate2Address(
  factoryAddress: string,
  [tokenA, tokenB]: [string, string],
  bytecode: string
): string {
  const [token0, token1] = tokenA < tokenB ? [tokenA, tokenB] : [tokenB, tokenA]
  const create2Inputs = [
    '0xff',
    factoryAddress,
    keccak256(solidityPack(['address', 'address'], [token0, token1])),
    keccak256(bytecode),
  ]
  const sanitizedInputs = `0x${create2Inputs.map((i) => i.slice(2)).join('')}`
  return getAddress(`0x${keccak256(sanitizedInputs).slice(-40)}`)
}

export function getRewardManagerAddress(pairAddress: string): string {
  const createInputs = ['0xd694', pairAddress, '0x01']
  const sanitizedInputs = `0x${createInputs.map((i) => i.slice(2)).join('')}`
  return getAddress(`0x${keccak256(sanitizedInputs).slice(-40)}`)
}

export async function getApprovalSignature(
  wallet: SignerWithAddress,
  token: Contract,
  approve: {
    owner: string
    spender: string
    value: BigNumber
  },
  nonce: BigNumber,
  deadline: BigNumber
): Promise<Signature> {
  const name = await token.name()
  const signature = await wallet._signTypedData(
    {
      name,
      version: '1',
      chainId: 14,
      verifyingContract: token.address,
    },
    {
      Permit: [
        {
          name: 'owner',
          type: 'address',
        },
        {
          name: 'spender',
          type: 'address',
        },
        {
          name: 'value',
          type: 'uint256',
        },
        {
          name: 'nonce',
          type: 'uint256',
        },
        {
          name: 'deadline',
          type: 'uint256',
        },
      ],
    },
    {
      owner: approve.owner,
      spender: approve.spender,
      value: approve.value,
      nonce,
      deadline,
    }
  )
  return utils.splitSignature(signature)
}

// this doesn't work for extended interfaces
export function getInterfaceID(contractInterface: utils.Interface) {
  let interfaceID: BigNumber = constants.Zero
  const functions: string[] = Object.keys(contractInterface.functions)
  for (let i = 0; i < functions.length; i++) {
    interfaceID = interfaceID.xor(contractInterface.getSighash(functions[i]))
  }

  return interfaceID.toHexString()
}

export async function getLatestBlockNumber(): Promise<number> {
  return (await hre.ethers.provider.getBlock('latest')).number
}

// ganache 7.x only
export async function setTime(timestamp: number): Promise<any> {
  return hre.ethers.provider.send('evm_setTime', [timestamp * 1000])
}

export async function increaseTime(seconds: number): Promise<any> {
  return hre.ethers.provider.send('evm_increaseTime', [seconds])
}

// hardhat only
export async function setNextBlockTime(timestamp: number): Promise<any> {
  return hre.ethers.provider.send('evm_setNextBlockTimestamp', [timestamp])
}

export async function mineBlock(timestamp: number): Promise<any> {
  // await setTime(provider, timestamp) // enable for ganache 7.x
  return hre.ethers.provider.send('evm_mine', [timestamp])
}

export function encodePrice(reserve0: BigNumber, reserve1: BigNumber) {
  return [
    reserve1.mul(BigNumber.from(2).pow(112)).div(reserve0),
    reserve0.mul(BigNumber.from(2).pow(112)).div(reserve1),
  ]
}
