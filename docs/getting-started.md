# Getting Started with AgentEval

This guide will help you set up AgentEval and run your first evaluation.

## Prerequisites

- Python 3.11+
- A tool-using AI agent to test
- (Optional) MLflow tracking server

## Installation

### CLI Installation

```bash
pip install agent-eval
```

### Verify Installation

```bash
agent-eval --help
```

## Quick Start

### 1. Initialize Your Project

```bash
cd your-agent-project
agent-eval init
```

This creates an `eval-suites/` directory with an example test suite.

### 2. Configure Authentication

Get an API key from the AgentEval dashboard (or set up your own server), then:

```bash
# Option 1: Environment variable
export AGENT_EVAL_API_KEY=ae_live_xxxxx

# Option 2: Use the CLI
agent-eval auth login
```

### 3. Create Your First Test Suite

Edit `eval-suites/example.yaml`:

```yaml
name: my-first-suite
description: Testing my research agent
agent_id: research-agent

default_scorers:
  - tool_selection
  - reasoning
  - grounding

cases:
  - name: basic_search
    description: Should use search for factual questions
    input:
      query: "What is the capital of France?"
    expected_tools:
      - web_search
    expected_output_contains:
      - "Paris"
    min_score: 0.8
```

### 4. Run Your Evaluation

```bash
agent-eval run start my-first-suite --agent myagent:run
```

### 5. View Results

```bash
agent-eval run show <run-id>
```

Or visit the web dashboard at `http://localhost:3000`.

## Next Steps

- [Configure your scorers](./scorers)
- [Define comprehensive test suites](./test-suites)
- [Set up CI/CD integration](./cicd)
- [Self-host Neon](./self-hosting)

## Self-Hosted vs Cloud

AgentEval can run:

1. **Self-hosted**: Run the entire stack on your infrastructure
2. **Cloud**: Use our managed service (coming soon)

For self-hosted setup, see [Self-Hosting Guide](./self-hosting).
