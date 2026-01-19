# Test Suites

Test suites define the expected behaviors of your agent. They consist of test cases that specify inputs, expected outputs, and scoring criteria.

## Suite Structure

```yaml
# eval-suites/my-suite.yaml

name: my-suite                    # Unique name
description: Test core features   # Optional description
agent_id: my-agent                # Agent identifier

# Suite-level defaults
default_scorers:
  - tool_selection
  - reasoning
  - grounding

default_min_score: 0.7
default_timeout_seconds: 300
parallel: true                    # Run cases in parallel
stop_on_failure: false            # Continue on failures

# Test cases
cases:
  - name: case_1
    # ... case definition
```

## Test Case Definition

### Basic Case

```yaml
cases:
  - name: simple_query
    description: Test basic question answering
    input:
      query: "What is 2 + 2?"
    expected_output_contains:
      - "4"
    min_score: 0.8
```

### Tool Expectations

```yaml
cases:
  # Expect specific tools (order-independent)
  - name: search_task
    input:
      query: "Find the latest news about AI"
    expected_tools:
      - web_search

  # Expect tools in order
  - name: multi_step_task
    input:
      query: "Research and summarize topic X"
    expected_tool_sequence:
      - web_search
      - web_search
      - summarize

  # Expect NO tools
  - name: simple_math
    input:
      query: "What is 5 * 5?"
    expected_tools: []  # Empty = no tools should be called
```

### Output Validation

```yaml
cases:
  # Check for specific strings
  - name: factual_check
    input:
      query: "What is the capital of Japan?"
    expected_output_contains:
      - "Tokyo"
      - "Japan"

  # Use regex pattern
  - name: format_check
    input:
      query: "List three items"
    expected_output_pattern: "1\\..+2\\..+3\\."
```

### Context and Configuration

```yaml
cases:
  - name: with_context
    input:
      query: "Summarize this document"
      context:
        document: "Long document text here..."
        format: "bullet_points"
    config:
      max_tokens: 500
```

### Tags and Organization

```yaml
cases:
  - name: edge_case_1
    tags:
      - edge-case
      - search
      - regression-v1.2
    # ...

  - name: critical_feature
    tags:
      - critical
      - p0
    # ...
```

Filter by tags:
```bash
agent-eval run start my-suite --tags critical
```

## Best Practices

### 1. Cover Failure Modes

Test common agent failure modes:

```yaml
cases:
  # Tool selection errors
  - name: wrong_tool
    description: Shouldn't use search for simple math
    input:
      query: "What is 10 / 2?"
    expected_tools: []  # Should NOT call search

  # Hallucination check
  - name: grounded_response
    input:
      query: "What did the document say about X?"
      context:
        document: "The document mentions Y and Z"
    expected_output_contains:
      - "Y"
      - "Z"
    # Should NOT contain X if not in document
```

### 2. Use Meaningful Names

```yaml
# Good
- name: search_factual_current_events
- name: no_tool_simple_arithmetic
- name: multi_step_research_comparison

# Bad
- name: test1
- name: case_a
```

### 3. Set Appropriate Thresholds

```yaml
cases:
  # Critical functionality - high threshold
  - name: critical_feature
    min_score: 0.9

  # Experimental feature - lower threshold
  - name: experimental_feature
    min_score: 0.6

  # Default threshold
  - name: standard_feature
    # Uses suite default (0.7)
```

### 4. Include Regression Tests

When you fix a bug, add a test case:

```yaml
cases:
  - name: regression_issue_123
    description: Fixed in v1.2 - agent was calling wrong tool
    input:
      query: "The specific query that caused the bug"
    expected_tools:
      - correct_tool
    tags:
      - regression
      - issue-123
```

## Suite Organization

### Multiple Suites

Organize suites by concern:

```
eval-suites/
├── core-tests.yaml        # Core functionality
├── regression.yaml        # Regression tests
├── edge-cases.yaml        # Edge cases
├── performance.yaml       # Performance-sensitive tests
└── integration.yaml       # Integration tests
```

### Suite Inheritance (Coming Soon)

```yaml
# eval-suites/base.yaml
name: base
default_scorers:
  - tool_selection
  - reasoning

# eval-suites/extended.yaml
extends: base
name: extended
cases:
  - name: additional_test
    # ...
```

## Validation

Validate suite syntax before running:

```bash
agent-eval suite validate eval-suites/my-suite.yaml
```

Common validation errors:
- Missing required fields (`name`, `agent_id`, `input`)
- Invalid scorer names
- Invalid regex patterns
- YAML syntax errors
