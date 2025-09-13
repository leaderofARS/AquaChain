import 'dotenv/config';
import { ethers } from 'ethers';

async function main() {
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  const pk = process.env.PRIVATE_KEY;
  if (!rpcUrl) throw new Error('Missing SEPOLIA_RPC_URL');
  if (!pk) throw new Error('Missing PRIVATE_KEY');

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(pk, provider);

  const [network, address, balanceWei] = await Promise.all([
    provider.getNetwork(),
    wallet.getAddress(),
    provider.getBalance(await wallet.getAddress()),
  ]);

  console.log('Connected to:', network.name, `chainId=${network.chainId}`);
  console.log('Address:', address);
  console.log('Balance:', ethers.formatEther(balanceWei), 'ETH');

  // Optional: send a small tx if SEND_ETH_TO and SEND_ETH_VALUE are provided
  const to = process.env.SEND_ETH_TO;
  const valueEth = process.env.SEND_ETH_VALUE; // e.g. "0.001"
  if (to && valueEth) {
    console.log(`Sending ${valueEth} ETH to ${to}...`);
    const tx = await wallet.sendTransaction({ to, value: ethers.parseEther(valueEth) });
    console.log('Tx sent:', tx.hash);
    const receipt = await tx.wait();
    console.log('Tx mined in block', receipt?.blockNumber);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

