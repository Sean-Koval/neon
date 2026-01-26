# Neon Temporal Workers

Temporal worker for the Neon agent evaluation platform. Provides durable execution of agent evaluations with automatic retry, state preservation, and progress tracking.

## Workflows

### Evaluation Workflows

| Workflow | Description |
|----------|-------------|
| `evalRunWorkflow` | Sequential evaluation of agent across a dataset |
| `parallelEvalRunWorkflow` | Parallel evaluation with configurable concurrency |
| `evalCaseWorkflow` | Single test case execution with scoring |

### Agent Workflows

| Workflow | Description |
|----------|-------------|
| `agentRunWorkflow` | Execute an agent with tool use and optional human approval |

### Optimization Workflows

| Workflow | Description |
|----------|-------------|
| `abTestWorkflow` | Compare two agent configurations on the same dataset |
| `progressiveRolloutWorkflow` | Gradual rollout with automatic rollback on degradation |

## Activities

| Activity | Description |
|----------|-------------|
| `llmCall` | Make LLM API calls (Anthropic Claude) |
| `executeTool` | Execute registered tools |
| `emitSpan` | Send spans to ClickHouse via Neon API |
| `scoreTrace` | Run scorers against a trace |
| `healthCheck` | Verify worker connectivity |

## Scorers

### Rule-based (fast, deterministic)
- `latency` - Response time scoring
- `error_rate` - Error frequency
- `token_efficiency` - Token usage optimization
- `tool_selection` - Correct tool usage
- `tool_sequence` - Tool order validation
- `contains` / `not_contains` - Output substring checks
- `regex_match` / `exact_match` - Pattern matching
- `json_valid` - JSON output validation
- `output_length` - Response length bounds

### LLM Judge (uses Claude Haiku)
- `response_quality` - Overall quality assessment
- `hallucination` - Fabricated information detection
- `relevance` - Query relevance scoring
- `coherence` - Logical flow evaluation
- `safety` - Content safety check

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TEMPORAL_ADDRESS` | `localhost:7233` | Temporal server address |
| `TEMPORAL_NAMESPACE` | `default` | Temporal namespace |
| `TEMPORAL_TASK_QUEUE` | `agent-workers` | Task queue name |
| `MAX_CONCURRENT_ACTIVITIES` | `10` | Max concurrent activities |
| `MAX_CONCURRENT_WORKFLOWS` | `5` | Max concurrent workflows |
| `NEON_API_URL` | `http://localhost:3000` | Neon API for ClickHouse |
| `ANTHROPIC_API_KEY` | - | Required for LLM calls |
| `DEFAULT_PROJECT_ID` | `default` | Fallback project ID |

## Development

```bash
# Install dependencies
npm install

# Run in development mode (with hot reload)
npm run dev

# Build for production
npm run build

# Start production worker
npm start

# Type check
npm run typecheck
```

## Docker

```bash
# Build image
docker build -t neon-temporal-worker .

# Run container
docker run -e TEMPORAL_ADDRESS=temporal:7233 \
           -e ANTHROPIC_API_KEY=sk-ant-... \
           neon-temporal-worker
```

## Usage with Docker Compose

The worker is included in the project's docker-compose.yml:

```bash
# Start with Temporal profile (includes worker)
docker compose --profile temporal up -d

# Or start everything
docker compose --profile full up -d
```

## API Integration

The worker communicates with the Neon API for:
- Storing spans in ClickHouse (`POST /api/spans`)
- Fetching traces for scoring (`GET /api/traces/:id`)
- Storing scores (`POST /api/scores`)

## Architecture

```
┌────────────────┐     ┌──────────────────┐     ┌─────────────┐
│  Next.js API   │────▶│ Temporal Server  │────▶│   Worker    │
│  (Frontend)    │     │                  │     │             │
└────────────────┘     └──────────────────┘     └─────────────┘
        │                                              │
        │                                              ▼
        │                                      ┌─────────────┐
        │                                      │  Anthropic  │
        │                                      │    API      │
        │                                      └─────────────┘
        │
        ▼
┌────────────────┐
│   ClickHouse   │
│  (Traces/Scores)│
└────────────────┘
```

## Workflow Example

```typescript
// Start an evaluation run from the API
const handle = await client.workflow.start('evalRunWorkflow', {
  taskQueue: 'agent-workers',
  workflowId: `eval-run-${runId}`,
  args: [{
    runId,
    projectId: 'my-project',
    agentId: 'my-agent',
    agentVersion: 'v1.0.0',
    dataset: {
      items: [
        { input: { query: 'Hello' }, expected: { tools: ['greet'] } },
        { input: { query: 'Calculate 2+2' }, expected: { tools: ['calculate'] } },
      ],
    },
    tools: [
      { name: 'greet', description: 'Greet the user', parameters: {} },
      { name: 'calculate', description: 'Do math', parameters: {} },
    ],
    scorers: ['tool_selection', 'response_quality'],
  }],
});

// Query progress
const progress = await handle.query('progress');
console.log(`Completed: ${progress.completed}/${progress.total}`);

// Wait for result
const result = await handle.result();
console.log(`Pass rate: ${result.summary.passed}/${result.summary.total}`);
```
