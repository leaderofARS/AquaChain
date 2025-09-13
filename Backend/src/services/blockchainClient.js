import dotenv from 'dotenv';
import { JsonRpcProvider, WebSocketProvider, Wallet, Contract, id } from 'ethers';
import { computeDataHash } from '../utils/hash.js';
import { insertPendingTx, markTxConfirmedByTxHash, markTxConfirmedByDataHash } from '../db/index.js';

dotenv.config();

const ABI = [
  'event Log(bytes32 indexed dataHash, string zone, uint256 ts, address actor)',
  'function log(bytes32 dataHash, string zone) external'
];

let provider = null;
let signer = null; // Wallet or JsonRpcSigner
let contract = null;
let ioRef = null;
let enabled = false;

// Serialize tx submissions to prevent nonce collisions
let txChain = Promise.resolve();

function getEnv(name, fallback = '') {
  const v = process.env[name];
  return (v === undefined || v === null || v === '') ? fallback : v;
}

export function isEnabled() {
  return enabled;
}

export async function init(io) {
  ioRef = io || null;

  const CONTRACT_ADDR = getEnv('IRRIGATION_AUDIT_ADDRESS', getEnv('IRRIGATION_CONTRACT_ADDRESS', ''));
  const WS_URL = getEnv('RPC_WS', getEnv('SEPOLIA_WS', ''));
  const HTTP_URL = getEnv('RPC_URL', getEnv('SEPOLIA_RPC', 'http://127.0.0.1:8545'));
  const PRIV = getEnv('PRIVATE_KEY', getEnv('WALLET_PRIVATE_KEY', getEnv('DEPLOYER_KEY', '')));

  if (!CONTRACT_ADDR || !PRIV) {
    console.warn('[anchor] disabled: missing contract address or private key');
    enabled = false;
    return { enabled };
  }

  try {
    provider = WS_URL ? new WebSocketProvider(WS_URL) : new JsonRpcProvider(HTTP_URL);
    if (PRIV) {
      signer = new Wallet(PRIV, provider);
    } else {
      try {
        // Try to use an unlocked account on local node (Hardhat/Anvil)
        const accounts = await provider.listAccounts();
        if (accounts && accounts.length > 0) {
          const addr = typeof accounts[0] === 'string' ? accounts[0] : accounts[0].address;
          signer = await provider.getSigner(addr ?? 0);
          console.log('[anchor] using unlocked account signer', addr ?? 0);
        }
      } catch {}
    }
    if (!signer) {
      throw new Error('no signer available (provide PRIVATE_KEY or run local node with unlocked accounts)');
    }
    contract = new Contract(CONTRACT_ADDR, ABI, signer);

    enabled = true;
    console.log('[anchor] initialized', {
      address: CONTRACT_ADDR,
      transport: WS_URL ? 'websocket' : 'http'
    });

    // If WS, subscribe to events to mark confirmations in near real-time
    if (WS_URL) {
      contract.on('Log', async (dataHash, zone, ts, actor, evt) => {
        try {
          const txHash = evt.log?.transactionHash || evt.transactionHash;
          const blockNumber = evt.log?.blockNumber || evt.blockNumber;
          // Prefer tx-hash keyed update; fall back to data-hash if needed
          let updated = false;
          if (txHash) {
            const { updated: ok } = await markTxConfirmedByTxHash(txHash, blockNumber);
            updated = ok;
          }
          if (!updated && dataHash) {
            await markTxConfirmedByDataHash(dataHash, blockNumber);
          }
          if (ioRef) ioRef.emit('tx_update', { status: 'confirmed', data_hash: dataHash, zone, tx_hash: txHash, block_number: blockNumber });
        } catch (e) {
          console.warn('[anchor] event handling error', e?.message || e);
        }
      });
    }
  } catch (e) {
    console.error('[anchor] init failed', e?.message || e);
    enabled = false;
  }

  return { enabled };
}


async function sendAnchor(job) {
  if (!enabled || !contract) throw new Error('anchor not configured');

  const { dataHash, zone, raw_payload } = job;

  // Send transaction with basic retry/backoff
  let attempt = 0;
  const maxAttempts = 5;
  const baseDelayMs = 1000;

  while (attempt < maxAttempts) {
    try {
      const tx = await contract.log(dataHash, zone || '');
      await insertPendingTx(dataHash, zone || '', tx.hash, raw_payload || null);
      if (ioRef) ioRef.emit('tx_update', { status: 'pending', data_hash: dataHash, zone, tx_hash: tx.hash });
      return { txHash: tx.hash };
    } catch (err) {
      const msg = String(err?.message || err);
      // Retry on transient errors
      const retriable = /nonce|temporar|timeout|rate|replacement|underpriced/i.test(msg);
      attempt++;
      if (!retriable || attempt >= maxAttempts) {
        throw new Error(`anchor send failed: ${msg}`);
      }
      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

export async function anchorSnapshot(snapshot) {
  const dataHash = computeDataHash(snapshot);
  const zone = snapshot.zone || '';
  return anchorDataHash(dataHash, zone, { snapshot });
}

export async function anchorDataHash(dataHash, zone, raw_payload) {
  if (!enabled) throw new Error('anchor service disabled');
  const job = { dataHash, zone: zone || '', raw_payload: raw_payload || null };
  // Chain the send to avoid concurrent nonce usage
  const resPromise = txChain.then(() => sendAnchor(job));
  // Update chain, but swallow errors to keep chain alive
  txChain = resPromise.catch((e) => {
    console.warn('[anchor] send error', e?.message || e);
  });
  return resPromise;
}
