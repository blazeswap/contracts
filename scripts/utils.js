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

  if (process.env['VERIFY_SOURCE_CODE'] == 'true') try {
    console.log('Verifying contract')
    const module = periphery ? 'periphery' : 'core'
    await hre.run('verify:verify', {
      address: contract.address,
      contract: `contracts/${module}/${name}.sol:${name}`,
      constructorArguments: params,
    })
  } catch (err) {
    console.log(err)
  }

  return contract
}

module.exports.getFlareContractAddress = async function (name) {
  const registry = await ethers.getContractAt('FlareContractRegistry', '0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019')
  const address = await registry.getContractAddressByName(name)
  return address
}
