const hre = require('hardhat')

require('dotenv').config()

module.exports.getEnvParam = function (suffix) {
  return process.env[`${hre.network.name.toUpperCase()}_${suffix}`]
}

module.exports.deployContract = async function (name, params) {
  console.log(`Deploying ${name}([${params}])`)

  const factory = await ethers.getContractFactory(name)
  const contract = await factory.deploy(...params)

  await contract.deployed()

  console.log(`${name} deployed at: ${contract.address}`)

  return contract
}
