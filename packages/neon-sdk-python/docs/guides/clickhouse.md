# ClickHouse Integration

The Neon SDK provides direct access to ClickHouse for trace storage and analytics queries.

## Installation

```bash
pip install neon-sdk[clickhouse]
# or
uv add neon-sdk[clickhouse]
```

## Quick Start

```python
from neon_sdk.clickhouse import NeonClickHouseClient, ClickHouseConfig

# Create client
client = NeonClickHouseClient(ClickHouseConfig(
    host="localhost",
    port=8123,
    database="neon",
    username="default",  # Optional
    password="",         # Optional
))

# Query traces
traces = client.query_traces(project_id="proj-1", limit=100)
for trace in traces:
    print(f"{trace.name}: {trace.status}")
```

## Configuration

```python
from neon_sdk.clickhouse import ClickHouseConfig

config = ClickHouseConfig(
    host="localhost",          # ClickHouse host
    port=8123,                 # HTTP port (default: 8123)
    database="neon",           # Database name
    username="default",        # Username (optional)
    password="",               # Password (optional)
    secure=False,              # Use HTTPS (default: False)
    verify=True,               # Verify SSL certificates
    connect_timeout=10,        # Connection timeout in seconds
    query_timeout=300,         # Query timeout in seconds
)
```

## Inserting Data

### Insert Traces

```python
from neon_sdk.clickhouse import TraceRecord
from datetime import datetime

client.insert_traces([
    TraceRecord(
        trace_id="trace-123",
        project_id="proj-1",
        name="my-agent",
        status="ok",
        timestamp=datetime.now(),
        duration_ms=1500,
        input={"query": "Hello"},
        output={"response": "Hi there!"},
        metadata={"user_id": "user-1"},
    )
])
```

### Insert Spans

```python
from neon_sdk.clickhouse import SpanRecord

client.insert_spans([
    SpanRecord(
        span_id="span-456",
        trace_id="trace-123",
        parent_span_id=None,  # Root span
        project_id="proj-1",
        name="llm-call",
        span_type="generation",
        status="ok",
        start_time=datetime.now(),
        end_time=datetime.now(),
        duration_ms=500,
        input={"prompt": "Hello"},
        output={"text": "Hi there!"},
        metadata={"model": "gpt-4"},
    )
])
```

### Insert Scores

```python
from neon_sdk.clickhouse import ScoreRecord

client.insert_scores([
    ScoreRecord(
        score_id="score-789",
        trace_id="trace-123",
        project_id="proj-1",
        name="accuracy",
        value=0.95,
        scorer_name="contains",
        reason="Found expected keywords",
        timestamp=datetime.now(),
    )
])
```

## Querying Data

### Query Traces

```python
# Basic query
traces = client.query_traces(
    project_id="proj-1",
    limit=100,
)

# With filters
traces = client.query_traces(
    project_id="proj-1",
    status="error",
    start_date="2024-01-01",
    end_date="2024-01-31",
    limit=50,
)

# Search by name pattern
traces = client.query_traces(
    project_id="proj-1",
    name_pattern="customer-*",
)
```

### Get Trace with Spans

```python
result = client.get_trace_with_spans("proj-1", "trace-123")

trace = result["trace"]
print(f"Trace: {trace.name}, Status: {trace.status}")

for span in result["spans"]:
    print(f"  Span: {span.name}, Type: {span.span_type}")
```

### Query Spans

```python
spans = client.query_spans(
    trace_id="trace-123",
    span_type="generation",  # Optional filter
)
```

### Query Scores

```python
scores = client.query_scores(
    trace_id="trace-123",
)

for score in scores:
    print(f"{score.name}: {score.value}")
```

## Analytics

### Dashboard Summary

```python
summary = client.get_dashboard_summary(
    project_id="proj-1",
    start_date="2024-01-01",
    end_date="2024-01-31",
)

print(f"Total traces: {summary.total_traces}")
print(f"Success rate: {100 - summary.error_rate:.1f}%")
print(f"Avg duration: {summary.avg_duration_ms:.0f}ms")
print(f"P95 duration: {summary.p95_duration_ms:.0f}ms")
print(f"Total tokens: {summary.total_tokens}")
```

### Daily Statistics

```python
daily = client.get_daily_stats(
    project_id="proj-1",
    start_date="2024-01-01",
    end_date="2024-01-31",
)

for day in daily:
    print(f"{day.date}: {day.trace_count} traces, {day.error_rate:.1f}% errors")
```

### Score Trends

```python
trends = client.get_score_trends(
    project_id="proj-1",
    start_date="2024-01-01",
    end_date="2024-01-31",
)

for trend in trends:
    print(f"{trend.scorer_name}:")
    print(f"  Avg: {trend.avg_score:.2f}")
    print(f"  Min: {trend.min_score:.2f}")
    print(f"  Max: {trend.max_score:.2f}")
```

### Hourly Distribution

```python
hourly = client.get_hourly_distribution(
    project_id="proj-1",
    date="2024-01-15",
)

for hour in hourly:
    print(f"{hour.hour:02d}:00 - {hour.trace_count} traces")
```

## Advanced Queries

### Custom SQL Queries

```python
# Execute raw SQL (read-only)
result = client.execute_query(
    """
    SELECT
        name,
        count() as count,
        avg(duration_ms) as avg_duration
    FROM traces
    WHERE project_id = {project_id:String}
      AND timestamp >= {start:DateTime}
    GROUP BY name
    ORDER BY count DESC
    LIMIT 10
    """,
    parameters={
        "project_id": "proj-1",
        "start": "2024-01-01 00:00:00",
    }
)

for row in result:
    print(f"{row['name']}: {row['count']} traces, {row['avg_duration']:.0f}ms avg")
```

### Aggregations

```python
# Get top spans by duration
top_spans = client.get_top_spans_by_duration(
    project_id="proj-1",
    limit=10,
)

# Get error distribution
errors = client.get_error_distribution(
    project_id="proj-1",
    start_date="2024-01-01",
)
```

## Schema

### Traces Table

| Column | Type | Description |
|--------|------|-------------|
| trace_id | String | Unique trace identifier |
| project_id | String | Project identifier |
| name | String | Trace name |
| status | Enum | ok, error, cancelled |
| timestamp | DateTime64 | Start time |
| duration_ms | UInt64 | Duration in milliseconds |
| input | String | JSON input |
| output | String | JSON output |
| metadata | String | JSON metadata |

### Spans Table

| Column | Type | Description |
|--------|------|-------------|
| span_id | String | Unique span identifier |
| trace_id | String | Parent trace ID |
| parent_span_id | Nullable(String) | Parent span ID |
| project_id | String | Project identifier |
| name | String | Span name |
| span_type | Enum | generation, tool, retrieval, etc. |
| status | Enum | ok, error |
| start_time | DateTime64 | Start time |
| end_time | DateTime64 | End time |
| duration_ms | UInt64 | Duration |
| input | String | JSON input |
| output | String | JSON output |
| metadata | String | JSON metadata |

### Scores Table

| Column | Type | Description |
|--------|------|-------------|
| score_id | String | Unique score identifier |
| trace_id | String | Associated trace ID |
| project_id | String | Project identifier |
| name | String | Score name |
| value | Float64 | Score value (0-1) |
| scorer_name | String | Scorer that produced this |
| reason | String | Explanation |
| timestamp | DateTime64 | When scored |

## Best Practices

### 1. Batch Inserts

```python
# Good - batch insert
traces = [TraceRecord(...) for _ in range(100)]
client.insert_traces(traces)

# Avoid - individual inserts
for trace in traces:
    client.insert_traces([trace])  # Slow!
```

### 2. Use Appropriate Indexes

The schema includes indexes on:
- `project_id` - Always filter by project
- `timestamp` - Use date ranges
- `status` - Filter by status

```python
# Good - uses indexes
traces = client.query_traces(
    project_id="proj-1",
    start_date="2024-01-01",
    status="error",
)

# Less efficient - full scan
traces = client.query_traces(
    name_pattern="*customer*",  # Pattern matching is slower
)
```

### 3. Limit Result Sets

```python
# Always use limits for large datasets
traces = client.query_traces(
    project_id="proj-1",
    limit=100,  # Don't fetch everything
)
```

### 4. Use Pagination

```python
offset = 0
page_size = 100

while True:
    traces = client.query_traces(
        project_id="proj-1",
        limit=page_size,
        offset=offset,
    )

    if not traces:
        break

    process_traces(traces)
    offset += page_size
```

## See Also

- [API Reference: ClickHouse](../api/clickhouse.md)
- [Tracing Guide](tracing.md)
- [Scorers Guide](scorers.md)
