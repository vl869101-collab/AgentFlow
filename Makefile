.PHONY: help dev up down restart build logs ps clean

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

dev: ## Start development environment (postgres + redis)
	docker compose up -d postgres redis
	@echo "Waiting for services..."
	@sleep 3
	@echo "✅ Postgres running on localhost:5432"
	@echo "✅ Redis running on localhost:6379"

up: ## Start all services (full stack)
	docker compose up -d
	@echo "✅ All services started"
	@echo "   Web: http://localhost:3000"
	@echo "   API: http://localhost:3001"
	@echo "   Postgres: localhost:5432"
	@echo "   Redis: localhost:6379"

down: ## Stop all services
	docker compose down

restart: ## Restart all services
	docker compose restart

build: ## Build all containers
	docker compose build

logs: ## Tail logs from all services
	docker compose logs -f

logs-api: ## Tail API logs
	docker compose logs -f api

logs-web: ## Tail web logs
	docker compose logs -f web

ps: ## List running containers
	docker compose ps

clean: ## Remove all containers, volumes, and images
	docker compose down -v --rmi all
	@echo "✅ Cleaned up"

migrate: ## Run database migrations inside API container
	docker compose exec api npx prisma migrate deploy

seed: ## Seed database
	docker compose exec api npx prisma db seed

shell-api: ## Shell into API container
	docker compose exec api sh

shell-web: ## Shell into web container
	docker compose exec web sh

db-shell: ## PostgreSQL shell
	docker compose exec postgres psql -U agentflow -d agentflow
