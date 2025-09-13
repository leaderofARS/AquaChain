import dotenv from 'dotenv';
import { JsonRpcProvider, id, Interface } from 'ethers';
import { init as initDb, markTxConfirmedByTxHash, markTxConfirmedByDataHash } from '../db/index.js';

dotenv.config();

const ABI = [
  'event Log(bytes32 indexed dataHash, string zone, uint256 ts, address actor)'
];

function getEnv(name, fallback = '') {
  const v = process.env[name];
  return (v === undefined || v === null || v === '') ? fallback : v;
}

async function main() {
  await initDb();

  const CONTRACT_ADDR = getEnv('IRRIGATION_AUDIT_ADDRESS', getEnv('IRRIGATION_CONTRACT_ADDRESS', ''));
  const HTTP_URL = getEnv('RPC_URL', getEnv('SEPOLIA_RPC', 'http://127.0.0.1:8545'));
  if (!CONTRACT_ADDR) throw new Error('missing IRRIGATION_AUDIT_ADDRESS');

  const provider = new JsonRpcProvider(HTTP_URL);
  const latest = await provider.getBlockNumber();
  const DEFAULT_WINDOW = 10_000; // scan last 10k blocks by default
  const fromBlock = parseInt(getEnv('REINDEX_FROM_BLOCK', String(Math.max(0, latest - DEFAULT_WINDOW))), 10);
  const toBlock = getEnv('REINDEX_TO_BLOCK', 'latest');

  const topic0 = id('Log(bytes32,string,uint256,address)');
  const filter = { address: CONTRACT_ADDR, fromBlock, toBlock, topics: [topic0] };

  console.log(`[reindexer] scanning ${CONTRACT_ADDR} from ${fromBlock} to ${String(toBlock)}`);

  const logs = await provider.getLogs(filter);
  const iface = new Interface(ABI);
  let confirmed = 0;
  for (const lg of logs) {
    try {
      const parsed = iface.parseLog(lg);
      const dataHash = parsed.args[0];
      const zone = parsed.args[1];
      const txHash = lg.transactionHash;
      const bn = lg.blockNumber;

      let { updated } = await markTxConfirmedByTxHash(txHash, bn);
      if (!updated) {
        ({ updated } = await markTxConfirmedByDataHash(dataHash, bn));
      }
      if (updated) confirmed++;
    } catch (e) {
      console.warn('[reindexer] parse error', e?.message || e);
    }
  }

  console.log(`[reindexer] done. logs=${logs.length}, confirmed_updated=${confirmed}`);
}

main().catch((e) => {
  console.error('[reindexer] fatal', e?.message || e);
  process.exit(1);
});
