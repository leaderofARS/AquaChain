import { Pool } from 'pg';

function buildConnectionString() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const host = process.env.PGHOST || 'localhost';
  const port = process.env.PGPORT || '5432';
  const user = process.env.PGUSER || 'app';
  const password = process.env.PGPASSWORD || 'app_password';
  const db = process.env.PGDATABASE || 'aquachain';
  return `postgresql://${user}:${password}@${host}:${port}/${db}`;
}

let pool;
let useMemory = false;
const memoryReadings = new Map(); // dataHash -> snapshot
const memoryCommands = new Map(); // device_id -> [commands]

export async function init() {
  try {
    pool = new Pool({ connectionString: buildConnectionString() });
    await pool.query('SELECT 1');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS readings (
        id BIGSERIAL PRIMARY KEY,
        device_id TEXT NOT NULL,
        zone TEXT,
        ts BIGINT NOT NULL,
        soil_moisture_pct INT,
        temp_c DOUBLE PRECISION,
        humidity_pct DOUBLE PRECISION,
        valve_state INT,
        edge_decision BOOLEAN,
        data_hash TEXT UNIQUE NOT NULL,
        raw JSONB,
        created_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_readings_device_ts ON readings(device_id, ts);
      CREATE TABLE IF NOT EXISTS control_queue (
        id BIGSERIAL PRIMARY KEY,
        device_id TEXT NOT NULL,
        zone TEXT,
        command JSONB NOT NULL,
        enqueued_at TIMESTAMPTZ DEFAULT now(),
        delivered BOOLEAN DEFAULT FALSE
      );
      CREATE INDEX IF NOT EXISTS idx_control_queue_device ON control_queue(device_id, delivered);
    `);
    console.log('PostgreSQL ready');
  } catch (err) {
    console.warn('PostgreSQL not available, falling back to in-memory store:', err.message);
    useMemory = true;
  }
}

export async function upsertReading(snapshot, dataHash) {
  if (useMemory) {
    const dup = memoryReadings.has(dataHash);
    if (!dup) memoryReadings.set(dataHash, snapshot);
    return { inserted: !dup };
  }
  const text = `INSERT INTO readings (device_id, zone, ts, soil_moisture_pct, temp_c, humidity_pct, valve_state, edge_decision, data_hash, raw)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
                ON CONFLICT (data_hash) DO NOTHING`;
  const values = [
    snapshot.device_id || null,
    snapshot.zone || null,
    snapshot.ts || 0,
    snapshot.soil_moisture_pct ?? null,
    snapshot.temp_c ?? null,
    snapshot.humidity_pct ?? null,
    snapshot.valve_state ?? null,
    snapshot.edge_decision ?? null,
    dataHash,
    snapshot
  ];
  const res = await pool.query(text, values);
  return { inserted: res.rowCount > 0 };
}

export async function bulkUpsert(snapshotsWithHash) {
  let inserted = 0, duplicates = 0;
  for (const { snapshot, dataHash } of snapshotsWithHash) {
    const { inserted: ok } = await upsertReading(snapshot, dataHash);
    if (ok) inserted++; else duplicates++;
  }
  return { inserted, duplicates };
}

export async function fetchNextControl(deviceId) {
  if (useMemory) {
    const q = memoryCommands.get(deviceId) || [];
    return q.length > 0 ? q.shift() : null;
  }
  const select = `SELECT id, command FROM control_queue WHERE device_id=$1 AND delivered=false ORDER BY enqueued_at ASC LIMIT 1`;
  const res = await pool.query(select, [deviceId]);
  if (res.rowCount === 0) return null;
  const row = res.rows[0];
  await pool.query(`UPDATE control_queue SET delivered=true WHERE id=$1`, [row.id]);
  return row.command;
}

export async function enqueueControl(deviceId, zone, command) {
  if (!deviceId || !command) throw new Error('deviceId and command required');
  if (useMemory) {
    const q = memoryCommands.get(deviceId) || [];
    q.push(command);
    memoryCommands.set(deviceId, q);
    return { enqueued: 1 };
  }
  const text = `INSERT INTO control_queue (device_id, zone, command) VALUES ($1,$2,$3)`;
  await pool.query(text, [deviceId, zone || null, command]);
  return { enqueued: 1 };
}

export async function fetchRecentReadings(limit = 10) {
  if (useMemory) {
    const arr = Array.from(memoryReadings.values());
    arr.sort((a, b) => (b.ts || 0) - (a.ts || 0));
    return arr.slice(0, Math.max(1, Math.min(100, limit)));
  }
  const lim = Math.max(1, Math.min(100, parseInt(limit, 10) || 10));
  const q = `SELECT device_id, zone, ts, soil_moisture_pct, temp_c, humidity_pct, valve_state, edge_decision, data_hash, raw, created_at
             FROM readings ORDER BY ts DESC LIMIT $1`;
  const res = await pool.query(q, [lim]);
  return res.rows.map((r) => ({
    device_id: r.device_id,
    zone: r.zone,
    ts: Number(r.ts),
    soil_moisture_pct: r.soil_moisture_pct,
    temp_c: r.temp_c,
    humidity_pct: r.humidity_pct,
    valve_state: r.valve_state,
    edge_decision: r.edge_decision,
    data_hash: r.data_hash,
    created_at: r.created_at,
    raw: r.raw
  }));
}
