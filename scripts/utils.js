const hre = require('hardhat')
const path = require('path')

require('dotenv').config({ path: path.resolve(process.cwd(), '.env-' + hre.network.name) })

module.exports.getEnvParam = function (key) {
  return process.env[`${key}`]
}

module.exports.deployContract = async function (name, params, periphery = false) {
  console.log(`Deploying ${name}([${params}])`)

  const factory = await ethers.getContractFactory(name)
  const contract = await factory.deploy(...params)

  await contract.deployed()

  console.log(`${name} deployed at: ${contract.address}`)

  if (process.env['VERIFY_SOURCE_CODE'] == 'true') {
    console.log('Verifying contract')
    const module = periphery ? "periphery" : "core"
    await hre.run('verify:verify', {
      address: contract.address,
      contract: `contracts/${module}/${name}.sol:${name}`,
      constructorArguments: params,
    })
  }

  return contract
}
