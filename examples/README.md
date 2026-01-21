# Neon Examples

Example evaluation suites and agents for testing and learning Neon.

## Quick Start

```bash
# Validate a suite file
agent-eval suite validate examples/suites/simple-suite.yaml

# Run evaluation with mock agent (local mode)
agent-eval run --local examples/suites/simple-suite.yaml \
    --agent examples.agents.mock_agent:run

# Run evaluation via API
agent-eval run examples/suites/demo-suite.yaml \
    --agent examples.agents.demo_agent:run
```

## Directory Structure

```
examples/
├── README.md           # This file
├── suites/
│   ├── simple-suite.yaml   # Minimal test cases (3 cases)
│   └── demo-suite.yaml     # Comprehensive test suite (12 cases)
└── agents/
    ├── mock_agent.py       # Deterministic agent for testing
    └── demo_agent.py       # Feature-rich demo agent
```

## Evaluation Suites

### simple-suite.yaml

Minimal suite for quick validation and testing. Contains 3 test cases:

| Case | Description | Scorers |
|------|-------------|---------|
| `basic_query` | Simple arithmetic (no tools) | tool_selection, reasoning |
| `tool_usage` | Search tool usage | tool_selection, reasoning, grounding |
| `multi_step` | Multi-step comparison | tool_selection, reasoning |

Use this suite for:
- Quick smoke tests
- CI pipeline validation
- Learning Neon basics

### demo-suite.yaml

Comprehensive suite demonstrating all Neon capabilities. Contains 12 test cases across categories:

**Tool Selection Tests:**
- `factual_search` - Using web_search for factual queries
- `no_tool_needed` - Direct answers without tools
- `calculator_usage` - Calculator tool for math

**Reasoning Chain Tests:**
- `reasoning_chain` - Step-by-step problem solving
- `logical_deduction` - Logic puzzles

**Grounding Tests:**
- `grounding_check` - Context-based responses
- `refuse_hallucination` - Refusing to hallucinate

**Multi-Step Tests:**
- `multi_step_research` - Multiple searches and synthesis
- `tool_sequence_order` - Correct tool ordering

**Edge Cases:**
- `ambiguous_query` - Handling unclear queries
- `timeout_test` - Timeout behavior
- `efficient_response` - Concise responses

## Example Agents

### mock_agent.py

Deterministic agent for reliable testing. Returns predictable outputs based on query patterns.

```python
from examples.agents.mock_agent import run, MockAgent

# Function-based (default scenario)
result = run("What is 2 + 2?")
# {'output': 'The answer is 4.', 'tools_called': [], ...}

# Class-based with scenarios
agent = MockAgent(scenario="pass_all")
result = agent.run("Any query")

# Available scenarios:
# - "pass_all": Responses designed to pass evaluation
# - "fail_all": Responses designed to fail
# - "mixed": Some pass, some fail
# - "timeout": Simulates slow responses
# - "error": Raises exceptions
```

### demo_agent.py

Feature-rich agent demonstrating realistic patterns:

```python
from examples.agents.demo_agent import run, DemoAgent

# Function-based
result = run("What is the capital of France?", context={"require_search": True})
# {
#   'output': 'Paris is the capital and largest city of France.',
#   'tools_called': ['web_search'],
#   'reasoning': '...',
#   'metadata': {...}
# }

# Class-based with custom tools
agent = DemoAgent()
agent.register_tool("custom_tool", "My custom tool", my_function)
result = agent.run("Use custom tool")
```

**Available Tools:**
- `web_search` - Simulated web search
- `calculator` - Mathematical calculations
- `summarize` - Text summarization

## Suite YAML Schema

```yaml
# Required fields
name: my-suite                    # Unique suite identifier
agent_id: module.path:function    # Agent to test

# Optional suite-level defaults
description: "Suite description"
default_scorers:                  # Default scorers for all cases
  - tool_selection
  - reasoning
default_min_score: 0.7            # Default pass threshold
default_timeout_seconds: 300      # Default timeout
parallel: true                    # Run cases in parallel
stop_on_failure: false            # Stop on first failure

# Test cases
cases:
  - name: case_name               # Required: unique within suite
    description: "Case description"

    # Input (required)
    input:
      query: "The question to ask"
      context:                    # Optional context data
        key: value

    # Expected behavior (all optional)
    expected_tools:               # Tools that should be called
      - tool_name
    expected_tool_sequence:       # Tools in exact order
      - first_tool
      - second_tool
    expected_output_contains:     # Strings in output
      - "expected"
      - "text"
    expected_output_pattern: "regex.*pattern"

    # Scoring configuration
    scorers:                      # Override default scorers
      - tool_selection
      - reasoning
      - grounding
    scorer_config:                # Per-scorer configuration
      reasoning:
        require_steps: true
    min_score: 0.8                # Override default threshold

    # Execution settings
    timeout_seconds: 60           # Override default timeout
    tags:                         # For filtering/organization
      - category
      - priority
```

## Valid Scorers

| Scorer | Description |
|--------|-------------|
| `tool_selection` | Evaluates tool choice quality |
| `reasoning` | Evaluates reasoning chain coherence |
| `grounding` | Checks response grounding in context |
| `efficiency` | Evaluates response efficiency |
| `custom` | Custom scorer (requires configuration) |

## AgentProtocol

Agents must implement this interface:

```python
def run(
    query: str,
    context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Execute the agent.

    Args:
        query: The input query string
        context: Optional context dictionary

    Returns:
        Dictionary with at least:
        - output: str - The agent's response
        - tools_called: list[str] - Tools that were called

        Optional:
        - reasoning: str - Reasoning trace
        - metadata: dict - Additional metadata
    """
```

## Running Examples

### Local Mode (No API Server)

```bash
# With mock agent (deterministic results)
agent-eval run --local examples/suites/simple-suite.yaml \
    --agent examples.agents.mock_agent:run

# With demo agent (simulated tools)
agent-eval run --local examples/suites/demo-suite.yaml \
    --agent examples.agents.demo_agent:run

# Output formats
agent-eval run --local examples/suites/simple-suite.yaml \
    --agent examples.agents.mock_agent:run \
    --output json

agent-eval run --local examples/suites/simple-suite.yaml \
    --agent examples.agents.mock_agent:run \
    --output quiet  # Exit code only
```

### API Mode (With Server)

```bash
# Start API server
make api

# Run evaluation
agent-eval run examples/suites/demo-suite.yaml \
    --agent examples.agents.demo_agent:run

# Compare runs
agent-eval compare <baseline_run_id> <candidate_run_id>
```

### Validating Suites

```bash
# Check YAML syntax and schema
agent-eval suite validate examples/suites/demo-suite.yaml

# List available suites
agent-eval suite list
```

## Creating Your Own Suite

1. Copy `simple-suite.yaml` as a template
2. Update `name` and `agent_id`
3. Add your test cases
4. Validate with `agent-eval suite validate`

```yaml
name: my-custom-suite
description: My custom evaluation suite
agent_id: my_project.agents:my_agent

cases:
  - name: test_case_1
    input:
      query: "Your test query"
    expected_output_contains:
      - "expected text"
    scorers:
      - tool_selection
      - reasoning
```

## Creating Your Own Agent

1. Implement the `AgentProtocol` interface
2. Return properly structured output
3. Reference as `module.path:function` or `module.path:ClassName`

```python
# my_agent.py
def run(query: str, context: dict | None = None) -> dict:
    # Your agent logic
    return {
        "output": "Response text",
        "tools_called": ["tool1", "tool2"],
        "reasoning": "Step-by-step reasoning...",
    }
```

Use with: `--agent my_agent:run`
