# Configuration

Neon can be configured through environment variables, config files, and SDK options.

## Environment Variables

### Core Services

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://neon:neon@localhost:5432/neon` |
| `CLICKHOUSE_URL` | ClickHouse HTTP endpoint | `http://localhost:8123` |
| `CLICKHOUSE_DATABASE` | ClickHouse database name | `neon` |
| `CLICKHOUSE_USER` | ClickHouse username | `default` |
| `CLICKHOUSE_PASSWORD` | ClickHouse password | (empty) |

### LLM Providers

Required for LLM-based scorers:

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude models |
| `OPENAI_API_KEY` | OpenAI API key for GPT models |
| `GOOGLE_AI_API_KEY` | Google AI API key for Gemini models |

### Temporal (Optional)

For durable workflow execution:

| Variable | Description | Default |
|----------|-------------|---------|
| `TEMPORAL_ADDRESS` | Temporal server address | `localhost:7233` |
| `TEMPORAL_NAMESPACE` | Temporal namespace | `default` |
| `TEMPORAL_TASK_QUEUE` | Worker task queue | `neon-workers` |

### Security

| Variable | Description | Default |
|----------|-------------|---------|
| `NEON_SECRET_KEY` | Secret key for signing tokens (min 32 chars) | (none) |
| `NEON_API_KEY` | API key for external clients | (none) |
| `NEON_TRACE_MASKING_ENABLED` | Redact common email / SSN / API-key patterns on server-side trace ingestion routes | `false` |
| `NEON_TRACE_TAIL_SLOW_THRESHOLD_MS` | Collector latency threshold that forces retention of slow traces | `5000` |
| `NEON_TRACE_TAIL_SAMPLING_PERCENT` | Collector baseline retention percent for non-error, non-slow traces | `15` |

### Backup Automation

| Variable | Description | Default |
|----------|-------------|---------|
| `NEON_BACKUP_TARGET` | Backup destination for self-hosted automation (`local` or `gcs`) | `local` |
| `NEON_BACKUP_RUN_ON_STARTUP` | Run each backup worker immediately when it starts | `true` |
| `NEON_BACKUP_GCS_BUCKET` | Shared GCS bucket name used when `NEON_BACKUP_TARGET=gcs` | (empty) |
| `NEON_CLICKHOUSE_BACKUP_INTERVAL_SECONDS` | Seconds between ClickHouse backup attempts | `86400` |
| `NEON_CLICKHOUSE_FULL_BACKUP_DAY` | UTC weekday for weekly full ClickHouse backup (`0` = Sunday) | `0` |
| `NEON_CLICKHOUSE_BACKUP_RETENTION_DAYS` | Retention window for ClickHouse backups | `30` |
| `NEON_POSTGRES_BACKUP_INTERVAL_SECONDS` | Seconds between PostgreSQL backup attempts | `86400` |
| `NEON_POSTGRES_BACKUP_RETENTION_DAYS` | Retention window for PostgreSQL backups | `30` |
| `NEON_CHECKPOINT_DIR` | Filesystem path for durable checkpoint bodies used by replay/restore flows | `./.neon/checkpoints` |
| `NEON_CHECKPOINT_BACKUP_INTERVAL_SECONDS` | Seconds between checkpoint archive backup attempts | `86400` |
| `NEON_CHECKPOINT_BACKUP_RETENTION_DAYS` | Retention window for checkpoint archive backups | `30` |

## SDK Configuration

### TypeScript

```typescript
import { NeonClient } from '@neon/sdk'

const client = new NeonClient({
  // API endpoint (default: http://localhost:3000)
  apiUrl: process.env.NEON_API_URL,

  // Project identifier
  projectId: 'my-project',

  // LLM provider for judges
  llm: {
    provider: 'anthropic',
    model: 'claude-3-5-sonnet',
    apiKey: process.env.ANTHROPIC_API_KEY,
  },

  // Tracing options
  tracing: {
    enabled: true,
    sampleRate: 1.0,  // 100% of traces
    batchSize: 100,
    flushIntervalMs: 5000,
    exporter: {
      sampling: {
        enabled: true,
        rate: 0.25,
        projectRates: {
          'prod-critical': 1.0,
        },
      },
      filtering: {
        enabled: true,
        excludeSpanTypes: ['event'],
        excludeNames: [/healthcheck/i],
      },
      masking: {
        enabled: true,
      },
    },
  },
})
```

### Python

```python
from neon_sdk import NeonClient

client = NeonClient(
    api_url=os.getenv("NEON_API_URL", "http://localhost:3000"),
    project_id="my-project",
    llm={
        "provider": "anthropic",
        "model": "claude-3-5-sonnet",
        "api_key": os.getenv("ANTHROPIC_API_KEY"),
    },
    tracing={
        "enabled": True,
        "sample_rate": 1.0,
        "batch_size": 100,
        "flush_interval_ms": 5000,
        "exporter": {
            "sampling": {
                "enabled": True,
                "rate": 0.25,
                "project_rates": {
                    "prod-critical": 1.0,
                },
            },
            "filtering": {
                "enabled": True,
                "exclude_span_types": ["event"],
            },
            "masking": {
                "enabled": True,
            },
        },
    },
)
```

### Trace Redaction

Neon supports two complementary masking layers for trace payloads:

- SDK-side opt-in masking in the TypeScript and Python OTLP exporters before spans leave the process
- Server-side masking on `/api/v1/traces` and `/api/spans` when `NEON_TRACE_MASKING_ENABLED=true`

The default rules redact common email addresses, U.S. SSNs, and `sk_*` / `pk_*` style API keys in prompt/completion fields, tool I/O, structured messages, retrieval chunks, and state/artifact references. The collector config in [`config/otel-collector.yaml`](/home/seanm/repos/neon/config/otel-collector.yaml) mirrors those defaults for self-hosted OTLP pipelines.

### Trace Sampling And Filtering

Neon supports two load-shedding layers for tracing:

- SDK-side head sampling in the TypeScript and Python OTLP exporters. Sampling is deterministic at the trace level and can be overridden per project.
- SDK-side noisy span filtering in the exporters for health checks, event spam, or other low-value spans you do not want buffered or shipped.

For self-hosted collector deployments, the default tail-sampling policy in [`config/otel-collector.yaml`](/home/seanm/repos/neon/config/otel-collector.yaml) keeps:

- error traces
- traces slower than `NEON_TRACE_TAIL_SLOW_THRESHOLD_MS`
- a baseline `NEON_TRACE_TAIL_SAMPLING_PERCENT` of everything else

## Suite Configuration

### Default Scorers

Set default scorers for all tests in a suite:

```typescript
const suite = defineSuite({
  name: 'my-suite',
  defaultScorers: [
    contains,
    toolSelection({ expected: [] }),
    llmJudge({ criteria: 'Response quality' }),
  ],
  defaultMinScore: 0.7,
})
```

### Execution Settings

```typescript
const suite = defineSuite({
  name: 'my-suite',
  // Run tests in parallel
  parallel: true,
  // Continue running after failures
  stopOnFailure: false,
  // Default timeout per test
  timeoutMs: 300000,  // 5 minutes
})
```

### Per-Test Overrides

```typescript
defineTest(suite, {
  name: 'critical-test',
  // Override suite defaults
  scorers: [
    toolSelection({ expected: ['search'] }),
    llmJudge({ criteria: '...', model: 'claude-3-opus' }),
  ],
  minScore: 0.95,
  timeoutMs: 600000,  // 10 minutes for this test
})
```

## Scorer Configuration

### LLM Judge Models

```typescript
const scorer = llmJudge({
  criteria: 'Response quality',
  // Model selection
  model: 'claude-3-5-sonnet',  // Default
  // Alternatives: 'claude-3-opus', 'gpt-4o', 'gemini-1.5-pro'

  // Temperature (0-1)
  temperature: 0,  // Deterministic

  // Max tokens for judge response
  maxTokens: 1024,
})
```

### Tool Selection

```typescript
const scorer = toolSelection({
  expected: ['search', 'calculate'],
  // Require exact order
  strictOrder: false,
  // Penalize unexpected tools
  penalizeExtra: true,
  // Weight for extra tool penalty
  extraPenalty: 0.1,
})
```

## Docker Compose Configuration

### Override File

Create `docker-compose.override.yml` for local customizations:

```yaml
services:
  clickhouse:
    ports:
      - "18123:8123"  # Different host port

  postgres:
    environment:
      POSTGRES_PASSWORD: my-secure-password
```

### Profiles

```bash
# Core only (ClickHouse + PostgreSQL)
docker compose up -d

# With Temporal
docker compose --profile temporal up -d

# Full stack
docker compose --profile full up -d

# With streaming (Redpanda)
docker compose --profile streaming up -d
```

## Secrets Management

### Local Development

Use `.env` file (not committed to git):

```bash
# .env
ANTHROPIC_API_KEY=sk-ant-...
DATABASE_URL=postgresql://neon:neon@localhost:5432/neon
NEON_SECRET_KEY=your-random-secret-key-at-least-32-chars
```

### CI/CD (GitHub Actions)

```yaml
env:
  ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
  NEON_API_URL: ${{ secrets.NEON_API_URL }}
```

### Production

Use your cloud provider's secret manager:
- AWS Secrets Manager
- GCP Secret Manager
- Azure Key Vault
- HashiCorp Vault

## Logging

### Log Levels

| Level | Description |
|-------|-------------|
| `error` | Errors only |
| `warn` | Warnings and errors |
| `info` | General information (default) |
| `debug` | Detailed debugging |
| `trace` | Very verbose |

```bash
# Set via environment
export LOG_LEVEL=debug

# Or in code
import { setLogLevel } from '@neon/sdk'
setLogLevel('debug')
```

### Structured Logging

Logs are output in JSON format for easy parsing:

```json
{
  "level": "info",
  "timestamp": "2024-01-18T12:00:00.000Z",
  "message": "Evaluation completed",
  "suite": "core-tests",
  "passed": 8,
  "failed": 2,
  "duration_ms": 45000
}
```
