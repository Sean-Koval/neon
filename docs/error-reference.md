# Error Reference Guide

This document catalogs errors you may encounter when using the Neon agent evaluation platform, organized by component. Each entry includes the error message, what causes it, and how to resolve it.

---

## CLI Errors

The Neon CLI (`agent-eval`) uses exit code **0** for success and **1** for any failure. User cancellations raise `typer.Abort()`.

### Exit Codes

| Exit Code | Meaning |
|-----------|---------|
| `0` | Success, or all test cases passed |
| `1` | Error occurred, or one or more test cases failed |

### File & Validation Errors

| Error Message | Cause | Resolution |
|---------------|-------|------------|
| `File not found: {file}` | The specified suite file does not exist | Check the file path and ensure the YAML file exists |
| `Suite must be a YAML file: {suite}` | A non-YAML file was provided as a suite | Provide a `.yaml` or `.yml` file |
| `Suite not found: {name}` | No suite with the given name exists | Run `agent-eval suite list` to see available suites |
| `Empty or invalid YAML file: {path}` | The YAML file is empty or cannot be parsed | Check the file has valid YAML content |
| `YAML syntax error: {details}` | The YAML file has a syntax error | Fix the YAML syntax (check indentation, colons, quotes) |
| `Invalid suite file: {errors}` | The suite file fails schema validation | Review the validation errors and fix the suite definition |
| `Validation failed with N error(s)` | One or more fields fail validation | Review the listed errors and correct the suite file |

### Agent & Execution Errors

| Error Message | Cause | Resolution |
|---------------|-------|------------|
| `Agent is required in local mode. Use --agent <module:function>` | No agent was specified for local execution | Provide the `--agent` flag with a `module:function` path |
| `Failed to load agent: {details}` | The agent module or function could not be imported | Verify the module path exists and the function is exported |
| `Failed to load suite: {details}` | The suite could not be loaded | Check the suite file path and contents |
| `Run not found: {run_id}` | The specified run ID does not exist | Verify the run ID with `agent-eval run list` |
| `sqlite3 is required for local mode` | The `sqlite3` module is missing | Install Python with sqlite3 support (usually built-in) |
| `mlflow is required for local mode. Install with: pip install mlflow>=3.7` | MLflow dependency is missing | Run `pip install mlflow>=3.7` |

### Authentication Errors

| Error Message | Cause | Resolution |
|---------------|-------|------------|
| `Not authenticated` | No API credentials are configured | Run `agent-eval auth login` to authenticate |
| `Failed to verify credentials: {details}` | Credential verification failed | Re-authenticate with `agent-eval auth login` |
| `Failed to revoke key: {key_id}` | API key revocation request failed | Verify the key ID and try again |
| `Unknown action: {action}` | An invalid auth action was provided | Use one of the supported auth actions |

### Comparison Errors

| Error Message | Cause | Resolution |
|---------------|-------|------------|
| `Not enough runs to compare` | Fewer than two runs are available | Complete at least two runs before comparing |
| `Not enough local runs to compare` | Fewer than two local runs exist | Run evaluations locally at least twice |
| `Failed to compare runs` | The comparison operation failed | Check that both run IDs are valid and have results |

### Warnings (Non-Fatal)

These are displayed in yellow and do not cause the CLI to exit with an error:

| Warning | Meaning |
|---------|---------|
| `Directory already initialized: {path}` | The suites directory already exists |
| `No suites found` | No suite files exist in the suites directory |
| `No API keys found` | No API keys are configured |
| `No local runs found` | No local run results exist |
| `No runs found` | No runs are available |

---

## API Errors

The Neon API returns JSON error responses with an `error` field and an HTTP status code.

### Error Response Format

```json
{
  "error": "Human-readable error description",
  "details": "Additional context (on 500/503 errors)",
  "hint": "Suggestion for fixing the issue (on 401/403 errors)",
  "status": 400
}
```

### 400 Bad Request

Returned when the request is missing required fields or contains invalid data.

| Error Message | Endpoint | Cause |
|---------------|----------|-------|
| `Workspace context required` | Multiple | No `workspace_id` provided via header or query parameter |
| `name is required` | `POST /api/suites`, `POST /api/prompts` | The `name` field is missing from the request body |
| `type must be "text" or "chat"` | `POST /api/prompts` | Invalid prompt type |
| `template is required for text prompts` | `POST /api/prompts` | Text prompt missing template |
| `messages are required for chat prompts` | `POST /api/prompts` | Chat prompt missing messages |
| `Prompt is required` | `POST /api/feedback/comparisons` | Missing prompt field |
| `Feedback type is required` | `POST /api/feedback` | Missing feedback type |
| `Preference data is required for preference feedback` | `POST /api/feedback` | Preference feedback missing data |
| `Correction data is required for correction feedback` | `POST /api/feedback` | Correction feedback missing data |
| `trace_id is required` | `POST /api/scores` | Missing trace_id |
| `baseline_run_id is required` | `POST /api/compare` | Missing baseline run ID |
| `candidate_run_id is required` | `POST /api/compare` | Missing candidate run ID |
| `baseline_run_id and candidate_run_id must be different` | `POST /api/compare` | Same ID used for both runs |
| `agentId is required` | `POST /api/runs` | Missing agent ID for eval run |
| `dataset.items is required and must not be empty` | `POST /api/runs` | Empty or missing dataset |
| `scorers is required and must not be empty` | `POST /api/runs` | No scorers specified |
| `Invalid suite ID format` | `/api/suites/[id]` | Suite ID is not valid |
| `Invalid action` (Action must be one of: pause, resume, cancel) | `POST /api/runs/[id]/control` | Unrecognized control action |

### 401 Unauthorized

Returned when authentication is missing or invalid.

| Error Message | Details | Resolution |
|---------------|---------|------------|
| `Unauthorized` | `Valid authentication required` | Provide a valid `Authorization: Bearer <token>` or `X-API-Key` header |

**Supported authentication methods:**
- **JWT Bearer Token**: `Authorization: Bearer <token>`
- **API Key**: `X-API-Key: ae_<env>_<key>`

### 403 Forbidden

Returned when the authenticated user lacks permission for the requested operation.

| Error Message | Details | Resolution |
|---------------|---------|------------|
| `Forbidden` | `Workspace context required for this operation` | Provide `workspace_id` via header (`X-Workspace-Id`) or query parameter |
| `Forbidden` | `Missing permission: {permission}` | The API key or user does not have the required permission |

### 404 Not Found

Returned when the requested resource does not exist. For security, 404 is also returned when the user lacks access to the resource (to prevent enumeration).

| Error Message | Endpoint |
|---------------|----------|
| `Suite not found` | `/api/suites/[id]` |
| `Eval run not found` | `/api/runs/[id]` |
| `Span not found` | `/api/spans/[id]` |
| `Prompt "{id}" not found` | `/api/prompts/[id]` |
| `Baseline run {id} not found` | `POST /api/compare` |
| `Candidate run {id} not found` | `POST /api/compare` |

### 422 Unprocessable Entity

Returned when request body validation fails (Zod schema validation).

```json
{
  "error": "Validation error",
  "code": "VALIDATION_ERROR",
  "message": "Field validation failed",
  "details": [
    { "field": "field_name", "message": "error message" }
  ]
}
```

Common causes: missing required fields, invalid data types, invalid enum values.

### 500 Internal Server Error

Returned when an unexpected error occurs. The `details` field contains the error message.

| Error Pattern | Endpoint |
|---------------|----------|
| `Failed to list prompts` | `GET /api/prompts` |
| `Failed to create prompt` | `POST /api/prompts` |
| `Failed to get prompt` | `GET /api/prompts/[id]` |
| `Failed to update prompt` | `PUT /api/prompts/[id]` |
| `Failed to create suite` | `POST /api/suites` |
| `Failed to fetch suite` | `GET /api/suites/[id]` |
| `Failed to update suite` | `PUT /api/suites/[id]` |
| `Failed to delete suite` | `DELETE /api/suites/[id]` |
| `Failed to create eval run` | `POST /api/runs` |
| `Failed to get eval run` | `GET /api/runs/[id]` |
| `Failed to control eval run` | `POST /api/runs/[id]/control` |
| `Failed to create score` | `POST /api/scores` |
| `Failed to fetch scores` | `GET /api/scores` |
| `Failed to insert span` | `POST /api/spans` |
| `Failed to get span details` | `GET /api/spans/[id]` |
| `Failed to submit feedback` | `POST /api/feedback` |
| `Failed to fetch feedback` | `GET /api/feedback` |
| `Failed to compare runs` | `POST /api/compare` |

### Alert Rule API Errors

| Error Message | Endpoint | Cause |
|---------------|----------|-------|
| `name is required` | `POST /api/alerts/rules` | Missing rule name |
| `metric is required` | `POST /api/alerts/rules` | Missing metric field |
| `threshold is required` | `POST /api/alerts/rules` | Missing threshold |
| `operator is required` | `POST /api/alerts/rules` | Missing operator |
| `operator must be one of: gt, gte, lt, lte, eq` | `POST /api/alerts/rules` | Invalid operator |
| `severity must be one of: critical, warning, info` | `POST /api/alerts/rules` | Invalid severity |
| `Alert rule not found` | `DELETE /api/alerts/rules` | Rule ID doesn't exist (404) |
| `id query parameter is required` | `DELETE /api/alerts/rules` | Missing ID parameter (400) |

### 503 Service Unavailable

Returned when an external dependency (database, workflow engine) is not reachable.

| Error Message | Details | Resolution |
|---------------|---------|------------|
| `ClickHouse service unavailable` | `The database is not reachable.` | Ensure ClickHouse is running: `docker compose up -d` |
| `Database not available` | `PostgreSQL is not reachable.` | Ensure PostgreSQL is running: `docker compose up -d` |
| `Temporal service unavailable` | `The workflow engine is not reachable.` | Ensure Temporal is running: `docker compose --profile temporal up -d` |

**Connection error detection:** The API checks for `ECONNREFUSED`, `ETIMEDOUT`, `UNAVAILABLE`, and `connect` errors in exception messages to distinguish infrastructure issues from application errors.

---

## SDK Errors

### TypeScript SDK (`@neon/sdk`)

#### Custom Error Classes

**CloudSyncError**
Thrown when cloud sync operations fail (network issues, authentication problems, timeouts).

```typescript
class CloudSyncError extends Error {
  statusCode?: number;
  cause?: unknown;
}
```

| Scenario | Resolution |
|----------|------------|
| Network timeout | Check connectivity to the Neon API |
| HTTP 401 | Verify your API key is valid |
| HTTP 403 | Verify workspace permissions |

**CorrelationAnalysisError**
Thrown when ClickHouse correlation queries fail.

```typescript
class CorrelationAnalysisError extends Error {
  code: CorrelationErrorCode;
  cause?: unknown;
}
```

| Error Code | Meaning | Resolution |
|------------|---------|------------|
| `QUERY_FAILED` | ClickHouse query execution failed | Check ClickHouse logs and query syntax |
| `QUERY_TIMEOUT` | Query exceeded the timeout | Reduce the data range or increase the timeout |
| `PARSE_ERROR` | Failed to parse query results | This may indicate a schema mismatch; check ClickHouse table schema |
| `CONNECTION_ERROR` | Failed to connect to ClickHouse | Ensure ClickHouse is running and accessible |
| `INVALID_INPUT` | Invalid input parameters | Check the parameters passed to the analysis function |

#### Client Errors

| Error Message | Cause | Resolution |
|---------------|-------|------------|
| `Neon API error: {status} {message}` | API request returned a non-OK status | Check the status code and message for details |
| `Evaluation run failed: {message}` | An eval run completed with errors | Check the run details for per-case error messages |

#### Validation Errors

| Error Message | Module | Resolution |
|---------------|--------|------------|
| `llmJudge requires a prompt string` | `scorers/llm-judge` | Provide a `prompt` parameter to `llmJudge()` |
| `Threshold value cannot be empty` | `threshold` | Provide a non-empty threshold value |
| `Invalid threshold value: "{input}"` | `threshold` | Use a valid numeric or percentage threshold |
| `Threshold must be positive` | `threshold` | Use a positive number |
| `Threshold cannot exceed 100%` | `threshold` | Use a value of 100% or less |
| `Embedding dimension mismatch` | `analysis/pattern-detector` | Ensure embeddings have consistent dimensions |
| `Invalid experiment variants: {errors}` | `comparison/experiment` | Fix the variant configuration |
| `Experiment must have exactly 1 control and at least 1 treatment` | `comparison/experiment` | Define one control and one or more treatment variants |
| `Variant allocation must be between 0 and 100` | `comparison/variant` | Set allocation percentage between 0 and 100 |
| `Percentile must be between 0 and 100` | `comparison/statistics` | Use a percentile value in the valid range |
| `Confidence level must be between 0 and 1` | `comparison/statistics` | Use a confidence level between 0 and 1 |

#### Debug Client Errors

| Error Message | Cause | Resolution |
|---------------|-------|------------|
| `DebugClient: url is required` | No URL provided to debug client | Pass a URL when constructing DebugClient |
| `DebugClient: traceId is required` | No trace ID provided | Provide a valid trace ID |
| `Not connected to debug server` | Client not connected | Call `connect()` before using the client |
| `HTTP {status}: {statusText}` | Debug server returned an error | Check the debug server is running and accessible |

#### Export Errors

| Error Message | Cause | Resolution |
|---------------|-------|------------|
| `Export format '{name}' is already registered` | Duplicate format registration | Use a unique format name |
| `Unknown export format '{name}'` | Unrecognized export format | Use a registered format (json, csv, etc.) |
| `Format '{name}' does not support parsing` | Format is export-only | Use a format that supports parsing |

### Python SDK (`neon-sdk`)

#### Import Errors (Optional Dependencies)

| Error Message | Resolution |
|---------------|------------|
| `Temporal support requires the 'temporal' extra. Install with: pip install neon-sdk[temporal]` | Install the temporal extra |
| ClickHouse extra not installed | Install with `pip install neon-sdk[clickhouse]` |

#### Client Errors

| Error Message | Cause | Resolution |
|---------------|-------|------------|
| `Evaluation run failed: {message}` | Eval run completed with errors | Check run details for per-case errors |
| `Neon API error: {status} {message}` | API returned non-OK status | Check the status code and response |
| `Not connected. Call connect() first.` | Temporal client not connected | Call `await client.connect()` before operations |

#### Validation Errors

| Error Message | Cause | Resolution |
|---------------|-------|------------|
| `llm_judge requires a prompt string` | Missing prompt for LLM judge | Provide a `prompt` parameter to `llm_judge()` |

---

## Infrastructure Errors

### Temporal Workflow Errors

#### Worker Connection

| Error | Cause | Resolution |
|-------|-------|------------|
| Worker fails to connect after 10 retries | Temporal server unreachable | Ensure Temporal is running: `docker compose --profile temporal up -d` |
| Worker exits with code 1 | Fatal error during startup or shutdown | Check worker logs for the specific error |

The worker uses exponential backoff with configurable retry:
- **Max reconnect attempts**: 10 (override with `MAX_RECONNECT_ATTEMPTS` env var)
- **Reconnect delay**: 5000ms (override with `RECONNECT_DELAY_MS` env var)

#### Activity Timeouts

Activities have configured timeouts and retry policies. If an activity exceeds its timeout, Temporal will retry according to the retry policy.

| Activity | Timeout | Max Retries | Retry Interval |
|----------|---------|-------------|----------------|
| Agent execution | 5 minutes | 5 | 1s - 30s |
| Score trace (LLM judges) | 10 minutes | 3 | 2s - 1m |
| Emit span | 1 minute | 3 | 1s - 10s |
| LLM call | 5 minutes | 5 | 1s - 30s |
| Tool execution | 5 minutes | 5 | 1s - 30s |

#### Workflow-Level Errors

| Error Scenario | Behavior |
|----------------|----------|
| Individual test case fails | Case recorded as `failed` with error message; other cases continue |
| Scorer throws an exception | Score recorded as `0` with error reason; other scorers continue |
| Notification delivery fails | Error logged; workflow does **not** fail |
| Workflow cancelled via signal | All pending cases return `cancelled` status |
| Workflow paused | Execution pauses for up to 24 hours; resume via signal |

#### Workflow Control Signals

| Signal | Effect | Timeout |
|--------|--------|---------|
| `cancelRunSignal` | Cancels the entire eval run | Immediate |
| `pauseSignal` | Pauses/resumes workflow execution | 24 hours max pause |
| `approvalSignal` | Provides human approval for sensitive tools | 7 days max wait |
| `cancelSignal` | Cancels an individual eval case | Immediate |

### LLM Provider Errors

Thrown when LLM provider SDKs are missing or misconfigured in the Temporal worker.

| Provider | Error Message | Resolution |
|----------|---------------|------------|
| Anthropic | `Anthropic provider requires the "@anthropic-ai/sdk" package` | Run `bun add @anthropic-ai/sdk` |
| OpenAI | `OpenAI provider requires the "openai" package` | Run `bun add openai` |
| Vertex AI | `Vertex AI provider requires a GCP project ID` | Set `GOOGLE_CLOUD_PROJECT` env var |
| Vertex AI | `Vertex AI provider requires the "@google-cloud/vertexai" package` | Run `bun add @google-cloud/vertexai` |
| Vertex Claude | `Vertex Claude provider requires a GCP project ID` | Set `GOOGLE_CLOUD_PROJECT` env var |
| Vertex Claude | `Vertex Claude provider requires the "@anthropic-ai/vertex-sdk" package` | Run `bun add @anthropic-ai/vertex-sdk` |
| Factory | `Unknown provider: {name}` | Use a supported provider name |

### Health Check API

The `GET /api/health` endpoint returns the overall system status:

| HTTP Status | Response | Meaning |
|-------------|----------|---------|
| 200 | `{ "status": "healthy" }` | All services operational |
| 200 | `{ "status": "degraded" }` | Some services unavailable (e.g., ClickHouse down) |
| 503 | `{ "status": "unhealthy" }` | No backend services available |

### ClickHouse Errors

| Symptom | Cause | Resolution |
|---------|-------|------------|
| `ECONNREFUSED` on trace queries | ClickHouse is not running | Run `docker compose up -d` to start ClickHouse |
| Slow trace queries | Large data volume without partition pruning | Add time-range filters to queries |
| `503 ClickHouse service unavailable` from API | ClickHouse server is down or unreachable | Check ClickHouse container logs: `docker compose logs clickhouse` |

### PostgreSQL Errors

| Symptom | Cause | Resolution |
|---------|-------|------------|
| `ECONNREFUSED` on suite operations | PostgreSQL is not running | Run `docker compose up -d` to start PostgreSQL |
| `does not exist` errors | Database tables not created | Run database migrations |
| `ETIMEDOUT` | Database overloaded or network issue | Check PostgreSQL container health |
| `503 Database not available` from API | PostgreSQL server is down | Check container logs: `docker compose logs postgres` |

---

## Troubleshooting

### Services Won't Start

1. **Check Docker is running**: `docker ps`
2. **Start all infrastructure**: `docker compose up -d`
3. **Start with Temporal**: `docker compose --profile temporal up -d`
4. **Check container logs**: `docker compose logs <service-name>`
5. **Verify ports are free**: ClickHouse (8123), PostgreSQL (5432), Temporal (7233)

### Eval Runs Stuck in "Running" State

1. Check the Temporal UI (default: http://localhost:8233) for workflow status
2. Verify the Temporal worker is running: `bun run workers`
3. Check worker logs for activity failures
4. If needed, cancel the run: `POST /api/runs/{id}/control` with `{"action": "cancel"}`

### Scores Are All Zero

1. Verify the scorer is configured correctly in the suite definition
2. Check if the agent is producing output (non-empty responses)
3. Review trace spans to confirm the agent executed
4. For LLM judges, ensure the `ANTHROPIC_API_KEY` environment variable is set
5. Check scorer error reasons in the run results

### API Returns 503 Errors

1. Identify which service is unavailable from the error message
2. Check Docker container status: `docker compose ps`
3. Restart the failing service: `docker compose restart <service>`
4. Review container logs for startup errors

### CLI Authentication Issues

1. Run `agent-eval auth status` to check current credentials
2. Re-authenticate: `agent-eval auth login`
3. Verify the API URL is correct in your configuration
4. Check that your API key has not expired

### Suite Validation Fails

1. Validate YAML syntax with a YAML linter
2. Ensure all required fields are present (`name`, `cases`, `scorers`)
3. Check that scorer names match available scorers
4. Run `agent-eval suite validate <file>` for detailed validation errors
