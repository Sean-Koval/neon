# Neon - Claude Code Project Configuration

## Project Overview

Neon is an agent evaluation platform built on MLflow 3.7+. It provides custom scorers, regression detection, and CI/CD quality gates for tool-using AI agents.

## Development Commands

```bash
# Development
make dev              # Install all dependencies
make api              # Run API server
make frontend         # Run frontend dev server
make test             # Run all tests
make lint             # Lint code
make typecheck        # Type checking

# Docker
make docker-up        # Start services (Postgres, MLflow)
make docker-down      # Stop services

# Database
make db-migrate       # Run migrations
```

## Project Structure

```
neon/
├── api/              # FastAPI backend (Python 3.11+)
├── cli/              # CLI tool (Typer)
├── frontend/         # Next.js 16 dashboard (React 19, Biome)
├── action/           # GitHub Action
├── terraform/        # GCP infrastructure
├── docs/research/    # Design docs & research
└── .project/         # Task management system
```

## Task Management System

This project uses a structured task management system in `.project/`.

### Worktree Commands

Use the `/wt` command or run scripts directly:

```bash
# Create worktree for a task
./scripts/worktree/wt.sh create <task-id>

# List active worktrees
./scripts/worktree/wt.sh list

# Show ready tasks
./scripts/worktree/wt.sh ready

# Complete task and create PR
./scripts/worktree/wt.sh finish <task-id>

# Remove worktree after merge
./scripts/worktree/wt.sh remove <task-id>
```

### Task Workflow

1. Check ready tasks: `./scripts/worktree/wt.sh ready`
2. Create worktree: `./scripts/worktree/wt.sh create FND-001`
3. Enter worktree: `cd ../neon-task-FND-001`
4. Work on task (files in `.project/tasks/<id>.json` define scope)
5. Complete: `./scripts/worktree/wt.sh finish FND-001`

### Task Files

- `.project/roadmap.json` - Project phases and milestones
- `.project/task-index.json` - All tasks with dependencies
- `.project/tasks/*.json` - Individual task definitions
- `.project/state.json` - Current project state

## Code Style

### Python
- Python 3.11+
- Use **uv** for package management (not pip/poetry)
- Ruff for linting/formatting
- Mypy strict mode
- Async throughout API

### TypeScript/Frontend
- TypeScript strict mode
- Next.js 16 App Router with React 19
- Biome for linting/formatting (replaces ESLint + Prettier)
- TailwindCSS

#### Frontend Commands
```bash
cd frontend
bun install         # Install dependencies
bun run lint        # Check with Biome
bun run lint:fix    # Auto-fix issues
bun run format      # Format code
bun run dev         # Start dev server (Turbopack)
bun run build       # Production build
bun run test        # Run tests
bun run typecheck   # Type checking
```

## Tool Requirements

- **Frontend**: Use `bun` instead of `npm`/`npx` for all commands
- **Python**: Use `uv` instead of `pip`/`poetry` for package management

## Research Documentation

Extensive research is in `docs/research/`:
- `02-concept/architecture-spec.md` - Complete implementation spec
- `02-concept/scope.md` - MVP scope and build plan
- `BUILD-READY.md` - Implementation summary

## Key Technical Decisions

- Build ON MLflow 3.7+, not competing with it
- API keys with project scoping for auth
- Managed agent execution with trace capture
- Vertex AI SDK for LLM judge scoring
