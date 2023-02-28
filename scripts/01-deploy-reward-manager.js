const { deployContract, getEnvParam } = require('./utils')

async function main() {
  const manager = await ethers.getContractAt('BlazeSwapManager', getEnvParam('MANAGER'))
  const rewardManager = await deployContract('BlazeSwapRewardManager', [])
  await manager.setRewardManager(rewardManager.address)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
