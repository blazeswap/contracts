import { task } from 'hardhat/config'
import '@typechain/hardhat'
import '@nomiclabs/hardhat-ethers'
import '@nomiclabs/hardhat-waffle'

import 'dotenv/config'

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task('accounts', 'Prints the list of accounts', async (args, hre) => {
  const accounts = await hre.ethers.getSigners()

  for (const account of accounts) {
    console.log(await account.address)
  }
})

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

function getAccounts(chainId: number) {
  let key
  switch (chainId) {
    case 16:
      key = process.env.COSTON_DEPLOYER_PRIVATE_KEY
      break
    case 19:
      key = process.env.SONGBIRD_DEPLOYER_PRIVATE_KEY
      break
  }
  return [key ?? '0x0000000000000000000000000000000000000000000000000000000000000000']
}

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
export default {
  networks: {
    hardhat: {
      chainId: 14,
      hardfork: 'london',
      accounts: {
        accountsBalance: '10000000000000000000000000',
      },
    },
    coston: {
      url: 'https://coston-api.flare.network/ext/bc/C/rpc',
      chainId: 16,
      accounts: getAccounts(16),
    },
    songbird: {
      url: 'https://songbird.towolabs.com/rpc',
      chainId: 19,
      accounts: getAccounts(19),
    },
  },
  solidity: {
    version: '0.8.16',
    settings: {
      metadata: {
        bytecodeHash: 'none',
      },
      evmVersion: 'london',
      optimizer: {
        enabled: true,
        runs: 8000,
      },
    },
  },
}
