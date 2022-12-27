const { deployContract, getEnvParam } = require('./utils')

async function main() {
  const factory = getEnvParam('FACTORY')
  const manager = await ethers.getContractAt('BlazeSwapManager', getEnvParam('MANAGER'))
  const wNat = await manager.wNat()
  await deployContract('BlazeSwapMigrator', [factory, wNat], true)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
