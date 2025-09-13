// Hardhat script to call IrrigationAudit.log with a sample or provided hash
const hre = require("hardhat");
const { keccak256, toUtf8Bytes } = require("ethers");

async function main() {
  const [signer] = await hre.ethers.getSigners();
  const addr = process.argv[2];
  if (!addr) throw new Error("Usage: hardhat run scripts/anchor.js --network sepolia <contract_addr> [dataHash] [zone]");
  const providedHash = process.argv[3];
  const zone = process.argv[4] || "zone-1";

  const abi = [
    "function log(bytes32 dataHash, string zone) external",
    "event Log(bytes32 indexed dataHash, string zone, uint256 ts, address actor)"
  ];

  const contract = new hre.ethers.Contract(addr, abi, signer);
  const dataHash = providedHash && /^0x[0-9a-fA-F]{64}$/.test(providedHash)
    ? providedHash
    : keccak256(toUtf8Bytes(JSON.stringify({ demo: true, ts: Date.now() })));

  const tx = await contract.log(dataHash, zone);
  console.log("tx_hash:", tx.hash);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

