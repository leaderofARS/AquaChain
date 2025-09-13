import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { init as initDb, upsertReading, bulkUpsert, fetchNextControl, enqueueControl, fetchRecentReadings } from './db/index.js';
import { computeDataHash } from './utils/hash.js';
import { init as initAnchor, isEnabled as anchorEnabled, anchorSnapshot, anchorDataHash } from './services/blockchainClient.js';

dotenv.config();

// Resolve __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

const frontendOrigin = (process.env.FRONTEND_ORIGIN || 'http://localhost:3000')
  .split(',')
  .map((s) => s.trim());
app.use(cors({ origin: frontendOrigin, credentials: true }));

// Serve static assets and configure EJS views. Resolve base directory whether running in Docker (/app) or from repo root.
const candidateBases = [
  path.resolve(__dirname, '..'),
  path.resolve(__dirname, '../../')
];
const baseDir = candidateBases.find(d => {
  try { return fs.statSync(path.join(d, 'views')).isDirectory(); } catch { return false; }
}) || candidateBases[0];
app.use(express.static(path.join(baseDir, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(baseDir, 'views'));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'backend', ts: Date.now() });
});

// Basic views: login and dashboard
app.get('/', (_req, res) => res.redirect('/login'));
app.get('/login', (req, res) => {
  const { error } = req.query;
  res.render('login', { error: error || null });
});
app.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.redirect('/login?error=' + encodeURIComponent('Username and password required'));
  }
  return res.redirect('/dashboard?username=' + encodeURIComponent(username));
});
app.get('/dashboard', (req, res) => {
  const username = req.query.username || 'User';
  res.render('dashboard', { username });
});

// Device token check (simple stub)
function requireDeviceToken(req, res, next) {
  const token = req.get('X-Device-Token') || req.headers['x-device-token'];
  if (!token || token === 'replace_with_device_token') {
    return res.status(401).json({ ok: false, error: 'missing or invalid device token' });
  }
  req.deviceToken = token;
  next();
}

// Validate minimal snapshot
function validateSnapshot(s) {
  if (!s || typeof s !== 'object') return 'invalid body';
  if (!s.device_id) return 'device_id required';
  if (typeof s.ts !== 'number') return 'ts (number) required';
  return null;
}

app.post('/api/sensor', requireDeviceToken, async (req, res) => {
  const snap = req.body || {};
  const err = validateSnapshot(snap);
  if (err) return res.status(400).json({ ok: false, error: err });
  // Compute dedupe hash
  const dataHash = computeDataHash(snap);
  try {
    const { inserted } = await upsertReading(snap, dataHash);
    io.emit('telemetry', { ...snap, dataHash, inserted });

    // Attempt to anchor on-chain if enabled
    let txHash = null;
    if (anchorEnabled()) {
      try {
        const r = await anchorDataHash(dataHash, snap.zone || '', { request: 'sensor_ingest' });
        txHash = r?.txHash || null;
        if (txHash) io.emit('tx_update', { status: 'pending', data_hash: dataHash, zone: snap.zone || '', tx_hash: txHash });
      } catch (anchorErr) {
        console.warn('[anchor] sensor route anchor failed:', anchorErr?.message || anchorErr);
      }
    }

    return res.status(200).json({ ok: true, dataHash, inserted, tx_hash: txHash });
  } catch (e) {
    console.error('sensor upsert error', e);
    return res.status(500).json({ ok: false, error: 'internal_error' });
  }
});

app.post('/api/sync', requireDeviceToken, async (req, res) => {
  const arr = Array.isArray(req.body) ? req.body : [];
  const prepared = [];
  for (const s of arr) {
    const err = validateSnapshot(s);
    if (!err) {
      const dataHash = computeDataHash(s);
      prepared.push({ snapshot: s, dataHash });
    }
  }
  try {
    const { inserted, duplicates } = await bulkUpsert(prepared);
    if (prepared.length > 0) io.emit('telemetry', { batch: true, count: prepared.length });
    return res.status(200).json({ ok: true, received: prepared.length, inserted, duplicates });
  } catch (e) {
    console.error('sync error', e);
    return res.status(500).json({ ok: false, error: 'internal_error' });
  }
});

app.get('/api/readings/recent', async (req, res) => {
  const limit = parseInt(req.query.limit || '10', 10);
  try {
    const rows = await fetchRecentReadings(limit);
    return res.status(200).json({ ok: true, rows });
  } catch (e) {
    console.error('recent readings error', e);
    return res.status(500).json({ ok: false, error: 'internal_error' });
  }
});

app.get('/api/control', async (req, res) => {
  const device = req.query.device || 'unknown';
  try {
    const cmd = await fetchNextControl(device);
    if (!cmd) return res.status(200).json({ device, force_relay: false });
    return res.status(200).json({ device, ...cmd });
  } catch (e) {
    console.error('control error', e);
    return res.status(500).json({ ok: false, error: 'internal_error' });
  }
});

// Admin: enqueue a control command for a device
// Example body: { "device_id":"esp32-devkitv1-01", "zone":"zone-1", "force_relay": true, "duration_ms": 5000 }
app.post('/api/irrigate', async (req, res) => {
  const { device_id, zone, force_relay = true, duration_ms } = req.body || {};
  if (!device_id) return res.status(400).json({ ok: false, error: 'device_id required' });
  const command = { force_relay: !!force_relay };
  if (typeof duration_ms === 'number') command.duration_ms = duration_ms;
  try {
    const { enqueued } = await enqueueControl(device_id, zone, command);
    io.emit('control_enqueued', { device_id, zone: zone || null, command });
    return res.status(200).json({ ok: true, enqueued });
  } catch (e) {
    console.error('enqueue control error', e);
    return res.status(500).json({ ok: false, error: 'internal_error' });
  }
});

// Anchor endpoint: accepts either a full snapshot or a precomputed data_hash + zone
// Body examples:
// 1) { snapshot: { ...device payload... } }
// 2) { data_hash: "0x...", zone: "zone-1" }
app.post('/api/anchor', async (req, res) => {
  try {
    let tx;
    if (req.body && req.body.snapshot) {
      const snap = req.body.snapshot;
      const err = validateSnapshot(snap);
      if (err) return res.status(400).json({ ok: false, error: err });
      if (!anchorEnabled()) return res.status(503).json({ ok: false, error: 'anchor_unavailable' });
      tx = await anchorSnapshot(snap);
    } else if (req.body && req.body.data_hash) {
      const dataHash = req.body.data_hash;
      const zone = req.body.zone || '';
      if (!/^0x[0-9a-fA-F]{64}$/.test(String(dataHash))) {
        return res.status(400).json({ ok: false, error: 'invalid data_hash' });
      }
      if (!anchorEnabled()) return res.status(503).json({ ok: false, error: 'anchor_unavailable' });
      tx = await anchorDataHash(dataHash, zone, { request: 'precomputed_hash' });
    } else {
      return res.status(400).json({ ok: false, error: 'snapshot or data_hash required' });
    }
    return res.status(200).json({ ok: true, tx_hash: tx.txHash });
  } catch (e) {
    console.error('anchor error', e);
    return res.status(500).json({ ok: false, error: 'internal_error' });
  }
});

// Force API JSON responses for not found and parse errors
app.use('/api', (req, res, next) => {
  res.status(404).json({ ok: false, error: 'not_found', path: req.originalUrl });
});

app.use((err, req, res, next) => {
  const isJsonParse = err && err.type === 'entity.parse.failed';
  if (isJsonParse) return res.status(400).json({ ok: false, error: 'invalid_json' });
  console.error('unhandled error', err);
  return res.status(500).json({ ok: false, error: 'internal_error' });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: frontendOrigin, credentials: true },
  path: process.env.SOCKET_PATH || '/socket.io'
});

const port = parseInt(process.env.PORT || '5000', 10);
const host = '0.0.0.0';
// Friendly display host for humans (used only in logs)
const displayHost = process.env.PUBLIC_HOST || 'localhost';

// Initialize DB then start server
initDb().finally(async () => {
  await initAnchor(io);
  server.listen(port, host, () => {
    console.log(`Backend listening on port ${port} (bind: ${host})`);
    console.log(`Open http://${displayHost}:${port}/health to verify`);
  });
});
