const { deployContract, getEnvParam, getFlareContractAddress } = require('./utils')

async function main() {
  const factory = getEnvParam('FACTORY')
  const wNat = getFlareContractAddress('WNat')
  await deployContract('BlazeSwapRouter', [factory, wNat, false], true)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
