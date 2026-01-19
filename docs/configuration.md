# Configuration

AgentEval can be configured through environment variables, config files, and CLI options.

## Configuration Priority

1. CLI arguments (highest)
2. Environment variables
3. Config file (`~/.agent-eval/config.yaml`)
4. Default values (lowest)

## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `AGENT_EVAL_API_KEY` | API key for authentication |

### Optional

| Variable | Description | Default |
|----------|-------------|---------|
| `AGENT_EVAL_API_URL` | API endpoint URL | `https://api.agent-eval.example.com` |
| `AGENT_EVAL_TIMEOUT` | Request timeout (seconds) | `30` |
| `AGENT_EVAL_PROJECT` | Default project slug | - |

### For Self-Hosted

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | - |
| `MLFLOW_TRACKING_URI` | MLflow server URL | `http://localhost:5000` |
| `GOOGLE_CLOUD_PROJECT` | GCP project ID | - |
| `VERTEX_AI_LOCATION` | Vertex AI region | `us-central1` |

## Config File

Create `~/.agent-eval/config.yaml`:

```yaml
# Authentication
api_key: ae_live_xxxxx
api_url: https://api.agent-eval.example.com

# Defaults
default_project: my-project
default_suite: core-tests

# Output preferences
output_format: table  # table, json, quiet
color: true
```

## CLI Options

### Global Options

```bash
agent-eval --api-key=ae_live_xxx COMMAND
agent-eval --api-url=http://localhost:8000 COMMAND
agent-eval --output=json COMMAND
```

### Run Options

```bash
agent-eval run start my-suite \
  --agent myagent:run \
  --agent-version v1.2.3 \
  --parallel \
  --timeout 600 \
  --output json
```

### Compare Options

```bash
agent-eval compare runs baseline candidate \
  --threshold 0.05 \
  --fail-on-regression \
  --output markdown
```

## Suite Configuration

### Suite Defaults

```yaml
# eval-suites/my-suite.yaml
name: my-suite
agent_id: my-agent

# Suite-level defaults
default_scorers:
  - tool_selection
  - reasoning
  - grounding

default_min_score: 0.7
default_timeout_seconds: 300

# Execution settings
parallel: true          # Run cases in parallel
stop_on_failure: false  # Continue after failures

cases:
  # Cases inherit suite defaults
  - name: test_1
    input:
      query: "Test query"
    # Uses default scorers and min_score
```

### Per-Case Overrides

```yaml
cases:
  - name: critical_test
    input:
      query: "Critical query"
    # Override defaults
    scorers:
      - tool_selection
      - reasoning
      - grounding
    min_score: 0.95
    timeout_seconds: 600
    scorer_config:
      reasoning:
        model: claude-3-opus
```

## Scorer Configuration

### Default Scorer Settings

```yaml
# Suite level
scorer_config:
  tool_selection:
    strict_order: false
  reasoning:
    model: claude-3-5-sonnet
  grounding:
    model: gemini-1.5-pro
```

### Per-Case Scorer Config

```yaml
cases:
  - name: test_1
    scorer_config:
      tool_selection:
        strict_order: true  # Override for this case
```

## Self-Hosted Configuration

### API Server

```bash
# Environment variables
export DATABASE_URL=postgresql+asyncpg://user:pass@localhost/agenteval
export MLFLOW_TRACKING_URI=http://localhost:5000
export GOOGLE_CLOUD_PROJECT=my-project
export VERTEX_AI_LOCATION=us-central1
export CORS_ORIGINS=http://localhost:3000

# Start server
uvicorn src.main:app --host 0.0.0.0 --port 8000
```

### Frontend

```bash
# Environment variables
export NEXT_PUBLIC_API_URL=http://localhost:8000

# Start frontend
npm run dev
```

### Docker Compose

```yaml
# docker-compose.yml
services:
  api:
    environment:
      DATABASE_URL: postgresql+asyncpg://...
      MLFLOW_TRACKING_URI: http://mlflow:5000
      GOOGLE_CLOUD_PROJECT: ${GOOGLE_CLOUD_PROJECT}

  frontend:
    environment:
      NEXT_PUBLIC_API_URL: http://api:8000
```

## Terraform Variables

For GCP deployment:

```hcl
# terraform.tfvars
project_id  = "my-gcp-project"
region      = "us-central1"
environment = "dev"
```

## Secrets Management

### Local Development

Use `.env` file (not committed):

```bash
# .env
AGENT_EVAL_API_KEY=ae_live_xxxxx
DATABASE_URL=postgresql+asyncpg://...
```

### CI/CD

Use GitHub Secrets:

```yaml
env:
  AGENT_EVAL_API_KEY: ${{ secrets.AGENT_EVAL_API_KEY }}
```

### Production (GCP)

Use Secret Manager:

```hcl
resource "google_secret_manager_secret" "api_key" {
  secret_id = "agent-eval-api-key"
  # ...
}
```
