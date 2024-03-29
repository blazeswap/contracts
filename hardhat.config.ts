import { task } from 'hardhat/config'
import '@nomicfoundation/hardhat-toolbox'

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

function getRpcUrl(network: string) {
  return `https://${network}-api.flare.network/ext/bc/C/rpc`
}

function getApiUrl(network: string) {
  return `https://${network}-explorer.flare.network/api`
}

function getBrowserUrl(network: string) {
  return `https://${network}-explorer.flare.network/`
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
      url: getRpcUrl('coston'),
      chainId: 16,
      accounts: getAccounts(),
    },
    coston2: {
      url: getRpcUrl('coston2'),
      chainId: 114,
      accounts: getAccounts(),
    },
    songbird: {
      url: getRpcUrl('songbird'),
      chainId: 19,
      accounts: getAccounts(),
    },
    flare: {
      url: getRpcUrl('flare'),
      chainId: 14,
      accounts: getAccounts(),
    },
  },
  etherscan: {
    apiKey: {
      coston: '...',
      coston2: '...',
      songbird: '...',
      flare: '...',
    },
    customChains: [
      {
        network: 'coston',
        chainId: 16,
        urls: {
          apiURL: getApiUrl('coston'),
          browserURL: getBrowserUrl('coston')
        }
      },
      {
        network: 'coston2',
        chainId: 114,
        urls: {
          apiURL: getApiUrl('coston2'),
          browserURL: getBrowserUrl('coston2')
        }
      },
      {
        network: 'songbird',
        chainId: 19,
        urls: {
          apiURL: getApiUrl('songbird'),
          browserURL: getBrowserUrl('songbird')
        }
      },
      {
        network: 'flare',
        chainId: 14,
        urls: {
          apiURL: getApiUrl('flare'),
          browserURL: getBrowserUrl('flare')
        }
      },
    ]
  },
  solidity: {
    version: '0.8.20',
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
