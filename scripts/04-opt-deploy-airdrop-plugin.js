const { deployContract, getEnvParam } = require('./utils')

async function main() {
  const manager = await ethers.getContractAt('BlazeSwapManager', getEnvParam('MANAGER'))
  const airdropPlugin = await deployContract('BlazeSwapAirdropPlugin', [])
  await manager.setAirdropPlugin(airdropPlugin.address)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
