// Hardhat deploy script for IrrigationAudit
const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const IrrigationAudit = await hre.ethers.getContractFactory("IrrigationAudit");
  const contract = await IrrigationAudit.deploy();
  await contract.waitForDeployment();

  const addr = await contract.getAddress();
  console.log("IrrigationAudit deployed at:", addr);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
