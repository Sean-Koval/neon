# Temporal Integration

The Neon SDK integrates with Temporal for durable workflow execution, enabling reliable agent runs and evaluations that survive failures.

## Installation

```bash
pip install neon-sdk[temporal]
# or
uv add neon-sdk[temporal]
```

## Quick Start

```python
from neon_sdk.temporal import NeonTemporalClient, TemporalClientConfig

# Create client
client = NeonTemporalClient(TemporalClientConfig(
    address="localhost:7233",
    namespace="default",
    task_queue="agent-workers",
))

# Connect
await client.connect()

# Start an agent run
result = await client.start_agent_run(StartAgentRunInput(
    project_id="proj-123",
    agent_id="my-agent",
    input_data={"query": "Hello, world!"},
))

print(f"Workflow ID: {result['workflow_id']}")

# Clean up
await client.disconnect()
```

## Configuration

```python
from neon_sdk.temporal import TemporalClientConfig

config = TemporalClientConfig(
    address="localhost:7233",      # Temporal server address
    namespace="default",            # Temporal namespace
    task_queue="agent-workers",     # Task queue for workers
    tls=False,                      # Enable TLS
    api_key=None,                   # API key for Temporal Cloud
)
```

## Agent Runs

### Starting an Agent Run

```python
from neon_sdk.temporal import StartAgentRunInput

result = await client.start_agent_run(StartAgentRunInput(
    project_id="proj-123",
    agent_id="agent-456",
    agent_version="1.0.0",
    input_data={
        "query": "What is the weather in NYC?",
        "context": {"user_id": "user-123"},
    },
    tools=[
        {"name": "weather", "type": "api"},
        {"name": "search", "type": "web"},
    ],
    timeout_seconds=300,  # 5 minute timeout
    metadata={"source": "api"},
))

workflow_id = result["workflow_id"]
run_id = result["run_id"]
```

### Checking Status

```python
from neon_sdk.temporal import AgentStatus

status = await client.get_agent_status(workflow_id)

print(f"Status: {status.status}")  # pending, running, completed, failed, cancelled
print(f"Started: {status.started_at}")
print(f"Completed: {status.completed_at}")
```

### Getting Progress

```python
progress = await client.get_agent_progress(workflow_id)

print(f"Step {progress.current_step}/{progress.total_steps}")
print(f"Current action: {progress.current_action}")
print(f"Messages: {len(progress.messages)}")

for msg in progress.messages:
    print(f"  [{msg.timestamp}] {msg.content}")
```

### Human-in-the-Loop Approval

For agents that require human approval at certain steps:

```python
# In your workflow, you signal for approval
# Then from the client:
await client.approve_agent(workflow_id, approved=True)

# Or reject
await client.approve_agent(workflow_id, approved=False, reason="Invalid response")
```

### Waiting for Results

```python
# Wait with timeout
try:
    result = await client.wait_for_agent_result(
        workflow_id,
        timeout_seconds=300,
    )
    print(f"Output: {result.output}")
    print(f"Duration: {result.duration_ms}ms")
except TimeoutError:
    print("Agent timed out")
```

### Cancelling an Agent Run

```python
await client.cancel_agent_run(workflow_id, reason="User requested cancellation")
```

## Evaluation Runs

### Starting an Evaluation

```python
from neon_sdk.temporal import StartEvalRunInput

result = await client.start_eval_run(StartEvalRunInput(
    run_id="eval-123",
    project_id="proj-123",
    agent_id="agent-456",
    agent_version="1.0.0",
    dataset={
        "items": [
            {"input": {"query": "Q1"}, "expected": {"contains": ["A1"]}},
            {"input": {"query": "Q2"}, "expected": {"contains": ["A2"]}},
        ]
    },
    tools=[{"name": "search", "type": "web"}],
    scorers=["accuracy", "latency", "response_quality"],
    concurrency=5,  # Run 5 cases in parallel
))

eval_workflow_id = result["workflow_id"]
```

### Monitoring Eval Progress

```python
progress = await client.get_eval_progress(eval_workflow_id)

print(f"Completed: {progress.completed}/{progress.total}")
print(f"Passed: {progress.passed}")
print(f"Failed: {progress.failed}")
print(f"Avg score: {progress.avg_score:.2f}")

for case in progress.cases:
    status = "PASS" if case.passed else "FAIL"
    print(f"  [{status}] Case {case.id}: {case.score:.2f}")
```

### Getting Eval Results

```python
results = await client.get_eval_results(eval_workflow_id)

print(f"Overall score: {results.overall_score:.2f}")
print(f"Duration: {results.duration_ms}ms")

for scorer_name, stats in results.scorer_stats.items():
    print(f"{scorer_name}:")
    print(f"  Avg: {stats.avg:.2f}")
    print(f"  Min: {stats.min:.2f}")
    print(f"  Max: {stats.max:.2f}")
```

## Workflow Management

### Listing Workflows

```python
# List all agent workflows
workflows = await client.list_workflows(
    query="WorkflowType='agentRunWorkflow'",
)

for wf in workflows:
    print(f"{wf.workflow_id}: {wf.status}")

# Filter by project
workflows = await client.list_workflows(
    query="WorkflowType='agentRunWorkflow' AND project_id='proj-123'",
)
```

### Querying Workflow History

```python
history = await client.get_workflow_history(workflow_id)

for event in history.events:
    print(f"{event.timestamp}: {event.type}")
```

## Error Handling

```python
from neon_sdk.temporal import TemporalError, WorkflowNotFoundError

try:
    status = await client.get_agent_status(workflow_id)
except WorkflowNotFoundError:
    print("Workflow not found")
except TemporalError as e:
    print(f"Temporal error: {e}")
```

## Context Manager

```python
from neon_sdk.temporal import NeonTemporalClient

async with NeonTemporalClient(config) as client:
    result = await client.start_agent_run(input_data)
    # Client automatically disconnects when exiting
```

## Retry Configuration

Configure retry behavior for failed activities:

```python
result = await client.start_agent_run(StartAgentRunInput(
    # ... other fields ...
    retry_policy={
        "maximum_attempts": 3,
        "initial_interval_seconds": 1,
        "maximum_interval_seconds": 60,
        "backoff_coefficient": 2.0,
    },
))
```

## Best Practices

### 1. Use Meaningful Workflow IDs

```python
# Good - includes context
workflow_id = f"agent-{agent_id}-{timestamp}-{uuid4().hex[:8]}"

# Avoid - random only
workflow_id = str(uuid4())
```

### 2. Set Appropriate Timeouts

```python
result = await client.start_agent_run(StartAgentRunInput(
    # ... other fields ...
    timeout_seconds=300,  # 5 minutes for simple queries
))

# Long-running tasks
result = await client.start_agent_run(StartAgentRunInput(
    # ... other fields ...
    timeout_seconds=3600,  # 1 hour for complex research
))
```

### 3. Handle Cancellation Gracefully

```python
try:
    result = await client.wait_for_agent_result(workflow_id)
except CancellationError:
    # Clean up resources
    await cleanup_resources()
```

### 4. Use Task Queues for Isolation

```python
# Production
prod_client = NeonTemporalClient(TemporalClientConfig(
    task_queue="agent-workers-prod",
))

# Development
dev_client = NeonTemporalClient(TemporalClientConfig(
    task_queue="agent-workers-dev",
))
```

### 5. Monitor with Signals

```python
# Query workflow state
state = await client.query_workflow(
    workflow_id,
    query_name="getState",
)

# Send signals
await client.signal_workflow(
    workflow_id,
    signal_name="updateConfig",
    args={"max_tokens": 4000},
)
```

## See Also

- [API Reference: Temporal](../api/temporal.md)
- [Tracing Guide](tracing.md) - Traces are created by workflows
- [Scorers Guide](scorers.md) - Configure eval scorers
