const hre = require('hardhat')

require('dotenv').config()

const wNatAddress = {
  coston: '0x1659941d425224408c5679eeef606666c7991a8A',
}

module.exports.getWNat = function () {
  return wNatAddress[hre.network.name]
}

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
