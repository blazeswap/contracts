const BlazeSwapPair = require('../artifacts/contracts/core/BlazeSwapPair.sol/BlazeSwapPair.json')
const keccak256 = require('@ethersproject/keccak256').keccak256

async function main() {
  console.log(keccak256(BlazeSwapPair.bytecode))
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
