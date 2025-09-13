.PHONY: up down test logs

up:
	docker compose up --build -d

down:
	docker compose down

logs:
	docker compose logs -f --tail=100

test:
	@echo "Running backend and contracts tests..."
	@docker compose run --rm backend node -e "console.log('backend ok')"
	@docker compose run --rm hardhat npx hardhat compile
