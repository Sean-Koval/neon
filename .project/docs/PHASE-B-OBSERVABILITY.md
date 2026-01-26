# Phase B: Agent Observability Platform

**Status:** Planning (Post-MVP)
**Timeline:** Q2-Q3 2026
**Prerequisite:** MVP Complete

---

## Overview

Phase B adds observability capabilities for agents running in production. The key insight is that evaluation (testing before deploy) and observability (monitoring after deploy) are complementary - teams need both.

This phase introduces **BYOA (Bring Your Own Agent)** mode where external agents can send traces to Neon without running inside the platform.

---

## User Stories

### As an ML engineer with agents in production...
- I want to see what my agents are doing in real-time
- I want to track token usage and costs across all my agents
- I want to correlate production issues with specific trace patterns
- I want to run evals on production traces (not just synthetic test cases)

### As a team lead...
- I want a dashboard showing agent health across all services
- I want to set alerts when agents behave unexpectedly
- I want to understand cost trends over time

---

## Technical Approach

### Why ClickHouse?

MLflow stores traces but isn't optimized for:
- High-volume ingestion (production traces)
- Complex analytical queries
- Time-series aggregations
- Cost-effective storage at scale

ClickHouse provides:
- 10-100x faster analytical queries
- Efficient columnar compression
- Native time-series support
- SQL interface (familiar)

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    EXTERNAL AGENTS                               │
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │ LangChain   │  │ LlamaIndex  │  │  Custom     │             │
│  │   Agent     │  │   Agent     │  │   Agent     │             │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘             │
│         │                │                │                     │
│         └────────────────┼────────────────┘                     │
│                          │                                      │
│                    OTel Traces                                  │
│                          │                                      │
└──────────────────────────┼──────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│                        NEON PLATFORM                              │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                    OTel Ingestion Service                   │  │
│  │                                                             │  │
│  │   POST /v1/traces ──▶ Transform ──▶ Validate ──▶ Enqueue   │  │
│  │                                                             │  │
│  └─────────────────────────────┬───────────────────────────────┘  │
│                                │                                  │
│                                ▼                                  │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                      Message Queue                           │ │
│  │                    (Redis or Kafka)                          │ │
│  └─────────────────────────────┬───────────────────────────────┘ │
│                                │                                  │
│              ┌─────────────────┴─────────────────┐               │
│              │                                   │               │
│              ▼                                   ▼               │
│  ┌───────────────────────┐         ┌───────────────────────┐    │
│  │      ClickHouse       │         │      PostgreSQL       │    │
│  │                       │         │                       │    │
│  │  • traces             │         │  • projects           │    │
│  │  • spans              │         │  • api_keys           │    │
│  │  • scores             │         │  • suites/cases       │    │
│  │  • daily_stats (MV)   │         │  • runs (metadata)    │    │
│  │  • cost_by_model (MV) │         │                       │    │
│  └───────────────────────┘         └───────────────────────┘    │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

### OTel Compatibility

We'll accept standard OpenTelemetry trace format with semantic conventions for Gen AI:

```python
# Example: Instrumenting a LangChain agent
from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter

# Configure exporter to Neon
exporter = OTLPSpanExporter(
    endpoint="https://neon.example.com/v1/traces",
    headers={"Authorization": "Bearer <api-key>"}
)

# Traces automatically sent to Neon
```

### Gen AI Semantic Conventions

We'll use the emerging [Gen AI semantic conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/):

| Attribute | Description |
|-----------|-------------|
| `gen_ai.system` | LLM provider (openai, anthropic, etc.) |
| `gen_ai.request.model` | Model name |
| `gen_ai.usage.input_tokens` | Input token count |
| `gen_ai.usage.output_tokens` | Output token count |
| `gen_ai.request.temperature` | Temperature setting |

---

## Data Model (ClickHouse)

### traces table
```sql
CREATE TABLE traces (
    project_id String,
    trace_id String,
    name String,
    timestamp DateTime64(3),
    end_time Nullable(DateTime64(3)),
    duration_ms UInt64,
    status Enum('unset', 'ok', 'error'),
    metadata Map(String, String),

    -- Aggregated from spans (materialized)
    total_tokens UInt64,
    total_cost Decimal(10, 6),
    llm_calls UInt16,
    tool_calls UInt16,

    -- Partitioning
    _date Date MATERIALIZED toDate(timestamp)
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(_date)
ORDER BY (project_id, timestamp, trace_id);
```

### spans table
```sql
CREATE TABLE spans (
    project_id String,
    trace_id String,
    span_id String,
    parent_span_id Nullable(String),
    name String,
    span_type Enum('span', 'generation', 'tool', 'retrieval', 'event'),
    timestamp DateTime64(3),
    end_time Nullable(DateTime64(3)),
    duration_ms UInt64,
    status Enum('unset', 'ok', 'error'),

    -- LLM fields
    model Nullable(String),
    input_tokens Nullable(UInt32),
    output_tokens Nullable(UInt32),
    total_tokens Nullable(UInt32),
    cost_usd Nullable(Decimal(10, 6)),

    -- Tool fields
    tool_name Nullable(String),
    tool_input String,
    tool_output String,

    -- General
    attributes Map(String, String),

    _date Date MATERIALIZED toDate(timestamp)
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(_date)
ORDER BY (project_id, trace_id, timestamp, span_id);
```

### Materialized Views

```sql
-- Daily statistics per project
CREATE MATERIALIZED VIEW daily_stats_mv
ENGINE = SummingMergeTree()
ORDER BY (project_id, date)
AS SELECT
    project_id,
    toDate(timestamp) as date,
    count() as trace_count,
    countIf(status = 'error') as error_count,
    sum(total_tokens) as total_tokens,
    sum(cost_usd) as total_cost
FROM traces
GROUP BY project_id, date;

-- Cost by model
CREATE MATERIALIZED VIEW cost_by_model_mv
ENGINE = SummingMergeTree()
ORDER BY (project_id, model, date)
AS SELECT
    project_id,
    model,
    toDate(timestamp) as date,
    count() as call_count,
    sum(total_tokens) as total_tokens,
    sum(cost_usd) as total_cost
FROM spans
WHERE span_type = 'generation'
GROUP BY project_id, model, date;
```

---

## Features

### 1. Trace Ingestion API

**Endpoint:** `POST /v1/traces`

Accepts OTLP JSON format:
```json
{
  "resourceSpans": [{
    "resource": {
      "attributes": [
        {"key": "service.name", "value": {"stringValue": "my-agent"}}
      ]
    },
    "scopeSpans": [{
      "spans": [{
        "traceId": "abc123",
        "spanId": "def456",
        "name": "llm-call",
        "startTimeUnixNano": "1234567890000000000",
        "endTimeUnixNano": "1234567891000000000",
        "attributes": [
          {"key": "gen_ai.request.model", "value": {"stringValue": "claude-3-5-sonnet"}}
        ]
      }]
    }]
  }]
}
```

### 2. Trace Explorer UI

- Real-time trace list with filtering
- Trace detail with span waterfall
- LLM input/output viewer
- Token usage breakdown
- Cost per trace

### 3. Analytics Dashboard

- Traces over time
- Error rate trends
- Token usage by model
- Cost breakdown
- Latency percentiles

### 4. Eval on Production Traces

Link observability to evaluation:
- Create dataset from production traces
- Run scorers on real traces
- Compare production vs test performance

---

## Migration Strategy

### Step 1: Add ClickHouse (Non-Breaking)
- Deploy ClickHouse alongside existing stack
- No changes to existing functionality
- New data goes to ClickHouse, MLflow continues working

### Step 2: Build Ingestion Service
- New `/v1/traces` endpoint
- Transform OTel → internal format
- Write to ClickHouse

### Step 3: Add Trace UI
- New `/traces` route
- Query ClickHouse directly
- Keep existing pages on MLflow

### Step 4: Analytics
- Build analytics dashboard
- Materialized views for performance
- Cost tracking

### Step 5: Bridge Evals to Traces
- Link eval runs to traces
- Score production traces
- Regression detection on prod data

---

## Tasks Breakdown

### Infrastructure
- [ ] Add ClickHouse to docker-compose
- [ ] Create ClickHouse schema (tables, MVs)
- [ ] Set up connection pooling
- [ ] Configure backups

### Ingestion Service
- [ ] OTel ingest endpoint
- [ ] OTel → internal transform
- [ ] Batch writer to ClickHouse
- [ ] Rate limiting per project
- [ ] Validation and error handling

### API Layer
- [ ] GET /api/traces (list with filters)
- [ ] GET /api/traces/:id (detail with spans)
- [ ] GET /api/analytics/usage
- [ ] GET /api/analytics/costs

### Frontend
- [ ] Trace list page
- [ ] Trace detail with waterfall
- [ ] Span detail panel
- [ ] Analytics dashboard
- [ ] Cost breakdown charts

### Integration
- [ ] Python SDK for easy instrumentation
- [ ] Example: Instrument LangChain agent
- [ ] Example: Instrument custom agent
- [ ] Documentation

---

## Success Criteria

Phase B is complete when:

1. [ ] External agents can send traces via OTel
2. [ ] Traces visible in UI within 5 seconds
3. [ ] Analytics dashboard shows usage/costs
4. [ ] Can create eval dataset from production traces
5. [ ] ClickHouse handles 1000 traces/second
6. [ ] Documentation covers common agent frameworks

---

## Open Questions

1. **Retention policy** - How long to keep traces?
2. **Sampling** - Do we need trace sampling for high-volume?
3. **PII handling** - How to handle sensitive data in LLM inputs?
4. **Multi-region** - Do we need geo-distributed ingestion?
