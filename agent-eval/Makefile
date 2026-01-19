.PHONY: help dev api cli frontend test lint format clean docker-up docker-down

help:
	@echo "AgentEval Development Commands"
	@echo ""
	@echo "Setup:"
	@echo "  make dev           Install all dependencies"
	@echo ""
	@echo "Development:"
	@echo "  make api           Run API server"
	@echo "  make cli           Install CLI in dev mode"
	@echo "  make frontend      Run frontend dev server"
	@echo ""
	@echo "Testing:"
	@echo "  make test          Run all tests"
	@echo "  make test-api      Run API tests"
	@echo "  make test-cli      Run CLI tests"
	@echo ""
	@echo "Code Quality:"
	@echo "  make lint          Lint all code"
	@echo "  make format        Format all code"
	@echo ""
	@echo "Docker:"
	@echo "  make docker-up     Start all services"
	@echo "  make docker-down   Stop all services"
	@echo ""
	@echo "Clean:"
	@echo "  make clean         Remove build artifacts"

# ============================================================================
# Setup
# ============================================================================

dev: dev-api dev-cli dev-frontend

dev-api:
	cd api && python -m venv .venv && . .venv/bin/activate && pip install -e ".[dev]"

dev-cli:
	cd cli && python -m venv .venv && . .venv/bin/activate && pip install -e ".[dev]"

dev-frontend:
	cd frontend && npm install

# ============================================================================
# Development
# ============================================================================

api:
	cd api && . .venv/bin/activate && uvicorn src.main:app --reload --host 0.0.0.0 --port 8000

cli:
	cd cli && pip install -e ".[dev]"

frontend:
	cd frontend && npm run dev

# ============================================================================
# Testing
# ============================================================================

test: test-api test-cli

test-api:
	cd api && . .venv/bin/activate && pytest -v

test-cli:
	cd cli && . .venv/bin/activate && pytest -v

# ============================================================================
# Code Quality
# ============================================================================

lint: lint-api lint-cli lint-frontend

lint-api:
	cd api && . .venv/bin/activate && ruff check src tests

lint-cli:
	cd cli && . .venv/bin/activate && ruff check src tests

lint-frontend:
	cd frontend && npm run lint

format: format-api format-cli format-frontend

format-api:
	cd api && . .venv/bin/activate && ruff format src tests

format-cli:
	cd cli && . .venv/bin/activate && ruff format src tests

format-frontend:
	cd frontend && npm run format

typecheck: typecheck-api typecheck-cli

typecheck-api:
	cd api && . .venv/bin/activate && mypy src

typecheck-cli:
	cd cli && . .venv/bin/activate && mypy src

# ============================================================================
# Docker
# ============================================================================

docker-up:
	docker-compose up -d

docker-down:
	docker-compose down

docker-build:
	docker-compose build

docker-logs:
	docker-compose logs -f

# ============================================================================
# Database
# ============================================================================

db-migrate:
	cd api && . .venv/bin/activate && alembic upgrade head

db-revision:
	cd api && . .venv/bin/activate && alembic revision --autogenerate -m "$(msg)"

# ============================================================================
# Clean
# ============================================================================

clean:
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name "*.egg-info" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name ".ruff_cache" -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete 2>/dev/null || true
	rm -rf api/dist api/build cli/dist cli/build
	rm -rf frontend/.next frontend/out
