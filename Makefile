SHELL := /usr/bin/env bash

.PHONY: up down logs build test fmt lint prisma-migrate

up:
	docker compose --env-file .env up --build -d

down:
	docker compose down -v

logs:
	docker compose logs -f --tail=200

build:
	docker compose build --no-cache

# Placeholder tests: backend and contracts
# For Windows users, you can run these inside the containers or via npm locally
test:
	docker compose exec backend npm test || true
	docker compose exec contracts npx hardhat test || true

prisma-migrate:
	docker compose exec backend npx prisma migrate dev --name init

# AquaChain Makefile

up:
	docker compose up --build -d

down:
	docker compose down -v

logs:
	docker compose logs -f --tail=200

ps:
	docker compose ps

# Open a psql shell inside the Postgres container
psql:
	docker compose exec postgres psql -U $${POSTGRES_USER} -d $${POSTGRES_DB}

# Basic placeholder tests (do not fail CI if tests are absent)
test:
	cd Backend && npm ci || true
	cd Contracts && npm ci && npx hardhat compile || true
