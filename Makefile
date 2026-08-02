.DEFAULT_GOAL := help
.PHONY: help install dev up down logs migrate revision test lint format typecheck check clean

API := apps/api

help: ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

install: ## Install web and api dependencies
	pnpm install
	cd $(API) && uv sync

dev: ## Run the web dev server (expects `make up` for postgres/redis/api)
	pnpm --filter web dev

up: ## Start the full stack in Docker
	docker compose up -d --build

down: ## Stop the stack
	docker compose down

logs: ## Tail stack logs
	docker compose logs -f

migrate: ## Apply database migrations
	cd $(API) && uv run alembic upgrade head

revision: ## Autogenerate a migration: make revision m="add accounts"
	cd $(API) && uv run alembic revision --autogenerate -m "$(m)"

test: ## Run all tests
	pnpm --filter web test
	cd $(API) && uv run pytest

lint: ## Lint both apps
	pnpm --filter web lint
	cd $(API) && uv run ruff check .

format: ## Format the api (web is formatted by eslint/prettier on save)
	cd $(API) && uv run ruff format .

typecheck: ## Typecheck both apps
	pnpm --filter web typecheck
	cd $(API) && uv run mypy app tests

check: lint typecheck test ## Everything CI runs

clean: ## Remove build artifacts and caches
	rm -rf apps/web/.next apps/web/node_modules node_modules
	rm -rf $(API)/.venv $(API)/.pytest_cache $(API)/.mypy_cache $(API)/.ruff_cache
