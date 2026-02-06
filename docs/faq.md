# Frequently Asked Questions

Common questions about the Neon agent evaluation platform.

---

## Getting Started

### 1. How do I install Neon locally?

Clone the repository and start the infrastructure services with Docker:

```bash
git clone https://github.com/Sean-Koval/neon.git
cd neon
docker compose up -d          # Starts ClickHouse + PostgreSQL
bun install                   # Install all workspace dependencies
bun run dev                   # Start frontend + workers
```

To include Temporal for durable execution:

```bash
docker compose --profile temporal up -d
```

**Requirements:** Node.js >= 20, Bun 1.2.0, Python 3.11+ (for CLI/Python SDK), Docker.

### 2. How do I run my first evaluation?

1. **Define a test suite** in a YAML file or using the SDK:

```typescript
// evals/my-first-suite.eval.ts
import { defineSuite, defineTest, contains } from '@neon/sdk'

const suite = defineSuite({
  name: 'my-first-suite',
  defaultScorers: [contains],
})

defineTest(suite, {
  name: 'greeting-test',
  input: { query: 'Say hello' },
  expected: { outputContains: ['hello'] },
})
```

2. **Run the evaluation:**

```bash
npx neon eval --suite my-first-suite
```

3. **View results** in the dashboard at `http://localhost:3000`.

### 3. Which SDK should I use -- TypeScript or Python?

Both SDKs have identical functionality. Choose based on your agent's language:

| Factor | TypeScript (`@neon/sdk`) | Python (`neon-sdk`) |
|--------|--------------------------|---------------------|
| Install | `bun add @neon/sdk` | `pip install neon-sdk` |
| Best for | Node.js/TypeScript agents | Python agents (LangChain, CrewAI, etc.) |
| Async model | `async/await` | `asyncio` with context managers |
| Package manager | Bun or npm | uv or pip |

If your agent is in Python, use the Python SDK. If your agent is in TypeScript, use the TypeScript SDK. Both produce identical traces and scores.

### 4. What infrastructure does Neon require?

| Service | Purpose | Required? |
|---------|---------|-----------|
| ClickHouse | Trace storage and analytics queries | Yes |
| PostgreSQL | Metadata (projects, suites, API keys) | Yes |
| Temporal | Durable workflow execution | Optional (needed for managed execution) |
| Redpanda | High-throughput trace streaming | Optional |

All services run via Docker Compose. Use `docker compose up -d` for the core stack.

---

## Test Suites & Scorers

### 5. What is a test suite and how do I write one?

A test suite is a collection of test cases that evaluate your agent. Each test case has an input, expected output, and scorers that grade the agent's response.

```typescript
import { defineSuite, defineTest, contains, llmJudge } from '@neon/sdk'

const suite = defineSuite({
  name: 'customer-support-agent',
  description: 'Tests for the customer support agent',
  defaultScorers: [contains, llmJudge({ criteria: 'Response is helpful and professional' })],
  defaultMinScore: 0.7,
})

defineTest(suite, {
  name: 'refund-request',
  input: { query: 'I want a refund for my order' },
  expected: {
    toolCalls: ['lookup_order', 'process_refund'],
    outputContains: ['refund', 'processed'],
  },
})
```

See [Test Suites Guide](./test-suites.md) for full documentation.

### 6. What scorers are available?

Neon provides three categories of scorers:

**Rule-based (fast, deterministic):**
- `contains` -- checks if output contains expected keywords
- `exactMatch` -- checks for exact string match
- `toolSelection` -- validates the agent called the right tools
- `regex` -- matches against regular expressions
- `latency` -- scores based on response time
- `tokenEfficiency` -- scores based on token usage
- `jsonMatchScorer` -- validates JSON structure

**LLM judges (subjective evaluation):**
- `llmJudge` -- custom criteria with a rubric
- `response_quality_judge` -- overall quality assessment
- `safety_judge` -- safety evaluation
- `helpfulness_judge` -- helpfulness assessment
- `code_review_judge` -- code quality review
- `reasoning` -- reasoning quality
- `grounding` -- factual grounding

**Custom scorers:**

```typescript
const myScorer = defineScorer({
  name: 'word_count',
  evaluate: async (context) => ({
    value: Math.min(context.output.split(/\s+/).length / 100, 1.0),
    reason: 'Word count metric',
  }),
})
```

See [Scorers Guide](./scorers.md) for detailed documentation on each scorer.

### 7. How does scoring work? What do the numbers mean?

Scores range from **0.0 to 1.0**:

| Range | Rating | Meaning |
|-------|--------|---------|
| 0.9 - 1.0 | Excellent | Agent performs at or above expectations |
| 0.7 - 0.9 | Good | Agent performs well with minor issues |
| 0.5 - 0.7 | Fair | Agent works but needs improvement |
| 0.0 - 0.5 | Poor | Agent fails to meet expectations |

Each test case can have a `minScore` threshold. A case passes if all scorer averages meet the minimum. You can configure aggregation strategies: `mean` (default), `min`, `max`, or `weighted`.

### 8. Can I use datasets to run many test cases?

Yes. You can provide a dataset of items to test against:

```typescript
const suite = defineSuite({
  name: 'data-driven-tests',
  defaultScorers: [contains],
})

// From an array
const dataset = [
  { input: { query: 'Hello' }, expected: { outputContains: ['hi'] } },
  { input: { query: 'Weather?' }, expected: { outputContains: ['temperature'] } },
]

for (const item of dataset) {
  defineTest(suite, {
    name: `test-${item.input.query}`,
    ...item,
  })
}
```

The platform executes test cases in parallel for faster results.

---

## Execution & Workflows

### 9. How does an evaluation run work end-to-end?

1. You submit a suite via the SDK or API (`POST /api/runs`)
2. A Temporal workflow (`evalRunWorkflow`) starts
3. For each test case, a child workflow (`evalCaseWorkflow`) runs the agent
4. Each agent call generates trace spans (stored in ClickHouse)
5. Scorers evaluate the trace and produce scores
6. Results are aggregated and the run completes
7. The dashboard displays real-time progress and final results

### 10. What happens if a test case fails during a run?

Individual case failures do **not** stop the entire run. The failed case is recorded with a `failed` status and error message, and the remaining cases continue executing. Similarly, if a scorer throws an exception, it records a score of `0` with the error reason and other scorers continue.

This graceful degradation ensures you get results for all cases, even when some fail.

### 11. Can I pause or cancel a running evaluation?

Yes. Use the run control API:

```bash
# Pause a run
curl -X POST /api/runs/{id}/control \
  -H "Content-Type: application/json" \
  -d '{"action": "pause"}'

# Resume a paused run
curl -X POST /api/runs/{id}/control \
  -d '{"action": "resume"}'

# Cancel a run
curl -X POST /api/runs/{id}/control \
  -d '{"action": "cancel"}'
```

Paused runs automatically resume after 24 hours. Cancelled runs cannot be resumed.

### 12. What is "durable execution" and why does it matter?

Durable execution (powered by Temporal) means your evaluation workflows survive crashes, restarts, and network failures. If the worker process crashes mid-evaluation, Temporal automatically resumes from the last completed step when the worker restarts -- no lost work, no duplicate execution.

This is critical for long-running evaluations with LLM calls that may take minutes or hours.

---

## Dashboard

### 13. What can I see in the dashboard?

The Neon dashboard provides:

- **Home**: Recent traces, active eval runs, score summaries
- **Trace Viewer**: Hierarchical span tree with timing, inputs/outputs, and associated scores
- **Trace Comparison**: Side-by-side diff of two traces highlighting improvements and regressions
- **Evaluation Runs**: List of all runs with status, progress, and pass rates
- **Run Detail**: Per-case breakdown with score distributions
- **Analytics**: Score trends over time, component health, correlation analysis
- **Human Feedback**: Preference collection for RLHF training

See [Dashboard Guide](./dashboard.md) for a walkthrough.

### 14. How do I compare two evaluation runs?

Use the comparison API or dashboard:

```bash
curl -X POST /api/compare \
  -H "Content-Type: application/json" \
  -d '{
    "baseline_run_id": "run-abc",
    "candidate_run_id": "run-xyz"
  }'
```

The comparison shows:
- Score differences per test case
- Regressions (scores that got worse)
- Improvements (scores that got better)
- Statistical significance of changes

In the CLI, use `agent-eval compare` to compare runs.

### 15. How do I view traces for a specific run?

Navigate to the run detail page in the dashboard (`/eval-runs/{id}`). Each test case links to its trace, where you can see the full span tree: LLM calls, tool executions, retrieval operations, and their timing.

You can also query traces directly via the API:

```bash
GET /api/traces?project_id={workspace_id}&limit=50
GET /api/traces/{trace_id}
```

---

## SDKs

### 16. How do I trace my agent's operations?

**TypeScript:**

```typescript
import { trace, generation } from '@neon/sdk'

const result = await trace('agent-run', async () => {
  return await generation('llm-call', { model: 'claude-3-5-sonnet' }, async () => {
    return await llm.chat(prompt)
  })
})
```

**Python:**

```python
from neon_sdk import trace, generation

with trace("agent-run"):
    with generation("llm-call", model="claude-3-5-sonnet"):
        result = await llm.chat(prompt)
```

Supported span types: `generation`, `tool`, `retrieval`, `reasoning`, `planning`, `routing`, `memory`, `prompt`, and generic `span`.

### 17. Can I use Neon without running my agents inside it?

Yes. Neon supports an **observe-only mode** where you run agents anywhere (Cloud Run, Lambda, Kubernetes) and send traces to the Neon API:

```bash
POST /api/traces/ingest
  Headers: X-API-Key: <key>, X-Workspace-Id: <id>
  Body: { trace_id, name, status, duration_ms, spans: [...] }
```

You can also use OpenTelemetry-compatible instrumentation to send traces.

---

## CI/CD Integration

### 18. How do I add evaluations to my CI pipeline?

Add an evaluation step to your GitHub Actions workflow:

```yaml
- name: Run evaluations
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
  run: bun run eval --suite core-tests --output json > results.json

- name: Check for regressions
  run: |
    if jq -e '.failed > 0' results.json > /dev/null; then
      echo "Evaluation failed"
      exit 1
    fi
```

You can block PRs on evaluation regressions using branch protection rules that require the eval check to pass.

See [CI/CD Guide](./cicd.md) for detailed setup with GitHub Actions, GitLab CI, and other platforms.

### 19. How do I detect regressions automatically?

Compare against a baseline run (e.g., from the main branch):

```bash
bun run eval:compare \
  --baseline main \
  --candidate ${{ steps.eval.outputs.run_id }} \
  --threshold 0.05 \
  --fail-on-regression
```

This fails the CI step if any scorer's average drops by more than 5% compared to the baseline. You can configure the threshold and choose strict mode (fail on any test failure) or lenient mode.

---

## Troubleshooting

### 20. Something isn't working. Where do I start?

1. **Check services are running**: `docker compose ps` -- all containers should be `Up`
2. **Check API health**: `GET /api/health` returns status of all dependencies
3. **Check logs**:
   - Frontend: Terminal running `bun run dev`
   - Workers: Terminal running `bun run workers`
   - Infrastructure: `docker compose logs <service>`
4. **Common fixes**:
   - Restart services: `docker compose restart`
   - Reinstall dependencies: `bun install`
   - Clear build cache: `bun run build --force`

For specific error messages, see the [Error Reference Guide](./error-reference.md).

**Common issues:**
- **503 errors**: An infrastructure service (ClickHouse, PostgreSQL, or Temporal) is down. Start it with `docker compose up -d`.
- **401 errors**: Authentication is missing or expired. Check your API key or JWT token.
- **Eval run stuck**: Check that the Temporal worker is running (`bun run workers`). You can cancel stuck runs via the API.
- **Scores are all zero**: Verify the scorer configuration and that the agent produces output. For LLM judges, ensure `ANTHROPIC_API_KEY` is set.
