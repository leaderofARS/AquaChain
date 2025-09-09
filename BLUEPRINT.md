
## Full variable & API blueprint — all layers, names, types, responsibilities, and the functions/classes you’ll need

Ruthless, production-minded, and ready for your 4-person hackathon team. I’ll give you every variable name you should use, mapped across stacks (EJS frontend templates, blockchain, IoT firmware, Python AI service, Node backend, MongoDB), plus the functions and classes each team member will implement. For each item: type, purpose, example, and acceptance test. Use this as the canonical contract between teammates — copy/paste names into your codebases so everyone interoperates smoothly.

**Strong opinion:** use consistent naming (snake_case for DB/JSON, camelCase for JS objects & functions), keep secrets out of code, and make env var names explicit. Don’t invent names later — this single source of truth prevents merge-time chaos.

### Legend (naming & typing)

- **string** — UTF-8 string
- **int** — integer (seconds, ms, counts)
- **float** — decimal (sensor values)
- **bool** — boolean
- **datetime** — ISO 8601 timestamp string, or epoch milliseconds depending on layer
- **Object / {}** — JSON object
- **Array / []** — JSON array

**Use these conventions:**

- **DB / API JSON:** snake_case (e.g., `device_id`)
- **JS variables/functions/classes:** camelCase (e.g., `computeDataHash()`, `DeviceManager`)
- **Env vars:** SCREAMING_SNAKE (e.g., `SEPOLIA_RPC`, `DB_URI`)

---

### 1 — Global environment variables (backend / deployment)

These are your only true secrets/config. Keep them in .env, CI secrets, or vault.

| Name | Type | Purpose | Example |
|------|------|---------|---------|
| PORT | int | HTTP port for backend | 3000 |
| NODE_ENV | string | development|production | "production" |
| DB_URI | string | MongoDB connection string | mongodb://localhost:27017/irrigation |
| SEPOLIA_RPC | string | Sepolia RPC endpoint (Infura/Alchemy). DO NOT COMMIT. | |
| BACKEND_PRIVATE_KEY | string | Backend signer private key for contract calls. NEVER store in repo; use vault. | |
| CONTRACT_ADDRESS | string | Deployed IrrigationAudit contract address. | |
| WATERCREDIT_ADDRESS | string | Deployed token contract (if used). | |
| IPFS_API | string | Optional IPFS provider endpoint (e.g., Pinata). | |
| TWILIO_SID, TWILIO_AUTH | string | for SMS notifications (optional). | |
| FRONTEND_ORIGIN | string | allowed CORS origin. | |
| DEVICE_AUTH_KEY | string | shared key used to authenticate device POSTs (short TTL) — rotate often. | |

**Acceptance test:** backend fails to start if any required env missing; reads keys via process.env.

---

### 2 — MongoDB collections & fields (canonical JSON schema)

Use collection names exactly as below. Index device_id, zone, and dataHash (unique).

#### devices

| Field | Type | Example |
|-------|------|---------|
| device_id | string, PK | "ESP32-DEV-01" |
| zone | string | "zone-A" |
| model | string | "ESP32-WROOM" |
| last_seen | datetime | |
| firmware_ver | string | "v0.1" |
| auth_token | string | device-specific token (rotate) |
| meta | Object | { "location": { "lat": 12.34, "lng": 56.78 } } |

#### readings

| Field | Type | Example |
|-------|------|---------|
| _id | ObjectId | |
| device_id | string | |
| zone | string | |
| ts | datetime | when reading taken |
| soil_moisture | float | 27.5 |
| temp_c | float | |
| humidity_pct | float, optional | |
| battery_pct | float | |
| valve_state | string | "open" / "closed" |
| edge_decision | string | "irrigate" / "skip" |
| raw | Object | raw sensor payload |
| synced | bool | whether anchored to chain |

#### events (anchored actions)

| Field | Type | Example |
|-------|------|---------|
| _id | ObjectId | |
| zone | string | |
| event_type | string | "irrigation_started" | "irrigation_stopped" | "manual_override" | "sync" |
| dataHash | string | 0x... keccak256 hex |
| ipfs_cid | string|null | |
| txHash | string|null | |
| status | string | "pending"| "confirmed"| "failed" |
| actor | string | "backend"| "device:ESP32-DEV-01"| "user:0xABC..." |
| ts | datetime | |

#### tokens (if using tokenization)

| Field | Type | Example |
|-------|------|---------|
| _id | ObjectId | |
| wallet | string | |
| amount | int | |
| txHash | string | |
| ts | datetime | |

#### zones (static metadata)

| Field | Type | Example |
|-------|------|---------|
| zone_id | string | "zone-A" |
| area_m2 | float | |
| crop_type | string | |
| lat/lng | float | optional |
| moisture_target_low | float | 30.0 |
| moisture_target_high | float | 45.0 |

**Acceptance test:** create example docs in DB and run queries findOne by device_id and zone.

---

### 3 — IoT (ESP32) variables & functions — firmware contract

Use exact names in code / docs. Firmware author (you) owns this.

#### Device variables (in firmware)

- device_id (string) — "ESP32-DEV-01"
- backend_url (string) — "http://192.168.1.100:3000"
- send_interval_ms (int) — e.g., 5000
- soil_pin (int) — 34
- dht_pin (int) — 15
- relay_pin (int) — 26
- queue_file (string) — path in SPIFFS e.g., "/queue.json"
- valve_state (bool) — true=open
- edge_threshold_low (float) — 30.0 (moisture %)
- edge_threshold_high (float) — 45.0 (hysteresis)
- min_irrigation_seconds (int) — 5 (demo) / 300 (real)

#### Firmware functions (signatures & responsibilities)

- SensorReading readSensors()
	- returns { device_id, zone_id, ts, soil_moisture, temp_c, humidity_pct, battery_pct }
	- Acceptance: accurate JSON and no block >50ms to read.

- String makeSnapshot(SensorReading r)
	- serializes a JSON snapshot exactly matching backend schema.

- bool sendSnapshot(String json)
	- HTTP POST /api/sensor. Retries with exponential backoff. Returns success indicator.
	- Acceptance: returns 200 when backend reachable.

- void controlValve(bool open)
	- toggles relay pin; sets valve_state; logs locally.

- void queueSnapshot(snapshot)
	- append to SPIFFS queue if offline.

- void syncQueue()
	- POST queued snapshots to /api/sync when back online; marks as sent locally.

- string computeLocalHash(snapshot) (optional)
	- For debug: compute keccak256 of snapshot (use public C lib or compute later server-side).

- void runEdgeDecisionAndAct(SensorReading r)
	- runs rule-based or TFLite inference; uses hysteresis; may call controlValve() and create local event saved to queue.

#### Edge AI variables (if TFLite)

- model_arena_size (int) — bytes reserved for TFLM
- tflite_model — binary blob stored in flash
- feature_window[] — recent samples for inference
- inference_interval_ms

**Acceptance test:** Edge decision leads to controlValve(true) when moisture < edge_threshold_low, and stops when >= edge_threshold_high.

---

### 4 — Backend (Node.js) variables, functions, classes

This is the integration hub. Use these names exactly.

#### Config/env-level variables (Node process/JS)

- PORT (int)
- DB_URI (string)
- SEPOLIA_RPC (string)
- PRIVATE_KEY (string) — backend signer (vault)
- CONTRACT_ADDRESS (string)
- IPFS_API (string|null)
- DEVICE_AUTH_KEY (string)
- TX_CONFIRMATIONS (int) — 1 (for demo)
- MAX_RETRY (int)

#### Runtime variables (singletons)

- db — MongoDB client instance
- provider — ethers provider (Sepolia)
- signer — ethers Wallet(signer)
- contract — ethers.Contract instance IrrigationAudit
- io — Socket.io server instance
- pendingTxMap — Map<txHash, eventId>
- deviceQueue — in-memory small buffer mapping deviceId -> queue (useful for immediate control responses)

#### Key backend functions & class interfaces

**Class DBClient**

```js
class DBClient {
	constructor(uri) { /* connect */ }
	async saveReading(snapshot) → returns inserted id
	async saveEvent(eventDoc) → returns eventId
	async updateEventStatus(eventId, updates)
	async getLatestReadings(zone, limit)
	// Purpose: thin adapter for Mongo; centralizes queries.
}
```

**Class BlockchainClient**

```js
class BlockchainClient {
	// variables: provider, signer, contract
	async logEvent(dataHash, zone) → returns { txHash } (sends tx)
	async waitForConfirmation(txHash, confirmations) → returns receipt
	async mintWaterCredit(wallet, amount) → (if token present)
	// Purpose: single abstraction for all on-chain interactions. Handles gas, nonce, retries.
}
```

**Functions (API controllers)**

- async ingestSensor(req, res)
	- validate device_auth header, sanitize payload, db.saveReading(), io.emit('telemetry', snapshot). Respond 200.
	- Acceptance: DB record created and WS emits.

- async handleIrrigate(req, res)
	- input: { zone, actor, duration, snapshot }
	- workflow: call device control (HTTP), create eventDoc with pending, compute dataHash, optionally upload snapshot to IPFS, call blockchain.logEvent(dataHash, zone) (async), store txHash, return eventId, txHash.
	- Should not block on confirmation; update status later.

- async controlDevice(deviceId, action)
	- POST to device http://<device_ip>/control (or store command in DB for device poll).
	- Acceptance: device responds with 200 and state toggles.

- async syncDeviceQueue(req, res)
	- Replays queued snapshots sent from device; dedupe by dataHash. For each: ingest & call anchor worker.

- async anchorWorker(eventId, snapshot)
	- compute hash, call contract, update DB, emit ws events on pending/confirmed/failed.

**Utilities**

- computeDataHash(snapshot) — ethers.utils.keccak256(ethers.utils.toUtf8Bytes(JSON.stringify(snapshot)))
- uploadToIPFS(snapshot) — returns CID or null on fail
- broadcastWebsocket(eventName, payload)

**Acceptance tests:**

- POST /api/sensor produces DB record & socket broadcast.
- POST /api/irrigate returns txHash and DB event with status pending.
- anchorWorker eventually sets event status to confirmed.

---

### 5 — Python (Edge AI / ML microservice) variables & functions

You may host a small Python microservice for model training/prediction (optional). Use consistent API.

#### Env/config vars

- MODEL_PATH — path to model.tflite or pickled sklearn model.
- PRED_HOST, PRED_PORT

#### Runtime variables

- model — loaded model object (sklearn/tf-lite runtime in Python server)
- feature_window_size (int)
- scaler (object) — normalizer

#### API & functions

- POST /predict — input: { readings: [{ ts, soil_moisture, temp_c }] } → output { recommendation: "irrigate"|"skip", confidence: 0-1, predicted_time_to_irrigate: seconds }
- def preprocess(readings): → returns features (avg, slope, variance, hour_of_day, temp)
- def predict(features): → model inference
- def retrain(samples, labels): → (not for hackathon but useful later)

#### Python variables to store:

- training_data_path
- X_train, y_train

**Acceptance test:**

Given synthetic pattern, POST /predict returns expected irrigate when moisture low.

---

### 6 — Frontend (EJS / React) variables & template variables

You asked for EJS variables specifically and more. If you use EJS server-side rendering (or use React with same variable names), keep these as the keys passed from backend to template.

#### EJS template variables (server → view)

- telemetry (Array of latest readings) — [ { device_id, zone, ts, soil_moisture, temp_c, valve_state } ]
- zones (Array) — [ { zone_id, area_m2, crop_type } ]
- events (Array) — recent anchored events with { event_type, dataHash, txHash, status, actor, ts }
- walletAddress (string) — current user wallet (if available)
- contractAddress (string)
- explorerBase (string) — e.g., "https://sepolia.etherscan.io/tx/"
- frontendConfig (Object) — e.g., { wsUrl: 'ws://host:3000', apiBase: '/api' }

**EJS usage examples:**

```ejs
<% telemetry.forEach(t => { %>
	<div>
		<h4><%= t.device_id %> - <%= t.zone %></h4>
		<p>Moisture: <%= t.soil_moisture %>%</p>
	</div>
<% }) %>
```

#### React (client) state variables (component-level)

```js
const [telemetry, setTelemetry] = useState([])
const [events, setEvents] = useState([])
const [pendingTxs, setPendingTxs] = useState({}) // map txHash → status
const [wsConnected, setWsConnected] = useState(false)
const [userWallet, setUserWallet] = useState(null)
const [zones, setZones] = useState([])
```

#### Frontend functions

- connectWebsocket()
- fetchLatestReadings()
- callIrrigate(zone, duration) — POST /api/irrigate
- openMetaMask() — request accounts and set userWallet
- viewTx(txHash) — open explorer link

**Acceptance test:** WebSocket shows telemetry updates in under 1s.

---

### 7 — Blockchain variables & contract interface (Solidity + JS)

Minimal, auditable contract.

#### Solidity contract interface (IrrigationAudit)

- Event: event Log(bytes32 indexed dataHash, string zone, uint256 ts, address actor);
- Function: function log(bytes32 dataHash, string calldata zone) external;

#### Variables (in backend JS that interact with contract)

- contractAddress — env var CONTRACT_ADDRESS
- contractAbi — include event and function ABI
- dataHash — computed keccak256 hex string
- txHash — returned transaction hash
- receipt — tx receipt after confirmations
- actor — signer address (await signer.getAddress()) or user wallet if MetaMask

#### Token contract (optional) WaterCredit

- Functions: mint(address to, uint256 amount) — restricted to backend owner
- Variables: WATERCREDIT_ADDRESS env var

#### JS ethers flow (backend)

```js
const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC);
const signer = new ethers.Wallet(PRIVATE_KEY, provider);
const contract = new ethers.Contract(CONTRACT_ADDRESS, contractAbi, signer);

const tx = await contract.log(dataHash, zone); // returns tx
db.updateEvent(eventId, { txHash: tx.hash, status: 'pending' });
tx.wait(1).then(receipt => db.updateEvent(...));
```

**Security note:** never push PRIVATE_KEY to repo. Use vault.

**Acceptance test:** TX appears on Sepolia Etherscan and event shows dataHash (indexed) for quick lookups.

---

### 8 — Cross-layer canonical field mapping (single source of truth)

Use these exact field names to correlate objects across stacks.

- device_id (ESP32 JSON) ↔ devices.device_id (DB) ↔ Device.deviceId (JS class)
- zone_id (ESP32 JSON) ↔ zones.zone_id
- ts (ESP32 JSON) ↔ readings.ts ↔ events.ts
- soil_moisture ↔ readings.soil_moisture
- edge_decision ↔ local event and events.event_type
- snapshot (JSON) — the entire JSON object that will be hashed and optionally uploaded to IPFS
- dataHash (0x hex) — the keccak256 of JSON.stringify(snapshot); stored in events.dataHash and emitted in Log event
- txHash — events.txHash and frontend tx link

**Acceptance test:** For an irrigation trigger, you should find:

- one readings document with edge_decision == "irrigate"
- one events doc with dataHash computed from the same snapshot
- one on-chain event with same dataHash (searchable via Etherscan event filters)

---

### 9 — Classes & module stubs (copy-paste templates)

**Device class (firmware conceptual)**

properties: deviceId, zoneId, valveState, lastSeen
methods: readSensors(), makeSnapshot(), sendSnapshot(), queueSnapshot(), syncQueue(), runLoop()

**DBClient (Node)**

```js
class DBClient {
	constructor(mongoUri) { /* connect */ }
	async saveReading(snapshot) { /* insert into readings */ }
	async saveEvent(eventDoc) { /* insert events */ }
	async updateEventStatus(eventId, updates) { /* update */ }
	async findReadingsByZone(zone, limit) { /* query */ }
}
```

**BlockchainClient (Node)**

```js
class BlockchainClient {
	constructor(providerUrl, privateKey, contractAddress, abi) {}
	async logEvent(dataHash, zone) { /* contract.log */ }
	async waitConfirm(txHash, confs=1) {}
	async mintWaterCredit(wallet, amount) {}
}
```

**EdgeModel (Python or C++ interface)**

methods: preprocess(window), predict(features) → { recommendation, confidence }
variables: window_size, model_path

**APIController (Node express)**

ingestSensor(req, res)
irrigate(req, res)
syncQueue(req, res)
getAudit(req, res)

**WebsocketServer**

on('connection') — authenticate
emits: telemetry, tx_pending, tx_confirmed, device_status

**Acceptance test:** Unit tests for DBClient.saveReading() and BlockchainClient.logEvent() (mock provider) pass.

---

### 10 — End-to-end flows with exact function calls (sequence)

#### A. Normal sensor telemetry (happy path)

Firmware: snapshot = makeSnapshot(reading)
Firmware: sendSnapshot(snapshot) → POST /api/sensor
Backend: ingestSensor(req) → db.saveReading(snapshot) → io.emit('telemetry', snapshot)
Frontend: receives telemetry event and updates chart.

#### B. Edge-triggered irrigation + on-chain anchor

Firmware: runEdgeDecisionAndAct(reading) → sees irrigate → controlValve(true) and creates snapshot with edge_decision="irrigate" and sends to backend.
Backend: ingestSensor stores reading. Team A (backend) calls /api/irrigate with snapshot (or backend detects event and calls handleIrrigate).

handleIrrigate:

eventId = db.saveEvent({ status: 'pending', actor: 'device', snapshot })
dataHash = computeDataHash(snapshot)
optionally ipfsCid = uploadToIPFS(snapshot)
tx = await blockchain.logEvent(dataHash, zone) — store tx.hash
emit tx_pending via WS
tx.wait(1) → update DB status=confirmed and emit tx_confirmed

#### C. Manual user-signed transaction (MetaMask)

Frontend: user clicks Sign anchor on-chain (optional)
Frontend: const provider = new ethers.BrowserProvider(window.ethereum); const signer = provider.getSigner()
const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, signer)
const tx = await contract.log(dataHash, zone) — MetaMask popup; user pays Sepolia gas; tx appears on Etherscan.

**Acceptance test:** For exercise C, show MetaMask popup and successful tx on Sepolia.

---

### 11 — Logging & monitoring variables (dev-ops)

- LOG_LEVEL — info|debug|warn|error
- last_anchor_ts — timestamp of last anchored event
- pending_tx_count
- offline_device_count

Expose /health and /metrics endpoints.

---

### 12 — Quick checklist for each teammate (who does what, using names above)

**You (IoT/Edge/Blockchain):** implement firmware variables/functions + BlockchainClient and IrrigationAudit.sol; verify Sepolia deployment; test anchor flow.

**Member A (Backend/Integrator):** implement DBClient, API controllers (ingestSensor, irrigate, syncQueue), WebSocket, and anchorWorker orchestration.

**Member B (Frontend/UX):** implement React with state vars telemetry, events, connect ws, actions to call /api/irrigate, show explorer links using explorerBase + txHash.

**Member C (Ops/QA/Pitch):** prepare seeded DB documents, Etherscan screenshots, pre-funded Sepolia wallets (not using private keys in repo), and record fallback demo video.

---

### 13 — Security & operational recommendations (do this now)

- **Secrets:** Move PRIVATE_KEY to a vault; for hackathon, use .env and .gitignore.
- **Device auth:** require header x-device-token: <DEVICE_AUTH_KEY> for sensor POSTs. Validate and reject unknown devices.
- **Rate limit:** per-device throttle.
- **Data retention:** keep raw telemetry in DB + upload snapshot to IPFS only for events you anchor to chain to save gas/cost.
- **Testnet usage:** use Sepolia for live txs; prepare Hardhat local node as fallback and record screenshots of local txs for the judges.

---

### 14 — Example JSON snapshot (canonical)

Use this exact JSON shape from device → backend → IPFS → hash:

```json
{
	"device_id": "ESP32-DEV-01",
	"zone_id": "zone-A",
	"ts": "2025-09-07T12:34:56Z",
	"soil_moisture": 27.3,
	"temp_c": 29.5,
	"humidity_pct": 64.2,
	"battery_pct": 98,
	"valve_state": "closed",
	"edge_decision": "irrigate",
	"meta": { "firmware_ver": "v0.1" }
}
```

Compute dataHash = keccak256(utf8(JSON.stringify(snapshot))).

---

### 15 — Acceptance test matrix (copy to checklist)

- Device POSTs accepted: POST /api/sensor → DB reading + WS emit.
- Manual UI irrigate toggles valve via backend→device control endpoint.
- Anchor flow: POST /api/irrigate returns txHash and DB event pending; tx confirmed later.
- Offline queue: simulate network down, ensure device queues snapshots and POST /api/sync replays and anchors.
- Token mint (optional): backend can call mint() and resulting token transfer appears in wallet.
- Frontend shows Etherscan links for txHash.
- All env vars present and secret keys not in repo.

---

### 16 — Deliverables to paste to your repos (fast sprint plan)

- **embedded/**: firmware.ino with variables: device_id, backend_url, send_interval_ms, edge_threshold_low, edge_threshold_high, functions readSensors, makeSnapshot, sendSnapshot, queueSnapshot, syncQueue, runEdgeDecisionAndAct.
- **backend/**: index.js express skeleton implementing routes (use function names above), dbClient.js, blockchainClient.js.
- **contracts/**: IrrigationAudit.sol and WaterCredit.sol (minimal).
- **frontend/**: React components using telemetry, events, pendingTxs.
- **ops/**: .env.example listing env vars (without secrets), deploy_contract.sh (uses Hardhat).
