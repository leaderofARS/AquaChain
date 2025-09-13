require('dotenv').config();
require('@nomicfoundation/hardhat-toolbox');

module.exports = {
  solidity: '0.8.20',
  networks: {
    sepolia: {
      url: process.env.SEPOLIA_RPC || '',
      // Prefer PRIVATE_KEY per blueprint; fallback to DEPLOYER_KEY if present
      accounts: process.env.PRIVATE_KEY
        ? [process.env.PRIVATE_KEY]
        : (process.env.DEPLOYER_KEY ? [process.env.DEPLOYER_KEY] : [])
    }
  }
};
