# Neon Project Overview

## Purpose
Neon is an **agent evaluation platform** built on MLflow 3.7+. It provides custom scorers, regression detection, and CI/CD quality gates for tool-using AI agents.

## Key Features
- **Agent-Specific Scorers** — tool_selection, reasoning, grounding
- **Test Suite Management** — YAML-defined test cases
- **Regression Detection** — A/B comparison between agent versions
- **CI/CD Integration** — GitHub Action for quality gates

## Tech Stack

| Layer | Technology |
|-------|------------|
| Language | Python 3.11+ |
| ML Platform | MLflow 3.7+ |
| API | FastAPI (async) |
| Database | PostgreSQL 16 + SQLAlchemy 2.0 (async) |
| Frontend | Next.js 14, React 18, TailwindCSS |
| CLI | Typer + Rich |
| LLM Scoring | Vertex AI SDK (Claude, Gemini) |
| Infrastructure | GCP + Terraform |

## Project Structure

```
neon/
├── api/              # FastAPI backend (Python)
│   └── src/
│       ├── models/   # Pydantic + SQLAlchemy models
│       ├── routers/  # API endpoints
│       ├── services/ # Business logic
│       ├── scorers/  # Custom MLflow scorers
│       └── auth/     # API key middleware
├── cli/              # CLI tool (Python/Typer)
│   └── src/commands/ # CLI commands
├── frontend/         # Next.js 14 dashboard
│   └── app/          # App router pages
├── action/           # GitHub Action
├── terraform/        # GCP infrastructure
└── docs/research/    # Design docs & research
```

## Current Status
- Status: `CONCEPT` → scaffolding complete
- Extensive research collected in `docs/research/`
- Basic code structure scaffolded
- Ready for implementation
