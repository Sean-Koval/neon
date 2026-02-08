# Agent Trace Demo: End-to-End Setup Guide

Complete guide for running a LangChain agent that streams traces to the Neon dashboard with full observability, metrics, and alerts.

## Architecture Overview

```
                         Your Agent (LangChain/LangGraph)
                                    |
                            HTTP POST (OTLP JSON)
                                    |
                                    v
                    +---------------------------+
                    |   OTel Collector (:4318)   |
                    +---------------------------+
                     /          |           \
                    v           v            v
            +---------+  +-----------+  +----------+
            | Redpanda |  | Neon API  |  |ClickHouse|
            | (Kafka)  |  | (:3000)   |  | (backup) |
            +---------+  +-----------+  +----------+
                               |
                               v
                      +----------------+
                      |  ClickHouse    |
                      |  neon.traces   |
                      |  neon.spans    |
                      +----------------+
                               |
                               v
                      +------------------+
                      | Neon Dashboard   |
                      | localhost:3000   |
                      +------------------+
                      | /traces          |
                      | /analytics       |
                      | /alerts          |
                      | /agents          |
                      +------------------+
```

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Docker | 24+ | Container runtime |
| Docker Compose | v2+ | Service orchestration |
| Python | 3.11+ | Agent runtime |
| Bun | 1.2+ | Frontend dev server (local mode only) |
| An LLM API key | - | `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` |

---

## Quick Start (One Command)

```bash
# Set your API key
export OPENAI_API_KEY="sk-..."

# Run the demo
./demo/demo.sh
```

This starts all infrastructure, the dashboard, and runs 6 demo queries with traces.
Open http://localhost:3000/traces to see the results.

---

## Environment A: Full Docker (Recommended for First Run)

Everything runs in Docker including the Neon frontend. Best for testing the
full pipeline without installing Node.js/Bun.

### Step 1: Configure Environment

```bash
# Copy env template
cp .env.example .env

# Add your LLM API key to .env
# At minimum, set ONE of these:
#   OPENAI_API_KEY=sk-...
#   ANTHROPIC_API_KEY=sk-ant-...
```

### Step 2: Start Infrastructure + Frontend

```bash
# Start all services with dev auth bypass enabled
docker compose -f docker-compose.yml -f demo/docker-compose.demo.yml up -d
```

This starts 8 services:

| Service | Container | Port | Health Check |
|---------|-----------|------|--------------|
| ClickHouse | neon-clickhouse | 8123, 9000 | `curl localhost:8123/ping` |
| PostgreSQL | neon-postgres | 5432 | `pg_isready -U neon` |
| Temporal | neon-temporal | 7233 | Temporal health endpoint |
| Temporal UI | neon-temporal-ui | 8080 | Web UI |
| OTel Collector | neon-otel-collector | 4317, 4318, 13133 | `curl localhost:13133` |
| Redpanda | neon-redpanda | 9092 | `rpk cluster health` |
| Web Frontend | neon-web | 3000 | `curl localhost:3000` |
| Temporal Worker | neon-temporal-worker | - | Internal |

### Step 3: Verify Services

```bash
# Check all containers are running
docker compose ps

# Verify ClickHouse is ready
curl -s localhost:8123/ping
# Expected: Ok.

# Verify OTel Collector is healthy
curl -s localhost:13133
# Expected: {"status":"Server available"...}

# Verify Frontend is up
curl -s -o /dev/null -w "%{http_code}" localhost:3000
# Expected: 200

# Verify trace endpoint accepts requests
curl -s -X POST localhost:3000/api/v1/traces \
  -H "Content-Type: application/json" \
  -d '{"resourceSpans":[]}'
# Expected: {"message":"Processed...","traces":0,"spans":0}
```

### Step 4: Run the Demo Agent

```bash
cd examples/langgraph-agent

# Create Python environment
python3 -m venv .venv
source .venv/bin/activate
pip install -e "."

# Set trace destination
export NEON_API_URL="http://localhost:3000"
export NEON_PROJECT_ID="00000000-0000-0000-0000-000000000001"

# Run demo queries (6 queries with 2s delay between each)
python run_demo.py --model gpt-4o-mini --count 6

# Or run a single query
python run_agent.py "What is 42 * 17 + 256?"

# Or run interactively
python run_agent.py --interactive
```

### Step 5: View Traces in Dashboard

Open http://localhost:3000 in your browser:

| Page | URL | What You See |
|------|-----|-------------|
| Traces List | /traces | All agent traces with duration, status, span counts |
| Trace Detail | /traces/{id} | Span tree with timeline, decision tree, multi-agent views |
| Analytics | /analytics | Charts: trace volume, latency percentiles, model usage |
| Alerts | /alerts | Threshold-based alerts on latency, error rate, token usage |
| Agents | /agents | Agent registry and version tracking |
| Settings | /settings | API keys, infrastructure status |

### Step 6: Stop Everything

```bash
# Stop all containers
docker compose -f docker-compose.yml -f demo/docker-compose.demo.yml down

# Stop and remove data volumes (clean slate)
docker compose -f docker-compose.yml -f demo/docker-compose.demo.yml down -v
```

---

## Environment B: Local Frontend + Docker Infrastructure

Runs the Next.js frontend locally for hot-reloading and faster iteration.
Infrastructure (databases, OTel, Redpanda) stays in Docker.

### Step 1: Start Infrastructure Only

```bash
# Start databases, Temporal, OTel Collector, Redpanda
docker compose up -d clickhouse postgres temporal temporal-ui otel-collector redpanda
```

### Step 2: Configure Frontend

```bash
# Create local env file (if not exists)
cat > frontend/.env.local << 'EOF'
AUTH_DEV_BYPASS=true
DEV_WORKSPACE_ID=00000000-0000-0000-0000-000000000001
CLICKHOUSE_URL=http://localhost:8123
CLICKHOUSE_DATABASE=neon
DATABASE_URL=postgresql://neon:neon@localhost:5432/neon
TEMPORAL_ADDRESS=localhost:7233
TEMPORAL_NAMESPACE=default
TEMPORAL_TASK_QUEUE=agent-workers
NEXT_PUBLIC_API_URL=http://localhost:3000
EOF
```

### Step 3: Start Frontend

```bash
cd frontend
bun install
bun dev
# Dashboard available at http://localhost:3000
```

### Step 4: Run the Agent

In a separate terminal:

```bash
cd examples/langgraph-agent
python3 -m venv .venv
source .venv/bin/activate
pip install -e "."

export NEON_API_URL="http://localhost:3000"
export OPENAI_API_KEY="sk-..."

python run_demo.py --model gpt-4o-mini
```

### Step 5: View Traces

Same as Environment A - open http://localhost:3000/traces.

---

## Running the Agent in a Docker Container

For production-like deployments where the agent itself runs in a container.

### Option 1: Docker Compose Demo Service

```bash
# Start everything including the demo agent container
docker compose -f docker-compose.yml -f demo/docker-compose.demo.yml up -d

# The demo-agent service runs run_demo.py automatically
# Watch its logs:
docker logs -f neon-demo-agent
```

### Option 2: Build and Run Agent Container Manually

```bash
# Build the agent image
docker build -t neon-demo-agent -f examples/langgraph-agent/Dockerfile examples/langgraph-agent/

# Run against Neon on the Docker network
docker run --rm \
  --network neon-network \
  -e NEON_API_URL=http://neon-web:3000 \
  -e NEON_PROJECT_ID=00000000-0000-0000-0000-000000000001 \
  -e OPENAI_API_KEY="$OPENAI_API_KEY" \
  neon-demo-agent \
  python run_demo.py --model gpt-4o-mini

# Run against Neon on localhost (host network)
docker run --rm \
  --network host \
  -e NEON_API_URL=http://localhost:3000 \
  -e OPENAI_API_KEY="$OPENAI_API_KEY" \
  neon-demo-agent \
  python run_demo.py --model gpt-4o-mini
```

### Option 3: Custom Agent Dockerfile

Create your own agent container. The key is sending OTLP-format traces
to the Neon API endpoint:

```dockerfile
FROM python:3.12-slim
WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

# Point traces at Neon
ENV NEON_API_URL=http://neon-web:3000
ENV NEON_PROJECT_ID=00000000-0000-0000-0000-000000000001

CMD ["python", "my_agent.py"]
```

```python
# my_agent.py - minimal example
import os, httpx, time, uuid, json

NEON_API_URL = os.getenv("NEON_API_URL", "http://localhost:3000")
PROJECT_ID = os.getenv("NEON_PROJECT_ID", "00000000-0000-0000-0000-000000000001")

def send_trace(spans):
    """Send OTLP-format spans to Neon."""
    payload = {
        "resourceSpans": [{
            "resource": {
                "attributes": [
                    {"key": "service.name", "value": {"stringValue": "my-agent"}},
                    {"key": "project.id", "value": {"stringValue": PROJECT_ID}},
                ]
            },
            "scopeSpans": [{
                "scope": {"name": "my-tracer"},
                "spans": spans,
            }]
        }]
    }
    httpx.post(
        f"{NEON_API_URL}/api/v1/traces",
        json=payload,
        headers={"Content-Type": "application/json", "x-workspace-id": PROJECT_ID},
    )
```

---

## Claude Code Prompts

Copy-paste these prompts into Claude Code to automate setup and testing.

### Full Setup (First Time)

```
Start the Neon demo environment. Run:
1. cp .env.example .env (if .env doesn't exist)
2. docker compose -f docker-compose.yml -f demo/docker-compose.demo.yml up -d
3. Wait for all services to be healthy (check localhost:8123/ping, localhost:13133, localhost:3000)
4. Set up the Python agent: cd examples/langgraph-agent && python3 -m venv .venv && source .venv/bin/activate && pip install -e "."
5. Run the demo: NEON_API_URL=http://localhost:3000 python run_demo.py --model gpt-4o-mini --count 3
```

### Quick Agent Run (Services Already Running)

```
Run the LangGraph demo agent against the local Neon dashboard.
cd examples/langgraph-agent, activate the venv, and run:
NEON_API_URL=http://localhost:3000 python run_demo.py --model gpt-4o-mini --count 3
```

### Local Frontend Mode

```
Start Neon with local frontend for development:
1. docker compose up -d clickhouse postgres temporal temporal-ui otel-collector redpanda
2. Create frontend/.env.local with AUTH_DEV_BYPASS=true, DEV_WORKSPACE_ID=00000000-0000-0000-0000-000000000001, CLICKHOUSE_URL=http://localhost:8123, DATABASE_URL=postgresql://neon:neon@localhost:5432/neon
3. cd frontend && bun install && bun dev
4. In another terminal, run the agent demo
```

### Verify Traces Are Flowing

```
Check that traces are arriving in ClickHouse:
docker exec neon-clickhouse clickhouse-client --query "SELECT count() FROM neon.traces"
docker exec neon-clickhouse clickhouse-client --query "SELECT count() FROM neon.spans"
docker exec neon-clickhouse clickhouse-client --query "SELECT trace_id, name, status, duration_ms FROM neon.traces ORDER BY timestamp DESC LIMIT 5"
docker exec neon-clickhouse clickhouse-client --query "SELECT span_id, name, span_type, model, duration_ms FROM neon.spans ORDER BY timestamp DESC LIMIT 10"
```

### Debug: Check OTel Collector Logs

```
Check what the OTel Collector is doing:
docker logs neon-otel-collector --tail 50
```

### Teardown

```
Stop all Neon services and clean up:
docker compose -f docker-compose.yml -f demo/docker-compose.demo.yml down -v
```

### Run Demo Script

```
Execute ./demo/demo.sh to start the full Neon platform and run demo queries with tracing.
```

---

## Trace Format Reference

The agent sends traces in OTLP JSON format. Here's the structure:

```json
{
  "resourceSpans": [{
    "resource": {
      "attributes": [
        {"key": "service.name", "value": {"stringValue": "langgraph-agent"}},
        {"key": "project.id", "value": {"stringValue": "00000000-..."}}
      ]
    },
    "scopeSpans": [{
      "scope": {"name": "neon-tracer", "version": "0.1.0"},
      "spans": [
        {
          "traceId": "abc123...",
          "spanId": "def456...",
          "parentSpanId": "parent789...",
          "name": "llm-call",
          "startTimeUnixNano": "1700000000000000000",
          "endTimeUnixNano": "1700000001000000000",
          "attributes": [
            {"key": "gen_ai.system", "value": {"stringValue": "openai"}},
            {"key": "gen_ai.request.model", "value": {"stringValue": "gpt-4o-mini"}},
            {"key": "gen_ai.usage.input_tokens", "value": {"intValue": "150"}},
            {"key": "gen_ai.usage.output_tokens", "value": {"intValue": "50"}}
          ],
          "status": {"code": 1, "message": ""}
        }
      ]
    }]
  }]
}
```

### Span Type Detection

The Neon API automatically detects span types from attributes:

| Attribute Present | Detected Span Type | Dashboard Treatment |
|---|---|---|
| `gen_ai.system`, `gen_ai.request.model` | `generation` | Shows model, tokens, cost |
| `tool.name`, `tool.call.id` | `tool` | Shows tool name, input/output |
| `retrieval.source`, `db.system` | `retrieval` | Shows query, chunks, sources |
| (none of above) | `span` | Generic span |

---

## Database Schema

### ClickHouse Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `neon.traces` | Parent trace records | project_id, trace_id, name, duration_ms, status, total_tokens |
| `neon.spans` | Individual span records | project_id, trace_id, span_id, span_type, model, input, output |
| `neon.scores` | Evaluation scores | project_id, trace_id, name, value, source |

### Materialized Views (Auto-Updated)

| View | Purpose |
|------|---------|
| `neon.daily_stats_mv` | Daily trace counts, errors, tokens |
| `neon.model_usage_mv` | Per-model call counts and token usage |
| `neon.duration_stats_mv` | Latency percentiles (p50, p95, p99) |
| `neon.score_trends_full_mv` | Score averages over time |
| `neon.daily_run_summary_mv` | Eval run pass/fail rates |
| `neon.scorer_stats_mv` | Per-scorer performance metrics |

### PostgreSQL Tables

| Table | Purpose |
|-------|---------|
| `projects` | Workspace/tenant metadata |
| `api_keys` | API key management |
| `suites` | Evaluation suite definitions |
| `cases` | Individual test cases |
| `runs` | Eval run metadata |
| `score_configs` | Reusable scorer configs |

---

## Dashboard Pages

| Page | URL | Description |
|------|-----|-------------|
| Home | / | Overview dashboard with key metrics |
| Traces | /traces | Searchable list of all agent traces |
| Trace Detail | /traces/[id] | Span tree, timeline, decision tree views |
| Trace Diff | /traces/diff | Side-by-side trace comparison |
| Analytics | /analytics | Charts: volume, latency, model usage, costs |
| Alerts | /alerts | Threshold alerts on metrics |
| Agents | /agents | Agent registry and version tracking |
| Agent Detail | /agents/[id] | Per-agent metrics and traces |
| Eval Runs | /eval-runs | Evaluation run history |
| Eval Run Detail | /eval-runs/[id] | Per-run results with scores |
| Suites | /suites | Test suite management |
| Compare | /compare | Multi-run comparison |
| Analysis | /analysis | Deep analysis views |
| Feedback | /feedback | Human annotation interface |
| Optimization | /optimization | Performance optimization insights |
| Settings | /settings | API keys, infra status, configuration |

---

## Troubleshooting

### Traces not appearing in dashboard

1. **Check the agent is sending traces:**
   ```bash
   # Look for "Sent X spans to Neon" in agent output
   python run_demo.py --model gpt-4o-mini --count 1
   ```

2. **Check the API is accepting traces:**
   ```bash
   curl -X POST http://localhost:3000/api/v1/traces \
     -H "Content-Type: application/json" \
     -d '{"resourceSpans":[]}'
   ```

3. **Check ClickHouse has data:**
   ```bash
   docker exec neon-clickhouse clickhouse-client \
     --query "SELECT count() FROM neon.traces"
   ```

4. **Check auth bypass is active (Docker mode):**
   ```bash
   docker exec neon-web env | grep -E "NODE_ENV|AUTH_DEV"
   # Should show NODE_ENV=development and AUTH_DEV_BYPASS=true
   ```

### Container won't start

```bash
# Check logs for the failing container
docker logs neon-clickhouse
docker logs neon-web
docker logs neon-otel-collector

# Rebuild from scratch
docker compose -f docker-compose.yml -f demo/docker-compose.demo.yml down -v
docker compose -f docker-compose.yml -f demo/docker-compose.demo.yml up -d --build
```

### Port conflicts

If ports are already in use, check with:
```bash
lsof -i :3000  # Frontend
lsof -i :8123  # ClickHouse
lsof -i :5432  # PostgreSQL
lsof -i :7233  # Temporal
lsof -i :4318  # OTel Collector
```

### Python agent errors

```bash
# Reinstall dependencies
cd examples/langgraph-agent
rm -rf .venv
python3 -m venv .venv
source .venv/bin/activate
pip install -e "."

# Check API key is set
echo $OPENAI_API_KEY
```

---

## Service Ports Reference

| Port | Service | Protocol |
|------|---------|----------|
| 3000 | Neon Dashboard & API | HTTP |
| 4317 | OTel Collector | gRPC |
| 4318 | OTel Collector | HTTP |
| 5432 | PostgreSQL | TCP |
| 7233 | Temporal Server | gRPC |
| 8080 | Temporal UI | HTTP |
| 8123 | ClickHouse HTTP | HTTP |
| 9000 | ClickHouse Native | TCP |
| 9092 | Redpanda (Kafka) | TCP |
| 13133 | OTel Health Check | HTTP |

---

## Environment Variables

### Required

| Variable | Example | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` | `sk-...` | LLM provider key for the agent |

### Optional (defaults work for local dev)

| Variable | Default | Description |
|----------|---------|-------------|
| `NEON_API_URL` | `http://localhost:3000` | Neon dashboard URL |
| `NEON_PROJECT_ID` | `00000000-...0001` | Default project/workspace ID |
| `DATABASE_URL` | `postgresql://neon:neon@localhost:5432/neon` | PostgreSQL connection |
| `CLICKHOUSE_URL` | `http://localhost:8123` | ClickHouse HTTP endpoint |
| `TEMPORAL_ADDRESS` | `localhost:7233` | Temporal server address |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4318` | OTel Collector endpoint |
| `AUTH_DEV_BYPASS` | `true` (demo mode) | Skip auth in development |
| `DEV_WORKSPACE_ID` | `00000000-...0001` | Workspace ID for dev bypass |
