
# AquaChain Non-Technical Blueprint & Demo Guide

---

## 1 — Secrets and settings (what we must keep safe and why)

There are a handful of things we don’t share in public and keep in a secure place:

- The address for the blockchain service we’ll use — like the postal address for the on-chain network.
- The private key that signs on-chain actions — this is the team’s “authority” and must never be posted anywhere.
- The address of the deployed contract (the on-chain record keeper).
- Any API keys (for cloud or message services) and phone/SMS keys.

**Why:** these allow us to write trusted records on the chain and send notifications. If leaked, anyone could impersonate us. Keep them locked away and only the backend operator should have access.

## 2 — The database: what we store and why

We keep five simple collections of information — think of them as labeled filing drawers:

- **Devices drawer** — who each device is, where it belongs, and its last-known status. Useful to know which device is which zone and when it last checked in.
- **Readings drawer** — a time-ordered list of every sensor reading (moisture, temperature, battery, valve status). This is the raw history.
- **Events drawer** — important actions like “irrigation started” or “manual override”, plus whether we anchored that action to the blockchain.
- **Tokens drawer** — if we issue reward tokens, this stores who got how many and the proof of transfer.
- **Zones drawer** — static details about each field zone (area, crop type, target moisture levels).

**Why:** this separation keeps things tidy — sensors feed the readings drawer, important actions become events, and zones give context for calculations.

## 3 — The device (ESP32) — what it does and its responsibilities

The device is the field worker. It has a few clear jobs:

- **Sense:** read soil moisture, temperature and any other sensor.
- **Decide:** run a simple rule (or a tiny model) to decide if irrigation is needed now.
- **Act:** turn the valve or pump on and off.
- **Report:** send a snapshot of what it sensed and what decision it made to the server.
- **Queue:** if the network is down, save those snapshots locally and send them later.
- **Poll control:** periodically check if the server sent any remote command.

**Why:** this lets the device be independent — it can act even if the cloud is unreachable, and later the server verifies and records what happened.

## 4 — The backend (what it is responsible for)

The backend is the project’s brain and connector. Its jobs:

- Accept sensor data from devices and save it in the readings drawer.
- Broadcast live updates to the dashboard so teammates and judges see live telemetry.
- Trigger device control when a manual or automated irrigation command is needed.
- Prepare proof: create a compact fingerprint of the snapshot (so we can prove later the device’s claim) and schedule a write to the blockchain.
- Talk to the chain: using the team’s secure authority, submit the proof so the action becomes publicly verifiable.
- Track transactions: store the on-chain transaction id and update the status when it’s confirmed.
- Accept replay: when devices upload queued snapshots after reconnect, ingest them and anchor as needed.

**Why:** the backend glues sensors, dashboard, and blockchain into a single trustworthy workflow.

## 5 — The small AI service (what it gives us)

This is optional but useful:

- It takes a short history of sensor values and returns a recommendation: “water now” or “skip”.
- It is used either by the device (tiny model) or by the backend (service) to make smarter decisions than simple thresholds.
- It also produces a confidence level and a timing suggestion.

**Why:** it improves irrigation efficiency and gives data to justify water saving claims.

## 6 — The dashboard (what teammates and judges see)

The dashboard is the presentation layer — what people look at during the demo:

- A live feed of sensor values for each zone.
- Controls to manually start/stop irrigation.
- A feed of anchored events with links to the public proof on the blockchain.
- A token balance view (if using tokenization) and simple impact metrics like liters saved and latency.

**Why:** judges want to see live data, the act of watering, and the immutable proof — the dashboard shows all three in one place.

## 7 — The on-chain contract (what it does and why)

The contract on the blockchain is our public log book:

- It accepts a compact fingerprint of a device snapshot and the zone name, and it emits a public event with a timestamp.
- Optionally, the contract can issue reward tokens when certain criteria are met.
- Only the team’s authority can call the mint function that issues tokens.

**Why:** once an event is written here, it can’t be changed. Judges can verify that an irrigation actually happened and when.

## 8 — How pieces match up across layers (how we keep consistency)

We use the same plain labels at every step so things line up:

- Device identity ties the sensor reading to the right place.
- Zone name ties readings to the right field.
- The snapshot sent from the device is the single source we use to create the public proof.
- The on-chain proof contains a compact fingerprint of that snapshot so anyone can match the chain record to the original device reading.

**Why:** this ensures a reading, the database record, and the on-chain proof are all references to the same real-world event.

## 9 — The main components everyone will implement (who does what)

We break the system into clear components:

- **Device component (firmware):** sensing, decision, actuation, local queueing.
- **Backend component:** ingesting sensor data, orchestrating control, preparing and submitting proofs, storing transaction status.
- **Blockchain client:** the piece that submits proofs to the public ledger and listens for confirmations.
- **AI predictor:** the service that gives recommendations from small historical windows.
- **Dashboard:** live telemetry, manual controls, and links to public proof.
- **Sync worker:** replays queued device snapshots after reconnect and anchors them.

**Why:** this separation minimizes overlap and makes parallel work easy.

## 10 — Three core end-to-end stories (how a real action flows)

### A. Normal telemetry

Device senses and sends a snapshot to the server.
Server saves it and pushes it to the dashboard.
Team sees live values immediately.

### B. Edge-triggered irrigation with proof

Device decides to water and starts the valve.
Device sends a snapshot that includes the decision.
Server records it and prepares a proof.
Server writes the proof to the public ledger.
Dashboard shows the event and a link to the public proof.

### C. Offline action and later sync

Device acts while the network is down and stores snapshots locally.
When the network returns, the device uploads the saved snapshots.
Server ingests them, anchors them to the ledger, and updates the dashboard.

**Why:** These stories are what we demo — live action, a recorded proof, and resilience.

## 11 — How we keep everything healthy and visible

We track a few simple health signals:

- When was the last device check-in.
- How many transactions are pending on the public ledger.
- How many devices have unsent snapshots queued.
- Basic logs for errors like failed transmissions.

**Why:** we want quick indicators during the demo so we can explain any delay and show we know how to recover.

## 12 — Who does what during the hackathon (short checklist)

- **You (Device + Chain lead):** build device firmware, edge decision, and the code that writes proofs on the ledger.
- **Backend Integrator:** accept device data, broadcast to the dashboard, orchestrate anchors, and handle queued uploads.
- **Frontend Designer:** build the dashboard, show live data, show links to proofs and demo controls.
- **Ops & Pitch:** prepare on-chain account funding, record backup videos, prepare slides, and run dress rehearsals.

**Why:** clear ownership avoids confusion under time pressure.

## 13 — Simple security and practical rules to follow

- Never share the private key or ledger signing key in public.
- Devices authenticate to the server with a shared device token.
- If the ledger is slow, don’t block the valve action — show the pending state and then the confirmed proof.
- Use a local test node as a backup if public ledger access fails; keep a screenshot of the backup in the slides.

**Why:** these steps keep the demo trustworthy and avoid last-minute failures.

## 14 — What a single device snapshot looks like (in plain terms)

A snapshot is simply a short report that includes:

- which device sent it,
- which zone the device is in,
- when it was taken,
- moisture level, temperature, battery state, valve state, and the device’s own decision (water or skip).

**Why:** this single report is what we store, what we use to prove things on chain, and what the dashboard shows.

## 15 — Demo acceptance checklist (what must work)

Before you show judges, verify:

- Devices can send live readings and the dashboard shows them.
- Manual control triggers the valve and the change shows on the dashboard.
- An irrigation event results in a public proof on the ledger and the dashboard shows the proof link.
- If a device acts while offline, it successfully uploads the saved reports after reconnect and the server anchors them.
- Backup video exists showing the full flow in case of network problems.

**Why:** meeting these points gives you a reliable, repeatable six-minute demo.

## 16 — Concrete deliverables to prepare before the hackathon

Get these ready and checked into your shared folder:

- The device firmware file and a short readme for flashing.
- The backend server with simple start instructions and a list of secret settings stored securely.
- The deployed contract address and the account used to fund it (kept private).
- The dashboard app and a short guide to run it locally.
- A two-minute recorded demo and the five-slide pitch deck.

**Why:** having these ready means fast setup and a stress-free demo.
