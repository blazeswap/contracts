const { deployContract, getEnvParam } = require('./utils')

async function main() {
  const manager = await ethers.getContractAt('BlazeSwapManager', getEnvParam('MANAGER'))
  const initialProvider = getEnvParam('INITIAL_PROVIDER')
  const delegationPlugin = await deployContract('BlazeSwapDelegationPlugin', [manager.address])
  await delegationPlugin.setInitialProvider(initialProvider)
  await delegationPlugin.setMaxDelegatesByPercent(2)
  await manager.setDelegationPlugin(delegationPlugin.address)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
