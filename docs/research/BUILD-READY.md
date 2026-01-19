# AgentEval: Build Ready

> Summary of everything needed to start implementation.

**Status:** Ready to scaffold
**Last Updated:** 2026-01-18

---

## Quick Reference

### What We're Building

An agent evaluation platform built on MLflow 3.7+ that provides:
- **Custom scorers** for agent-specific evaluation (tool selection, reasoning, grounding)
- **Test suite management** via YAML + API
- **Regression detection** between agent versions
- **CI/CD integration** via GitHub Actions

### Tech Stack

| Layer | Technology |
|-------|------------|
| Language | Python 3.11+ |
| ML Platform | MLflow 3.7+ |
| API | FastAPI |
| Database | PostgreSQL 16 (Cloud SQL) |
| Frontend | Next.js 14 |
| LLM | Vertex AI SDK (Claude, Gemini) |
| Cloud | GCP |
| IaC | Terraform |

---

## Key Documentation

| Document | Purpose |
|----------|---------|
| `02-concept/architecture-spec.md` | **Complete implementation spec** — schemas, API, CLI, auth |
| `02-concept/technical-decisions.md` | All tech decisions with rationale |
| `02-concept/infrastructure.md` | GCP architecture + Terraform modules |
| `02-concept/scope.md` | MVP scope + build plan |
| `01-research/competitors/landscape.md` | Competitive positioning |

---

## Architecture Decisions (Final)

| Decision | Choice |
|----------|--------|
| Test case format | Pydantic models + YAML serialization |
| Auth model | API keys with project scoping |
| MLflow integration | Managed execution (we run agent, capture trace) |
| Scorers | Extend MLflow Scorer class |
| LLM for scoring | Vertex AI SDK (Claude 3.5 Sonnet default) |

---

## Project Structure

```
agent-eval/
├── api/                          # FastAPI backend
│   ├── Dockerfile
│   ├── pyproject.toml
│   └── src/
│       ├── main.py               # FastAPI app
│       ├── config.py             # Settings
│       ├── models/               # Pydantic + SQLAlchemy
│       │   ├── eval.py           # EvalSuite, EvalCase, EvalRun
│       │   ├── auth.py           # ApiKey, Project
│       │   └── db.py             # SQLAlchemy models
│       ├── routers/
│       │   ├── suites.py
│       │   ├── runs.py
│       │   ├── compare.py
│       │   └── auth.py
│       ├── services/
│       │   ├── eval_runner.py    # Execute evaluations
│       │   ├── comparison.py     # Regression detection
│       │   └── mlflow_client.py  # MLflow integration
│       ├── scorers/              # Custom MLflow scorers
│       │   ├── base.py
│       │   ├── tool_selection.py
│       │   ├── reasoning.py
│       │   └── grounding.py
│       ├── auth/
│       │   └── middleware.py     # API key verification
│       └── db/
│           ├── session.py
│           └── migrations/
├── cli/                          # agent-eval CLI
│   ├── pyproject.toml
│   └── src/
│       ├── main.py               # CLI entry point
│       ├── commands/
│       │   ├── run.py
│       │   ├── compare.py
│       │   ├── suite.py
│       │   └── auth.py
│       └── loader.py             # YAML loading
├── frontend/                     # Next.js 14
│   ├── Dockerfile
│   ├── package.json
│   ├── app/
│   │   ├── page.tsx              # Dashboard
│   │   ├── suites/
│   │   ├── runs/
│   │   └── compare/
│   └── components/
├── action/                       # GitHub Action
│   └── action.yml
├── terraform/
│   ├── environments/
│   │   ├── dev/
│   │   └── prod/
│   └── modules/
│       ├── cloud-run-service/
│       ├── cloud-run-job/
│       ├── cloud-sql/
│       └── mlflow/
├── docker-compose.yml            # Local development
├── Makefile
└── README.md
```

---

## Build Order

| Day | Focus | Key Files |
|-----|-------|-----------|
| **1** | Scorers + MLflow integration | `api/src/scorers/*.py` |
| **2** | Data models + Database | `api/src/models/*.py`, migrations |
| **3** | Eval runner + CLI | `api/src/services/eval_runner.py`, `cli/` |
| **4** | API endpoints + Auth | `api/src/routers/*.py`, `api/src/auth/` |
| **5** | Frontend | `frontend/app/` |
| **6** | CI/CD + Deploy | `action/`, `terraform/`, docs |

---

## GCP Bootstrap Commands

```bash
# 1. Create project
gcloud projects create agent-eval-dev --name="AgentEval Dev"
gcloud config set project agent-eval-dev

# 2. Enable APIs
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  secretmanager.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  aiplatform.googleapis.com

# 3. Create Terraform state bucket
gsutil mb -l us-central1 gs://agent-eval-terraform-state

# 4. Create Artifact Registry
gcloud artifacts repositories create agent-eval \
  --repository-format=docker \
  --location=us-central1

# 5. Initialize Terraform
cd terraform/environments/dev
terraform init
```

---

## Local Development Setup

```bash
# Clone and setup
git clone <repo>
cd agent-eval

# Start services
docker-compose up -d

# API development
cd api
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
uvicorn src.main:app --reload

# Frontend development
cd frontend
npm install
npm run dev

# CLI development
cd cli
pip install -e ".[dev]"
agent-eval --help
```

---

## Key Schemas (Quick Reference)

### EvalCase (YAML)
```yaml
name: factual_search
input:
  query: "What is the capital of France?"
expected_tools:
  - web_search
expected_output_contains:
  - "Paris"
scorers:
  - tool_selection
  - grounding
min_score: 0.8
```

### API Key Format
```
ae_live_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
│   │    └── 32 char random
│   └── environment
└── prefix
```

### Run Result (API Response)
```json
{
  "id": "run_xxx",
  "status": "completed",
  "summary": {
    "total_cases": 10,
    "passed": 8,
    "failed": 2,
    "avg_score": 0.82
  }
}
```

---

## Dependencies (pyproject.toml)

```toml
[project]
name = "agent-eval"
version = "0.1.0"
requires-python = ">=3.11"

dependencies = [
    "mlflow>=3.7.0",
    "fastapi>=0.109.0",
    "uvicorn>=0.27.0",
    "pydantic>=2.5.0",
    "sqlalchemy>=2.0.0",
    "asyncpg>=0.29.0",
    "google-cloud-aiplatform>=1.38.0",
    "vertexai>=1.38.0",
    "httpx>=0.26.0",
    "pyyaml>=6.0.1",
    "typer>=0.9.0",
    "rich>=13.7.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=7.4.0",
    "pytest-asyncio>=0.23.0",
    "ruff>=0.1.0",
    "mypy>=1.8.0",
]
```

---

## Environment Variables

```bash
# API
DATABASE_URL=postgresql+asyncpg://user:pass@localhost/agent_eval
MLFLOW_TRACKING_URI=http://localhost:5000
GOOGLE_CLOUD_PROJECT=agent-eval-dev
VERTEX_AI_LOCATION=us-central1

# CLI
AGENT_EVAL_API_KEY=ae_live_xxxxx
AGENT_EVAL_API_URL=http://localhost:8000

# Vertex AI (for LLM scoring)
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
```

---

## What's NOT Included (Post-MVP)

- User accounts / SSO (API keys only for now)
- Web-based suite editor (YAML + CLI for MVP)
- Slack notifications
- Custom scorer builder UI
- Multi-region deployment
- Detailed analytics / trends

---

## Ready to Start

1. Create new repo
2. Copy project structure
3. Run GCP bootstrap
4. Start with Day 1: Scorers + MLflow

All specs are in `02-concept/architecture-spec.md`.
