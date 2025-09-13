# AquaChain
Smart Irrigation System in Drought Prone Regions using IoT, BlockChain, EdgeAI

## Milestone 1 — Project Bootstrap & Repo Initialization

This repo is scaffolded as a monorepo with Backend, Frontend, Contracts, Embedded, Models, Docs, Ops.

- Docker Compose runs: backend (Express + EJS + Socket.io), frontend (EJS views), mongo, and a Hardhat node.
- CI workflow compiles contracts and runs a backend smoke check.
- Makefile includes up/down/logs/test targets.

### Quick start

1) Copy .env.example to .env and adjust values as needed.

2) Build and start services:

- Windows (PowerShell):
  make up

Then open:
- Frontend: http://localhost:3000/login
- Backend health: http://localhost:5000/health
- Hardhat JSON-RPC: http://localhost:8545

3) Tail logs:
  make logs

4) Stop services:
  make down

### Troubleshooting
- If Hardhat image fails in Compose, run a local node instead inside Contracts:
  npx hardhat node
  Update any RPC URLs accordingly.

- If ports are taken, change PORT in .env and matching port mappings in docker-compose.yml.

### Next milestones
- M2: ESP32 firmware baseline with queueing
- M3: Backend ingest endpoints + Socket.io broadcasting
- M4: Data collection + feature pipeline
- M5: Train TinyML + quantize TFLite
- M6: Embed TFLM model into firmware
- M7: Contracts + Sepolia deploy
- M8: Ethers.js anchor worker + indexer
- M9: Frontend dashboard (React/Vite optional) + MetaMask
- M10: E2E runbook, fallback, and demo
