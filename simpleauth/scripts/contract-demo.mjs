import 'dotenv/config';
import { ethers } from 'ethers';
import fs from 'node:fs';

async function main() {
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  const pk = process.env.PRIVATE_KEY;
  const contractAddress = process.env.CONTRACT_ADDRESS;
  const contractAbiPath = process.env.CONTRACT_ABI_PATH; // path to a JSON file containing an ABI array

  if (!rpcUrl) throw new Error('Missing SEPOLIA_RPC_URL');
  if (!pk) throw new Error('Missing PRIVATE_KEY');
  if (!contractAddress) throw new Error('Missing CONTRACT_ADDRESS');
  if (!contractAbiPath) throw new Error('Missing CONTRACT_ABI_PATH');

  const abi = JSON.parse(fs.readFileSync(contractAbiPath, 'utf8'));

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(pk, provider);

  console.log('Using account:', await wallet.getAddress());

  const contract = new ethers.Contract(contractAddress, abi, provider);
  const contractWithSigner = contract.connect(wallet);

  // Example: perform a read function if provided
  const readFn = process.env.READ_FUNCTION; // e.g. symbol
  const readArgs = process.env.READ_ARGS ? JSON.parse(process.env.READ_ARGS) : [];
  if (readFn) {
    const result = await contract[readFn](...readArgs);
    console.log(`Read ${readFn}(${JSON.stringify(readArgs)}):`, result);
  }

  // Example: perform a write function if provided
  const writeFn = process.env.WRITE_FUNCTION; // e.g. transfer
  const writeArgs = process.env.WRITE_ARGS ? JSON.parse(process.env.WRITE_ARGS) : [];
  if (writeFn) {
    console.log(`Sending write tx ${writeFn}(${JSON.stringify(writeArgs)})...`);
    const tx = await contractWithSigner[writeFn](...writeArgs);
    console.log('Tx sent:', tx.hash);
    const receipt = await tx.wait();
    console.log('Tx mined in block', receipt?.blockNumber, 'status', receipt?.status);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

