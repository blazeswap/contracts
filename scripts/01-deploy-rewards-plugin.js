const { deployContract, getEnvParam } = require('./utils')

async function main() {
  const manager = await ethers.getContractAt('BlazeSwapManager', getEnvParam('MANAGER'))
  const rewardsPlugin = await deployContract('BlazeSwapRewardsPlugin', [manager.address])
  await manager.setRewardsPlugin(rewardsPlugin.address)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
