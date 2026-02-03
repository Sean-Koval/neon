# Getting Started

Get up and running with Neon in minutes. This guide covers installation, basic setup, and running your first evaluation.

## Prerequisites

- **Node.js 20+** or **Bun 1.2+** (for TypeScript SDK)
- **Python 3.11+** (for Python SDK)
- **Docker & Docker Compose** (for infrastructure)

## Quick Start

### 1. Start the Infrastructure

```bash
# Clone the repository
git clone https://github.com/Sean-Koval/neon.git
cd neon

# Start ClickHouse and PostgreSQL
docker compose up -d

# Start the frontend
cd frontend && bun install && bun dev
```

The dashboard is now available at `http://localhost:3000`.

### 2. Install the SDK

**TypeScript:**
```bash
bun add @neon/sdk
# or
npm install @neon/sdk
```

**Python:**
```bash
pip install neon-sdk
# With optional integrations:
pip install neon-sdk[temporal,clickhouse]
```

### 3. Send Your First Trace

**TypeScript:**
```typescript
import { trace, generation } from '@neon/sdk'

const result = await trace('my-agent-run', async () => {
  return await generation('llm-call', {
    model: 'claude-3-5-sonnet'
  }, async () => {
    // Your LLM call here
    return await llm.chat(prompt)
  })
})
```

**Python:**
```python
from neon_sdk import trace, generation

with trace("my-agent-run"):
    with generation("llm-call", model="claude-3-5-sonnet"):
        result = await llm.chat(prompt)
```

Or via the REST API:

```bash
curl -X POST http://localhost:3000/api/traces/ingest \
  -H "Content-Type: application/json" \
  -H "x-project-id: my-project" \
  -d '{
    "trace_id": "test-001",
    "name": "agent-run",
    "status": "ok",
    "duration_ms": 1500
  }'
```

### 4. View in Dashboard

Open `http://localhost:3000/traces` to see your traces.

## Define Evaluations

Create test suites to systematically evaluate your agent:

**TypeScript:**
```typescript
import { defineSuite, defineTest, contains, llmJudge } from '@neon/sdk'

const suite = defineSuite({
  name: 'core-tests',
  description: 'Core agent functionality tests',
})

defineTest(suite, {
  name: 'weather-query',
  input: { query: 'What is the weather in Tokyo?' },
  expectedTools: ['web_search'],
  scorers: [
    contains(['Tokyo', 'weather', 'temperature']),
    llmJudge({
      criteria: 'Response should be helpful and accurate',
      model: 'claude-3-5-sonnet',
    }),
  ],
  minScore: 0.8,
})
```

**Python:**
```python
from neon_sdk import define_suite, define_test
from neon_sdk.scorers import contains, llm_judge

suite = define_suite(
    name="core-tests",
    description="Core agent functionality tests",
)

define_test(
    suite,
    name="weather-query",
    input={"query": "What is the weather in Tokyo?"},
    expected_tools=["web_search"],
    scorers=[
        contains(["Tokyo", "weather", "temperature"]),
        llm_judge(
            criteria="Response should be helpful and accurate",
            model="claude-3-5-sonnet",
        ),
    ],
    min_score=0.8,
)
```

## Next Steps

- [Scorers](./scorers) — Built-in and custom scoring functions
- [Test Suites](./test-suites) — Organizing comprehensive test coverage
- [Configuration](./configuration) — Environment variables and settings
- [Self-Hosting](./self-hosting) — Deploy Neon on your infrastructure
- [CI/CD Integration](./cicd) — Automate quality gates in your pipeline
