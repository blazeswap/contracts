import hre from 'hardhat'
import type { Signer } from 'ethers'

export async function deployContract(name: string, params: any[] = [], wallet?: Signer) {
  if (!wallet) wallet = (await hre.ethers.getSigners())[0]
  const factory = await hre.ethers.getContractFactory(name, wallet)
  const contract = await factory.deploy(...params)
  await contract.deployed()
  return contract
}
