# AquaChain Monorepo

This monorepo scaffolds an Embedded IoT + Edge AI + Smart Contract stack.

Services (via docker-compose):
- backend (Node/Express placeholder)
- frontend (Vite/React dev server)
- postgres (PostgreSQL 16)
- pgadmin (GUI on http://localhost:5050)
- hardhat (local Ethereum JSON-RPC at http://localhost:8545)

Quick start:
1) Copy .env.example to .env and adjust values
2) Make sure Docker Desktop is running
3) Bring up services
   - Windows PowerShell: docker compose --env-file .env up --build
4) Visit:
   - Frontend: http://localhost:5173
   - Backend: http://localhost:3000
   - pgAdmin: http://localhost:5050 (admin@local / admin)
   - Hardhat RPC: http://localhost:8545

Acceptance criteria for M1:
- docker-compose up --build starts backend + frontend + postgres + pgadmin + hardhat
- CI workflow at .github/workflows/ci.yml exists

Notes:
- For prod, pin specific images and add healthchecks.
- For local simplicity, frontend container bootstraps Vite on first run.

# AquaChain
Smart Irrigation System in Drought Prone Regions using IoT, BlockChain, EdgeAI
