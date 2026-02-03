# Tracing Guide

The Neon SDK provides comprehensive tracing for agent operations. Traces capture the full execution flow of your agent, including LLM calls, tool usage, and intermediate steps.

## Overview

Traces are organized hierarchically:
- **Trace**: The root container for an operation
- **Span**: Individual steps within a trace

Each span has a type that categorizes the operation:
- `generation`: LLM API calls
- `tool`: Tool/function executions
- `retrieval`: RAG retrieval operations
- `reasoning`: Chain-of-thought steps
- `planning`: Task decomposition
- `prompt`: Prompt construction
- `routing`: Agent routing decisions
- `memory`: Memory access operations
- `span`: Generic spans

## Context Managers

### Basic Tracing

```python
from neon_sdk.tracing import trace, span

with trace("my-agent"):
    with span("step-1"):
        do_something()

    with span("step-2"):
        do_something_else()
```

### Specialized Span Types

```python
from neon_sdk.tracing import (
    trace,
    generation,
    tool,
    retrieval,
    reasoning,
    planning,
    prompt,
    routing,
    memory,
)

with trace("rag-agent"):
    # Construct the prompt
    with prompt("build-prompt"):
        full_prompt = template.format(query=query)

    # Retrieve relevant documents
    with retrieval("vector-search", query=query):
        docs = vector_db.search(query, k=5)

    # Reason about the documents
    with reasoning("analyze-docs"):
        analysis = analyze(docs)

    # Generate response
    with generation("main-response", model="gpt-4"):
        response = await llm.chat(full_prompt)
```

### Adding Metadata

```python
with trace("my-agent", metadata={"user_id": "123"}):
    with generation("llm-call",
                   model="gpt-4",
                   input={"prompt": prompt},
                   output={"response": response}):
        response = await llm.chat(prompt)
```

### Tool Tracing

```python
with tool("search",
          tool_name="web_search",
          input={"query": "Python tutorials"},
          output={"results": results}):
    results = await search_api.search("Python tutorials")
```

## Decorators

### Basic Decorator

```python
from neon_sdk.tracing import traced

@traced("my-function")
def my_function(x: int) -> int:
    return x * 2

# Async functions work too
@traced("async-function")
async def async_function(x: int) -> int:
    await asyncio.sleep(0.1)
    return x * 2
```

### With Metadata

```python
@traced("process-data", metadata={"component": "processor"})
def process_data(data: list) -> list:
    return [item * 2 for item in data]
```

## Context Propagation

Spans are automatically nested based on the current context:

```python
from neon_sdk.tracing import trace, span, get_current_trace, get_current_span

with trace("parent"):
    print(get_current_trace().name)  # "parent"

    with span("child-1"):
        print(get_current_span().name)  # "child-1"

        with span("grandchild"):
            print(get_current_span().name)  # "grandchild"

    with span("child-2"):
        print(get_current_span().name)  # "child-2"
```

## Setting Span Status

```python
from neon_sdk.tracing import trace, span
from neon_sdk.types import SpanStatus

with trace("my-operation") as t:
    try:
        with span("risky-operation") as s:
            result = risky_function()
            s.set_status(SpanStatus.OK)
    except Exception as e:
        s.set_status(SpanStatus.ERROR, str(e))
        t.set_status(SpanStatus.ERROR)
```

## Trace Attributes

```python
with trace("my-agent") as t:
    t.set_attribute("user_id", "123")
    t.set_attribute("session_id", "abc")

    with span("step") as s:
        s.set_attribute("step_number", 1)
```

## Integration with Async Code

```python
import asyncio

async def parallel_operations():
    with trace("parallel-agent"):
        # Run multiple operations in parallel
        tasks = [
            process_item(item)
            for item in items
        ]
        results = await asyncio.gather(*tasks)

@traced("process-item")
async def process_item(item):
    with generation("llm-call", model="gpt-4"):
        return await llm.process(item)
```

## Best Practices

### 1. Name Traces Descriptively

```python
# Good
with trace("customer-support-agent"):
    ...

with trace("document-summarization"):
    ...

# Avoid
with trace("agent"):
    ...

with trace("process"):
    ...
```

### 2. Use Appropriate Span Types

```python
# Good - uses specific span types
with generation("gpt-4-call", model="gpt-4"):
    ...

with tool("calculator", tool_name="math"):
    ...

# Avoid - generic spans for everything
with span("llm"):
    ...

with span("tool"):
    ...
```

### 3. Include Relevant Input/Output

```python
with generation("summarize",
               model="gpt-4",
               input={"document": doc[:500]},  # Truncate large inputs
               output={"summary": summary}):
    summary = await llm.summarize(doc)
```

### 4. Handle Errors Gracefully

```python
with trace("my-agent") as t:
    try:
        result = await process()
    except Exception as e:
        t.set_status(SpanStatus.ERROR, str(e))
        t.set_attribute("error_type", type(e).__name__)
        raise
```

## See Also

- [Scorers Guide](scorers.md) - Evaluate traced operations
- [ClickHouse Integration](clickhouse.md) - Store and query traces
- [API Reference: Tracing](../api/tracing.md)
