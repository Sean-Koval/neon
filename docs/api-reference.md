# API Reference

Neon provides a REST API for trace ingestion, querying, and evaluation management.

## Base URL

- **Local:** `http://localhost:3000/api`
- **Self-hosted:** `https://your-domain.com/api`

## Authentication

Include the project ID in requests:

```bash
curl -H "x-project-id: your-project-id" \
     http://localhost:3000/api/traces
```

For protected endpoints, include an API key:

```bash
curl -H "x-api-key: your-api-key" \
     -H "x-project-id: your-project-id" \
     http://localhost:3000/api/traces
```

---

## Traces

### Ingest Trace

```
POST /api/traces/ingest
```

**Headers:**
```
Content-Type: application/json
x-project-id: your-project-id
```

**Request Body:**
```json
{
  "trace_id": "trace-123",
  "name": "agent-run",
  "status": "ok",
  "duration_ms": 1500,
  "start_time": "2024-01-18T12:00:00.000Z",
  "attributes": {
    "agent_version": "v1.2.3",
    "user_id": "user-456"
  },
  "spans": [
    {
      "span_id": "span-1",
      "name": "llm-call",
      "type": "generation",
      "start_time": "2024-01-18T12:00:00.000Z",
      "end_time": "2024-01-18T12:00:01.500Z",
      "attributes": {
        "model": "claude-3-5-sonnet",
        "input_tokens": 150,
        "output_tokens": 200
      }
    }
  ]
}
```

**Response:** `201 Created`
```json
{
  "trace_id": "trace-123",
  "ingested": true
}
```

### List Traces

```
GET /api/traces?project_id={id}&limit={n}&offset={n}
```

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `project_id` | string | required | Project identifier |
| `limit` | number | 50 | Max results |
| `offset` | number | 0 | Pagination offset |
| `status` | string | - | Filter by status (`ok`, `error`) |
| `name` | string | - | Filter by trace name |
| `start_time` | ISO8601 | - | Filter traces after this time |
| `end_time` | ISO8601 | - | Filter traces before this time |

**Response:**
```json
{
  "traces": [
    {
      "trace_id": "trace-123",
      "name": "agent-run",
      "status": "ok",
      "duration_ms": 1500,
      "start_time": "2024-01-18T12:00:00.000Z",
      "span_count": 5,
      "attributes": {}
    }
  ],
  "total": 100,
  "limit": 50,
  "offset": 0
}
```

### Get Trace

```
GET /api/traces/{trace_id}
```

**Response:**
```json
{
  "trace_id": "trace-123",
  "name": "agent-run",
  "status": "ok",
  "duration_ms": 1500,
  "start_time": "2024-01-18T12:00:00.000Z",
  "attributes": {},
  "spans": [
    {
      "span_id": "span-1",
      "parent_span_id": null,
      "name": "llm-call",
      "type": "generation",
      "start_time": "2024-01-18T12:00:00.000Z",
      "end_time": "2024-01-18T12:00:01.500Z",
      "attributes": {}
    }
  ]
}
```

---

## Scores

### Create Score

```
POST /api/scores
```

**Request Body:**
```json
{
  "trace_id": "trace-123",
  "name": "accuracy",
  "value": 0.95,
  "source": "eval",
  "scorer_name": "llm_judge",
  "reason": "Response was accurate and helpful",
  "evidence": ["Correctly identified the capital", "Provided context"]
}
```

**Response:** `201 Created`
```json
{
  "id": "score-456",
  "trace_id": "trace-123",
  "name": "accuracy",
  "value": 0.95,
  "created_at": "2024-01-18T12:00:00.000Z"
}
```

### List Scores

```
GET /api/scores?trace_id={id}
```

**Response:**
```json
{
  "scores": [
    {
      "id": "score-456",
      "trace_id": "trace-123",
      "name": "accuracy",
      "value": 0.95,
      "source": "eval",
      "scorer_name": "llm_judge",
      "reason": "Response was accurate and helpful",
      "created_at": "2024-01-18T12:00:00.000Z"
    }
  ]
}
```

---

## Eval Runs

### Start Eval Run

```
POST /api/evals/runs
```

**Request Body:**
```json
{
  "suite_name": "core-tests",
  "agent_version": "v1.2.3",
  "config": {
    "parallel": true,
    "timeout_ms": 300000
  }
}
```

**Response:** `202 Accepted`
```json
{
  "run_id": "run-789",
  "status": "pending",
  "suite_name": "core-tests",
  "created_at": "2024-01-18T12:00:00.000Z"
}
```

### Get Eval Run

```
GET /api/evals/runs/{run_id}
```

**Response:**
```json
{
  "run_id": "run-789",
  "suite_name": "core-tests",
  "agent_version": "v1.2.3",
  "status": "completed",
  "summary": {
    "total_cases": 10,
    "passed": 8,
    "failed": 2,
    "avg_score": 0.82,
    "scores_by_scorer": {
      "tool_selection": 0.85,
      "llm_judge": 0.79
    },
    "duration_ms": 45000
  },
  "created_at": "2024-01-18T12:00:00.000Z",
  "completed_at": "2024-01-18T12:00:45.000Z"
}
```

### List Eval Run Results

```
GET /api/evals/runs/{run_id}/results
```

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `failed_only` | boolean | false | Only return failed cases |

**Response:**
```json
{
  "results": [
    {
      "case_name": "weather-query",
      "status": "passed",
      "scores": {
        "tool_selection": 0.9,
        "llm_judge": 0.85
      },
      "avg_score": 0.875,
      "passed": true,
      "duration_ms": 1200,
      "details": {
        "tool_selection": {
          "score": 0.9,
          "reason": "Correct tool selected",
          "evidence": ["Used web_search as expected"]
        }
      }
    }
  ]
}
```

---

## Compare Runs

### Compare Two Runs

```
POST /api/evals/compare
```

**Request Body:**
```json
{
  "baseline_run_id": "run-100",
  "candidate_run_id": "run-101",
  "threshold": 0.05
}
```

**Response:**
```json
{
  "baseline": {
    "run_id": "run-100",
    "agent_version": "v1.2.2"
  },
  "candidate": {
    "run_id": "run-101",
    "agent_version": "v1.2.3"
  },
  "passed": false,
  "overall_delta": -0.08,
  "regressions": [
    {
      "case_name": "complex-query",
      "scorer": "tool_selection",
      "baseline_score": 0.9,
      "candidate_score": 0.6,
      "delta": -0.3
    }
  ],
  "improvements": [
    {
      "case_name": "simple-query",
      "scorer": "llm_judge",
      "baseline_score": 0.7,
      "candidate_score": 0.85,
      "delta": 0.15
    }
  ],
  "unchanged_count": 8,
  "threshold": 0.05
}
```

---

## Health Check

```
GET /api/health
```

**Response:**
```json
{
  "status": "ok",
  "version": "1.0.0",
  "services": {
    "clickhouse": "ok",
    "postgres": "ok",
    "temporal": "ok"
  }
}
```

---

## Error Responses

All errors return JSON:

```json
{
  "error": "Not found",
  "message": "Trace with ID 'trace-999' not found",
  "code": "TRACE_NOT_FOUND"
}
```

**Status Codes:**
| Code | Description |
|------|-------------|
| `400` | Bad request (validation error) |
| `401` | Unauthorized (missing/invalid API key) |
| `404` | Resource not found |
| `429` | Rate limit exceeded |
| `500` | Internal server error |

---

## Rate Limits

| Endpoint | Limit |
|----------|-------|
| Trace ingestion | 1000/minute |
| Query endpoints | 100/minute |
| Eval runs | 10/minute |

Rate limit headers are included in responses:
```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1705579200
```
