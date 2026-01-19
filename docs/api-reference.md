# API Reference

AgentEval provides a REST API for programmatic access.

## Authentication

All API requests require an API key in the `X-API-Key` header:

```bash
curl -H "X-API-Key: ae_live_xxxxx" https://api.agent-eval.example.com/api/v1/suites
```

## Base URL

- Cloud: `https://api.agent-eval.example.com/api/v1`
- Self-hosted: `http://localhost:8000/api/v1`

---

## Suites

### List Suites

```
GET /suites
```

**Response:**
```json
{
  "items": [
    {
      "id": "uuid",
      "name": "core-tests",
      "description": "Core functionality tests",
      "agent_id": "research-agent",
      "default_scorers": ["tool_selection", "reasoning"],
      "cases": [...],
      "created_at": "2024-01-18T12:00:00Z"
    }
  ],
  "total": 1
}
```

### Get Suite

```
GET /suites/{suite_id}
```

### Create Suite

```
POST /suites
```

**Request:**
```json
{
  "name": "my-suite",
  "agent_id": "my-agent",
  "description": "Test suite description",
  "default_scorers": ["tool_selection", "reasoning"],
  "default_min_score": 0.7,
  "cases": [
    {
      "name": "test_case_1",
      "input": {"query": "Test query"},
      "expected_tools": ["search"],
      "min_score": 0.8
    }
  ]
}
```

### Delete Suite

```
DELETE /suites/{suite_id}
```

---

## Runs

### List Runs

```
GET /runs?suite_id={suite_id}&status={status}&limit={limit}
```

**Query Parameters:**
- `suite_id`: Filter by suite
- `status`: Filter by status (`pending`, `running`, `completed`, `failed`)
- `limit`: Maximum results (default: 50)

### Get Run

```
GET /runs/{run_id}
```

**Response:**
```json
{
  "id": "uuid",
  "suite_id": "uuid",
  "suite_name": "core-tests",
  "agent_version": "abc123",
  "status": "completed",
  "summary": {
    "total_cases": 10,
    "passed": 8,
    "failed": 2,
    "avg_score": 0.82,
    "scores_by_type": {
      "tool_selection": 0.85,
      "reasoning": 0.79
    },
    "execution_time_ms": 45000
  },
  "created_at": "2024-01-18T12:00:00Z",
  "completed_at": "2024-01-18T12:00:45Z"
}
```

### Start Run

```
POST /runs/suites/{suite_id}/run
```

**Request:**
```json
{
  "agent_version": "abc123",
  "trigger": "ci",
  "trigger_ref": "PR-456",
  "config": {
    "parallel": true,
    "timeout_override": 600
  }
}
```

### Get Run Results

```
GET /runs/{run_id}/results?failed_only={bool}
```

**Response:**
```json
[
  {
    "id": "uuid",
    "case_name": "test_case_1",
    "status": "success",
    "scores": {
      "tool_selection": 0.9,
      "reasoning": 0.85
    },
    "score_details": {
      "tool_selection": {
        "score": 0.9,
        "reason": "All expected tools called",
        "evidence": ["Called: search", "Expected: search"]
      }
    },
    "passed": true,
    "execution_time_ms": 1200
  }
]
```

### Cancel Run

```
POST /runs/{run_id}/cancel
```

---

## Compare

### Compare Runs

```
POST /compare
```

**Request:**
```json
{
  "baseline_run_id": "uuid",
  "candidate_run_id": "uuid",
  "threshold": 0.05
}
```

**Response:**
```json
{
  "baseline": {
    "id": "uuid",
    "agent_version": "main"
  },
  "candidate": {
    "id": "uuid",
    "agent_version": "feature-branch"
  },
  "passed": false,
  "overall_delta": -0.08,
  "regressions": [
    {
      "case_name": "test_case_1",
      "scorer": "tool_selection",
      "baseline_score": 0.9,
      "candidate_score": 0.6,
      "delta": -0.3
    }
  ],
  "improvements": [
    {
      "case_name": "test_case_2",
      "scorer": "reasoning",
      "baseline_score": 0.7,
      "candidate_score": 0.85,
      "delta": 0.15
    }
  ],
  "unchanged": 8,
  "threshold": 0.05
}
```

---

## API Keys

### List API Keys

```
GET /api-keys
```

Returns masked keys (prefix only).

### Create API Key

```
POST /api-keys
```

**Request:**
```json
{
  "name": "CI/CD Key",
  "scopes": ["read", "execute"]
}
```

**Response:**
```json
{
  "id": "uuid",
  "key": "ae_live_xxxxx...",  // Full key, shown only once
  "name": "CI/CD Key",
  "key_prefix": "xxxxx...",
  "scopes": ["read", "execute"],
  "created_at": "2024-01-18T12:00:00Z"
}
```

### Revoke API Key

```
DELETE /api-keys/{key_id}
```

---

## Error Responses

All errors return JSON:

```json
{
  "detail": "Error message"
}
```

**Status Codes:**
- `400`: Bad request (validation error)
- `401`: Unauthorized (missing/invalid API key)
- `403`: Forbidden (missing required scope)
- `404`: Not found
- `500`: Internal server error

---

## Rate Limits

- 1000 requests per minute per API key
- 100 concurrent evaluations per project

Rate limit headers:
```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1705579200
```
