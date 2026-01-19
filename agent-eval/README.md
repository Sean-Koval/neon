# AgentEval

An agent evaluation platform built on MLflow 3.7+ that provides agent-specific scorers, regression detection, and CI/CD quality gates for tool-using agents.

## Features

- **Custom Scorers** - Agent-specific evaluation for tool selection, reasoning, and grounding
- **Test Suite Management** - Define expected behaviors via YAML, run regression tests
- **Version Comparison** - A/B diff between agent versions showing what regressed
- **CI/CD Gates** - GitHub Action that blocks PRs if agent quality drops
- **MLflow Integration** - Builds on MLflow, leverages existing tracing infrastructure

## Quick Start

### Installation

```bash
pip install agent-eval
```

### Configure

```bash
export AGENT_EVAL_API_KEY=ae_live_xxxxx
export AGENT_EVAL_API_URL=https://api.agent-eval.example.com
```

### Define a Test Suite

```yaml
# eval-suites/core-tests.yaml
name: core-tests
description: Core functionality tests
agent_id: research-agent

default_scorers:
  - tool_selection
  - reasoning
  - grounding

cases:
  - name: factual_search
    input:
      query: "What is the capital of France?"
    expected_tools:
      - web_search
    expected_output_contains:
      - "Paris"
    min_score: 0.8
```

### Run Evaluation

```bash
agent-eval run core-tests --agent myagent:run
```

### Compare Versions

```bash
agent-eval compare run_main run_abc123 --fail-on-regression
```

## Project Structure

```
agent-eval/
├── api/              # FastAPI backend
├── cli/              # CLI tool
├── frontend/         # Next.js dashboard
├── action/           # GitHub Action
├── terraform/        # Infrastructure as code
├── docs/             # Documentation
└── examples/         # Example agents and suites
```

## Development

### Prerequisites

- Python 3.11+
- Node.js 20+
- Docker & Docker Compose
- GCP account (for deployment)

### Local Setup

```bash
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

### Running Tests

```bash
# API tests
cd api && pytest

# CLI tests
cd cli && pytest

# Frontend tests
cd frontend && npm test
```

## Architecture

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   CLI       │    │  GitHub     │    │  Web UI     │
│             │    │  Action     │    │  (Next.js)  │
└──────┬──────┘    └──────┬──────┘    └──────┬──────┘
       │                  │                  │
       └──────────────────┼──────────────────┘
                          │
                   ┌──────▼──────┐
                   │   FastAPI   │
                   │     API     │
                   └──────┬──────┘
                          │
           ┌──────────────┼──────────────┐
           │              │              │
    ┌──────▼──────┐ ┌─────▼─────┐ ┌──────▼──────┐
    │  PostgreSQL │ │  MLflow   │ │  Vertex AI  │
    │  (metadata) │ │  (traces) │ │  (scoring)  │
    └─────────────┘ └───────────┘ └─────────────┘
```

## Documentation

- [Getting Started](./docs/getting-started.md)
- [Configuration](./docs/configuration.md)
- [Writing Scorers](./docs/scorers.md)
- [Test Suites](./docs/test-suites.md)
- [CI/CD Integration](./docs/cicd.md)
- [API Reference](./docs/api-reference.md)

## License

MIT
