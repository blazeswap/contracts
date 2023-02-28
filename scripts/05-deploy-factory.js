const { deployContract, getEnvParam } = require('./utils')

async function main() {
  const manager = getEnvParam('MANAGER')
  await deployContract('BlazeSwapFactory', [manager])
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
