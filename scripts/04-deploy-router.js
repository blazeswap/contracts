const { deployContract, getEnvParam, getWNat } = require('./utils')

async function main() {
  const factory = getEnvParam('FACTORY')
  const wNat = getWNat()
  await deployContract('BlazeSwapRouter', [factory, wNat, false])
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
