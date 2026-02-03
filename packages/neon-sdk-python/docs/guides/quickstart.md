# Quick Start Guide

This guide will help you get started with the Neon Python SDK in minutes.

## Prerequisites

- Python 3.11+
- `neon-sdk` installed (see [Installation](installation.md))

## Step 1: Create a Client

```python
from neon_sdk import Neon, NeonConfig

# Create an async client
client = Neon(NeonConfig(
    api_key="your-api-key",
    base_url="https://api.neon.dev",  # Optional: defaults to this
))

# Or create a sync client
from neon_sdk import NeonSync
sync_client = NeonSync(NeonConfig(api_key="your-api-key"))
```

## Step 2: Trace Your Agent

Use context managers to trace operations:

```python
from neon_sdk.tracing import trace, generation, tool

async def my_agent(query: str) -> str:
    with trace("my-agent", input={"query": query}):
        # Trace an LLM call
        with generation("main-llm", model="gpt-4"):
            response = await call_llm(query)

        # Trace a tool call
        with tool("search", tool_name="web_search"):
            results = await search(query)

        return response
```

Or use the decorator for simpler cases:

```python
from neon_sdk.tracing import traced

@traced("my-function")
async def my_function(x: int) -> int:
    return x * 2
```

## Step 3: Create Scorers

Define how to evaluate your agent's performance:

```python
from neon_sdk.scorers import (
    contains,
    exact_match,
    llm_judge,
    LLMJudgeConfig,
)

# Rule-based scorer
quality_scorer = contains(["thank you", "helpful"])

# LLM-based scorer
helpfulness = llm_judge(LLMJudgeConfig(
    prompt='''Rate the helpfulness of this response from 0 to 1.

    User Query: {{input}}
    Response: {{output}}

    Return JSON: {"score": <0-1>, "reason": "<explanation>"}''',
    model='claude-3-haiku-20240307',
))
```

## Step 4: Run an Evaluation

```python
from neon_sdk.types import DatasetItem

# Define test cases
dataset = [
    DatasetItem(
        input={"query": "What is Python?"},
        expected={"contains": ["programming language"]},
    ),
    DatasetItem(
        input={"query": "How do I install pip?"},
        expected={"contains": ["pip install"]},
    ),
]

# Run evaluation
async def run_eval():
    for item in dataset:
        # Run your agent
        result = await my_agent(item.input["query"])

        # Score the result
        score = quality_scorer.evaluate(EvalContext(
            input=item.input,
            output=result,
            expected=item.expected,
        ))

        print(f"Score: {score.value}, Reason: {score.reason}")
```

## Step 5: View Results

Use the API client to query traces and scores:

```python
# List recent traces
traces = await client.traces.list()
for trace in traces:
    print(f"{trace.name}: {trace.status}")

# Get a specific trace with spans
trace = await client.traces.get("trace-id")
for span in trace.spans:
    print(f"  {span.span_type}: {span.name}")
```

## Complete Example

```python
import asyncio
from neon_sdk import Neon, NeonConfig
from neon_sdk.tracing import trace, generation
from neon_sdk.scorers import contains, EvalContext

async def main():
    # Setup
    client = Neon(NeonConfig(api_key="your-api-key"))

    # Trace an operation
    with trace("example-agent"):
        with generation("llm-call", model="claude-3-sonnet"):
            result = "This is a helpful response about Python programming."

    # Evaluate
    scorer = contains(["helpful", "Python"])
    score = scorer.evaluate(EvalContext(
        output=result,
        input={"query": "Tell me about Python"},
    ))

    print(f"Score: {score.value}")
    print(f"Reason: {score.reason}")

if __name__ == "__main__":
    asyncio.run(main())
```

## Next Steps

- [Tracing Guide](tracing.md) - Deep dive into tracing
- [Scorers Guide](scorers.md) - Learn all scorer types
- [ClickHouse Integration](clickhouse.md) - Store and query traces
- [Temporal Integration](temporal.md) - Durable workflow execution
