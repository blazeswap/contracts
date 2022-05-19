const { deployContract, getEnvParam, getWNat } = require('./utils')

async function main() {
  const configSetter = getEnvParam('CONFIG_SETTER')
  const mathContext = await deployContract('BlazeSwapMath', [])
  const wNat = await getWNat()
  await deployContract('BlazeSwapManager', [configSetter, mathContext.address, wNat])
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
