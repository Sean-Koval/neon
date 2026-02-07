# Neon - Claude Code Project Configuration

## Project Overview

Neon is an **agent evaluation platform** with durable execution for AI agents. It provides:
- **Evals-as-code** SDKs for defining test suites and scorers (TypeScript & Python)
- **Durable execution** via Temporal workflows
- **Observability** via ClickHouse trace storage
- **Real-time dashboard** with regression detection

## Development Commands

### Primary Commands (Turbo monorepo)
```bash
bun install           # Install all workspace dependencies
bun run dev           # Start all services (frontend + workers)
bun run build         # Build all packages
bun run test          # Run all tests
bun run lint          # Lint all code
bun run typecheck     # Type check all packages
```

### Workspace-specific
```bash
bun run frontend      # Run only frontend dev server
bun run workers       # Run only Temporal workers
cd packages/sdk && bun test  # Test SDK only
```

### Docker (infrastructure)
```bash
docker compose up -d  # Start ClickHouse, Temporal, Postgres
docker compose down   # Stop services
```

### CLI (Python)
```bash
cd cli && uv sync     # Install CLI dependencies
uv run agent-eval --help  # Run CLI
```

### Python SDK
```bash
cd packages/neon-sdk-python
uv sync                    # Install dependencies
uv run pytest              # Run tests
uv run ruff check neon_sdk # Lint
uv run mypy neon_sdk       # Type check
```

## Project Structure

```
neon/
├── frontend/           # Next.js 16 dashboard (React 19, Biome, tRPC)
├── packages/
│   ├── sdk/            # @neon/sdk - TypeScript SDK for evals
│   ├── neon-sdk-python/ # neon-sdk - Python SDK for evals
│   ├── shared/         # @neon/shared - Shared types
│   └── temporal-client/ # @neon/temporal-client - Temporal wrapper
├── temporal-workers/   # Durable execution workers (@neon/temporal-workers)
├── cli/                # Python CLI (Typer, uv)
├── examples/           # Example agents and eval suites
├── docs/research/      # Design docs & architecture specs
├── scripts/            # Utility scripts (worktree, etc.)
├── archive/            # Archived code (old FastAPI backend)
├── terraform/          # GCP infrastructure
└── .project/           # Task management system
```

## Monorepo Architecture

This is a **Turbo monorepo** with Bun as the package manager.

### Workspaces
| Package | Path | Description |
|---------|------|-------------|
| `agent-eval-frontend` | `frontend/` | Next.js dashboard with tRPC API |
| `@neon/sdk` | `packages/sdk/` | TypeScript SDK for evals-as-code |
| `neon-sdk` (Python) | `packages/neon-sdk-python/` | Python SDK for evals-as-code |
| `@neon/shared` | `packages/shared/` | Shared types across packages |
| `@neon/temporal-client` | `packages/temporal-client/` | Temporal client wrapper |
| `@neon/temporal-workers` | `temporal-workers/` | Durable execution workers |

### Requirements
- Node.js >= 20.0.0
- Bun 1.2.0 (package manager)
- Python 3.11+ (for CLI and Python SDK)

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

## Local Dev Verification

**Always verify your frontend/API changes actually work.** Don't just write code and assume it renders correctly. Use the app like a real user — click buttons, fill forms, submit data — and verify the results through screenshots.

### Dev Loop: Edit → Use the App → Fix → Repeat

```
1. Make your code changes
2. Run /api-check                        # ~5s  - are API endpoints healthy?
3. Run /ui-explore /page-you-changed     # ~2m  - click, fill, submit, verify
4. Fix any bugs found, go to step 2
```

Or run the full orchestrator:
```
/dev-check                               # API check + interactive exploration
```

### Verification Skills

| Skill | What it does |
|-------|-------------|
| `/api-check` | Curls every API endpoint, reports status codes. **Run first, always.** ~5s |
| `/ui-explore` | **The primary tool.** Navigates pages, clicks buttons, fills forms, opens modals, submits data, screenshots every step. Uses Playwright + multimodal vision in a see-act loop. ~2-5min |
| `/dev-check` | Orchestrator: runs `/api-check` then `/ui-explore`. Use for thorough pre-commit verification. |
| `/nav-check` | Lightweight: visits every page passively, captures console/network errors. No interaction. ~15s |
| `/visual-check` | Lightweight: screenshots every page passively, checks for visual issues. No interaction. ~40s |

### How `/ui-explore` Works

Claude operates as a QA tester using an iterative see-act loop:

```
Screenshot page → View with Read (multimodal) → Identify interactive elements
→ Write Playwright script to click/fill/submit → Screenshot result → Evaluate
→ Continue exploring...
```

Each step produces a screenshot that Claude views to decide the next action. This catches bugs that passive page visits miss: broken form submissions, modals that don't open, buttons that error, dropdowns that don't filter.

### Prerequisites

Dev server must be running. Playwright must be installed:
```bash
bun add -d playwright @playwright/test && bunx playwright install chromium
bun run dev   # or bun run frontend
```

### When to Verify

- **After any API/route change**: `/api-check` (5 seconds, no excuses)
- **After any UI change**: `/ui-explore /the-page` (click through the changes)
- **Before committing**: `/dev-check` (full verification)
- **Quick passive scan**: `/nav-check` (just checks pages load, no interaction)

## Code Style

### Python
- Python 3.11+
- Use **uv** for package management (not pip/poetry)
- Ruff for linting/formatting
- Mypy strict mode

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

- **Package Manager**: Use `bun` (not npm/npx) for all JS/TS commands
- **Python**: Use `uv` (not pip/poetry) for CLI dependencies
- **Monorepo**: Run commands from root using `bun run <script>`

## Research Documentation

Extensive research is in `docs/research/`:
- `02-concept/architecture-spec.md` - Complete implementation spec
- `02-concept/scope.md` - MVP scope and build plan
- `BUILD-READY.md` - Implementation summary

## Key Technical Decisions

- **Temporal** for durable workflow execution (not bare async)
- **ClickHouse** for trace storage and analytics queries
- **TypeScript & Python SDKs** for evals-as-code (not YAML/config files)
- **Next.js API routes + tRPC** for backend (no separate FastAPI)
- **Turbo** for monorepo orchestration with caching
- **Bun** as package manager for speed (TypeScript)
- **uv** as package manager for speed (Python)
