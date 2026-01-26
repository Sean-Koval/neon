# Suggested Commands

## Development Setup

```bash
# Start all services (Postgres, MLflow)
docker-compose up -d

# Install all dependencies
make dev

# Or individually:
make dev-api       # API dependencies
make dev-cli       # CLI dependencies
make dev-frontend  # Frontend dependencies
```

## Running Services

```bash
# API server (FastAPI with hot reload)
make api
# Or: cd api && uvicorn src.main:app --reload --host 0.0.0.0 --port 8000

# Frontend dev server
make frontend
# Or: cd frontend && npm run dev

# CLI (after dev install)
agent-eval --help
```

## Testing

```bash
make test          # Run all tests
make test-api      # API tests only
make test-cli      # CLI tests only

# Manual pytest
cd api && pytest -v
cd cli && pytest -v
```

## Code Quality

```bash
make lint          # Lint all (ruff + eslint)
make lint-api      # API only
make lint-cli      # CLI only
make lint-frontend # Frontend only

make format        # Format all (ruff + prettier)
make typecheck     # Type check Python (mypy)
```

## Docker

```bash
make docker-up     # Start containers
make docker-down   # Stop containers
make docker-build  # Build images
make docker-logs   # View logs
```

## Database

```bash
make db-migrate              # Run migrations
make db-revision msg="name"  # Create new migration
```

## Cleaning

```bash
make clean         # Remove build artifacts
```

## System Utilities (Linux)

```bash
git status         # Check repo state
ls -la             # List files
find . -name "*.py" -type f  # Find files
grep -r "pattern" --include="*.py"  # Search code
```
