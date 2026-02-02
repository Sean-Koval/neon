# LangGraph Agent with Neon Tracing

A complete example demonstrating how to run a LangGraph agent with tool calls and trace everything to Neon for observability.

## Prerequisites

- Python 3.11+
- Docker & Docker Compose
- An OpenAI API key (or Anthropic)

## Quick Start

### 1. Start Neon Infrastructure

From the **repository root**:

```bash
# Start ClickHouse and Postgres (required)
docker compose -f docker-compose.dev.yml up -d

# Verify services are running
docker compose -f docker-compose.dev.yml ps
```

You should see:
- `neon-dev-clickhouse` - Trace storage (port 8123)
- `neon-dev-postgres` - Metadata storage (port 5432)

### 2. Start the Neon Frontend

```bash
# From repository root
cd frontend
bun install
bun dev
```

The dashboard will be available at **http://localhost:3000**

### 3. Set Up the Python Agent

```bash
# From this directory (examples/langgraph-agent)
cd examples/langgraph-agent

# Create virtual environment
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install dependencies
pip install -e .

# Point to the service account (credentials.json is in repo root)
export GOOGLE_APPLICATION_CREDENTIALS="../../credentials.json"
```

### 4. Run the Agent

```bash
# Run with a query
python run_agent.py "What is 25 * 4 + 10?"

# Run with weather query (uses mock weather tool)
python run_agent.py "What's the weather in San Francisco?"

# Run with web search (uses mock search tool)
python run_agent.py "Search for the latest news about AI"

# Run multiple queries to generate more traces
python run_agent.py "Calculate the area of a circle with radius 5"
python run_agent.py "What's the weather in New York and Los Angeles?"
```

### 5. View Traces in Neon

1. Open **http://localhost:3000** in your browser
2. Navigate to the **Traces** page
3. Click on any trace to see the full span tree:
   - LLM generation spans (model calls)
   - Tool execution spans
   - Input/output for each step

## Project Structure

```
langgraph-agent/
├── README.md           # This file
├── pyproject.toml      # Python dependencies
├── agent.py            # LangGraph agent with tools
├── neon_tracer.py      # Tracer that sends spans to Neon
└── run_agent.py        # CLI to run the agent
```

## How It Works

### The Agent (`agent.py`)

A simple ReAct-style agent built with LangGraph:

- **Tools**: Calculator, Weather lookup, Web search (mocked)
- **LLM**: OpenAI GPT-4o-mini (or Claude)
- **Pattern**: Tool-calling loop until final answer

### The Tracer (`neon_tracer.py`)

A lightweight tracer that:

1. Wraps the agent execution in a trace
2. Captures each LLM call as a "generation" span
3. Captures each tool call as a "tool" span
4. Sends spans to Neon via `POST /api/v1/traces` (OTLP format)

### Trace Structure

```
trace: "agent-run"
├── span: "llm-call" (generation)
│   ├── model: "gpt-4o-mini"
│   ├── input_tokens: 150
│   └── output_tokens: 45
├── span: "tool-call" (tool)
│   ├── tool_name: "calculator"
│   ├── tool_input: {"expression": "25 * 4 + 10"}
│   └── tool_output: "110"
└── span: "llm-call" (generation)
    └── (final response)
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to service account JSON | `../../credentials.json` |
| `GOOGLE_CLOUD_PROJECT` | GCP project ID | `sk-ml-inference` |
| `GOOGLE_CLOUD_LOCATION` | GCP region | `global` |
| `OPENAI_API_KEY` | OpenAI API key | Required for OpenAI models |
| `ANTHROPIC_API_KEY` | Anthropic API key | Required for direct Claude |
| `NEON_API_URL` | Neon API endpoint | `http://localhost:3000` |
| `NEON_PROJECT_ID` | Project ID for traces | `00000000-0000-0000-0000-000000000001` |

### Using Different Providers

**Vertex AI Gemini (default):**
```bash
# Point to credentials.json in repo root
export GOOGLE_APPLICATION_CREDENTIALS="../../credentials.json"
# Project and location default to sk-ml-inference / global

python run_agent.py "Your query"  # Uses gemini-3-flash-preview by default
python run_agent.py --model gemini-2.0-flash "Your query"
```

**Vertex AI Claude (via Google):**
```bash
export GOOGLE_APPLICATION_CREDENTIALS="../../credentials.json"

python run_agent.py --model "claude-sonnet-4-5@20250514" "Your query"
python run_agent.py --model "claude-opus-4-5@20250514" "Your query"
```

**Anthropic Claude (direct):**
```bash
export ANTHROPIC_API_KEY="sk-ant-..."
python run_agent.py --model claude-sonnet-4-5-20250514 "Your query"
```

**OpenAI:**
```bash
export OPENAI_API_KEY="sk-..."
python run_agent.py --model gpt-4o-mini "Your query"
python run_agent.py --model gpt-4o "Your query"
```

### Vertex AI Setup (Already Configured)

The `credentials.json` in the repo root is for project `sk-ml-inference` with `location=global`, which gives access to:

| Model | Description |
|-------|-------------|
| `gemini-3-flash-preview` | Latest Gemini, fast (default) |
| `gemini-2.0-flash` | Stable Gemini 2.0 |
| `claude-sonnet-4-5@20250514` | Claude Sonnet 4.5 via Vertex |
| `claude-opus-4-5@20250514` | Claude Opus 4.5 via Vertex |

## Troubleshooting

### "Connection refused" to ClickHouse

Make sure Docker services are running:
```bash
docker compose -f docker-compose.dev.yml ps
docker compose -f docker-compose.dev.yml logs clickhouse
```

### "No traces appearing in dashboard"

1. Check the frontend console for errors
2. Verify ClickHouse has data:
   ```bash
   docker exec neon-dev-clickhouse clickhouse-client \
     --query "SELECT count() FROM neon.traces"
   ```
3. Check the agent output for trace IDs

### "Module not found" errors

Make sure you installed the package:
```bash
pip install -e .
```

## Next Steps

- Modify `agent.py` to add your own tools
- Create evaluation suites to test agent behavior (see `examples/suites/`)
- Set up CI/CD with the Neon SDK for regression detection
