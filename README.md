<p align="center">
  <br>
  <img src="https://img.shields.io/badge/python-3.11+-blue?style=for-the-badge&logo=python&logoColor=white" alt="Python">
  <img src="https://img.shields.io/badge/Next.js-14-black?style=for-the-badge&logo=next.js&logoColor=white" alt="Next.js">
  <img src="https://img.shields.io/badge/MLflow-3.7+-0194E2?style=for-the-badge&logo=mlflow&logoColor=white" alt="MLflow">
  <img src="https://img.shields.io/badge/GCP-Ready-4285F4?style=for-the-badge&logo=google-cloud&logoColor=white" alt="GCP">
</p>

```
    ╔═══════════════════════════════════════════════════════════════════════════╗
    ║                                                                           ║
    ║     ███╗   ██╗███████╗ ██████╗ ███╗   ██╗                                 ║
    ║     ████╗  ██║██╔════╝██╔═══██╗████╗  ██║                                 ║
    ║     ██╔██╗ ██║█████╗  ██║   ██║██╔██╗ ██║                                 ║
    ║     ██║╚██╗██║██╔══╝  ██║   ██║██║╚██╗██║                                 ║
    ║     ██║ ╚████║███████╗╚██████╔╝██║ ╚████║                                 ║
    ║     ╚═╝  ╚═══╝╚══════╝ ╚═════╝ ╚═╝  ╚═══╝                                 ║
    ║                                                                           ║
    ║     ⚡ Agent Quality Platform │ Built on MLflow                           ║
    ║                                                                           ║
    ╚═══════════════════════════════════════════════════════════════════════════╝
```

<p align="center">
  <strong>Evaluate, compare, and gate your AI agents with confidence.</strong>
  <br>
  <em>Custom scorers • Regression detection • CI/CD quality gates</em>
</p>

---

## What is Neon?

Neon is an **agent evaluation platform** built on top of MLflow 3.7+. It provides the missing pieces for teams building tool-using AI agents:

| Problem | Neon's Solution |
|---------|-----------------|
| Generic LLM judges don't catch agent-specific failures | **Custom scorers** for tool selection, reasoning, grounding |
| No way to detect regressions across versions | **A/B comparison** showing exactly what regressed |
| Quality checks are manual and inconsistent | **CI/CD gates** that block deploys when quality drops |
| Production failures don't inform testing | **Failure → test case pipeline** (coming soon) |

## Features

- **Agent-Specific Scorers** — Evaluate tool selection, reasoning quality, and response grounding
- **Test Suite Management** — Define expected behaviors via YAML, version control your tests
- **Regression Detection** — Compare agent versions and identify score changes
- **CI/CD Integration** — GitHub Action that gates PRs on agent quality
- **MLflow Native** — Builds on MLflow's tracing, leverages your existing investment

## Quick Start

### Installation

```bash
pip install neon-eval
```

### Define a Test Suite

```yaml
# eval-suites/core-tests.yaml
name: core-tests
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
neon run core-tests --agent myagent:run
```

### Compare Versions

```bash
neon compare latest abc123 --fail-on-regression
```

## Architecture

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│    CLI      │    │   GitHub    │    │   Web UI    │
│             │    │   Action    │    │  (Next.js)  │
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

## Project Structure

```
neon/
├── api/              # FastAPI backend
├── cli/              # CLI tool (neon)
├── frontend/         # Next.js 14 dashboard
├── action/           # GitHub Action
├── terraform/        # GCP infrastructure
├── docs/             # Documentation
│   └── research/     # Design docs & research
└── examples/         # Example agents & suites
```

## Development

### Prerequisites

- Python 3.11+
- Node.js 20+
- Docker & Docker Compose

### Local Setup

```bash
# Start services (Postgres, MLflow)
docker-compose up -d

# API development
cd api && pip install -e ".[dev]"
uvicorn src.main:app --reload

# Frontend development
cd frontend && npm install && npm run dev

# CLI development
cd cli && pip install -e ".[dev]"
```

### Running Tests

```bash
make test        # Run all tests
make lint        # Lint code
make typecheck   # Type checking
```

## CI/CD Integration

```yaml
# .github/workflows/agent-quality.yml
- name: Run Agent Evaluation
  uses: neon-eval/action@v1
  with:
    api-key: ${{ secrets.NEON_API_KEY }}
    suite: core-tests
    fail-on-regression: true
```

## Documentation

| Document | Description |
|----------|-------------|
| [Getting Started](./docs/getting-started.md) | Installation and first evaluation |
| [Scorers](./docs/scorers.md) | Built-in and custom scorers |
| [Test Suites](./docs/test-suites.md) | Defining test cases |
| [CI/CD Integration](./docs/cicd.md) | GitHub Actions setup |
| [API Reference](./docs/api-reference.md) | REST API documentation |
| [Configuration](./docs/configuration.md) | Environment and settings |
| [Research & Design](./docs/research/) | Original research and architecture docs |

## Comparison with Alternatives

| Capability | MLflow | LangSmith | Braintrust | **Neon** |
|------------|--------|-----------|------------|----------|
| Tracing | ✅ | ✅ | ⚠️ | Uses MLflow |
| Generic LLM Judges | ✅ | ✅ | ✅ | Uses MLflow |
| **Agent-specific scorers** | ❌ | ❌ | ❌ | ✅ |
| **Regression detection** | ❌ | ❌ | ⚠️ | ✅ |
| **CI/CD quality gates** | ❌ | ❌ | ⚠️ | ✅ |
| Open source foundation | ✅ | ❌ | ❌ | ✅ |

## Tech Stack

| Layer | Technology |
|-------|------------|
| Language | Python 3.11+ |
| ML Platform | MLflow 3.7+ |
| API | FastAPI |
| Frontend | Next.js 14 |
| Database | PostgreSQL 16 |
| LLM Scoring | Vertex AI (Claude, Gemini) |
| Infrastructure | GCP + Terraform |

## Roadmap

- [x] Core scorers (tool selection, reasoning, grounding)
- [x] CLI and API
- [x] GitHub Action
- [x] Web dashboard
- [ ] Failure → test case pipeline
- [ ] Custom scorer SDK
- [ ] Slack notifications
- [ ] MLflow UI plugin

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## License

MIT

---

<p align="center">
  <sub>Built with ⚡ for the future of AI agents</sub>
</p>
