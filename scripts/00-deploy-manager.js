const { deployContract, getEnvParam } = require('./utils')

async function main() {
  const configSetter = getEnvParam('CONFIG_SETTER')
  await deployContract('BlazeSwapManager', [configSetter])
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
