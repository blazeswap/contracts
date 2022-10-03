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
function getAccounts() {
  const key = process.env.DEPLOYER_PRIVATE_KEY
  return [key ?? '0x0000000000000000000000000000000000000000000000000000000000000000']
}

function getUrl(network: string) {
  return `https://${network}-api.flare.network/ext/bc/C/rpc`
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
      url: getUrl('coston'),
      chainId: 16,
      accounts: getAccounts(),
    },
    coston2: {
      url: getUrl('coston2'),
      chainId: 114,
      accounts: getAccounts(),
    },
    songbird: {
      url: getUrl('songbird'),
      chainId: 19,
      accounts: getAccounts(),
    },
    flare: {
      url: getUrl('flare'),
      chainId: 14,
      accounts: getAccounts(),
    },
  },
  solidity: {
    version: '0.8.17',
    settings: {
      metadata: {
        bytecodeHash: 'none',
      },
      evmVersion: 'london',
      optimizer: {
        enabled: true,
        runs: 10000,
      },
    },
  },
}
