# Scorers

AgentEval includes specialized scorers designed for tool-using AI agents. Unlike generic LLM evaluation, these scorers understand agent-specific failure modes.

## Built-in Scorers

### Tool Selection Scorer

Evaluates whether the agent chose appropriate tools for the task.

**Checks:**
- Were expected tools called?
- Were unnecessary tools avoided?
- Was the tool calling sequence correct (if order matters)?

```yaml
cases:
  - name: search_task
    input:
      query: "What is the weather in Tokyo?"
    expected_tools:
      - web_search
    # or for ordered sequence:
    expected_tool_sequence:
      - web_search
      - format_response
    scorers:
      - tool_selection
```

**Score Calculation:**
- Jaccard similarity between expected and actual tools
- Sequence similarity (LCS) if `expected_tool_sequence` is specified
- Penalizes extra tools called

### Reasoning Scorer

Evaluates the quality of the agent's reasoning process using an LLM judge.

**Evaluates:**
- Logical coherence (0-3 points)
- Information usage (0-3 points)
- Problem decomposition (0-2 points)
- Completeness (0-2 points)

```yaml
cases:
  - name: complex_analysis
    input:
      query: "Compare the economic policies of countries A and B"
    scorers:
      - reasoning
    scorer_config:
      reasoning:
        model: claude-3-5-sonnet  # Override default model
```

### Grounding Scorer

Evaluates whether the agent's response is grounded in available evidence.

**Evaluates:**
- Factual accuracy (0-4 points)
- Evidence support (0-4 points)
- Expected content match (0-2 points)

```yaml
cases:
  - name: factual_response
    input:
      query: "What is the population of France?"
      context:
        source: "France has a population of approximately 67 million"
    expected_output_contains:
      - "67 million"
      - "France"
    scorers:
      - grounding
```

## Scorer Configuration

### Global Defaults

Set defaults for all cases in a suite:

```yaml
name: my-suite
default_scorers:
  - tool_selection
  - reasoning
  - grounding
default_min_score: 0.7
```

### Per-Case Configuration

Override for specific cases:

```yaml
cases:
  - name: critical_case
    scorers:
      - tool_selection
      - reasoning
    scorer_config:
      tool_selection:
        strict_order: true
      reasoning:
        model: claude-3-opus  # Use more capable model
    min_score: 0.9  # Higher threshold for critical cases
```

## Score Interpretation

| Score Range | Interpretation |
|-------------|---------------|
| 0.9 - 1.0 | Excellent - Agent performed optimally |
| 0.7 - 0.9 | Good - Minor issues that may be acceptable |
| 0.5 - 0.7 | Fair - Significant issues that need attention |
| 0.0 - 0.5 | Poor - Major failures requiring investigation |

## Custom Scorers

You can extend the base `Scorer` class to create custom scorers:

```python
from agent_eval.scorers.base import Scorer, ScorerResult

class MyCustomScorer(Scorer):
    name = "my_custom_scorer"
    description = "Evaluates custom criteria"

    async def score(self, case, output, config=None):
        # Your scoring logic here
        score = 0.8
        reason = "Custom evaluation passed"
        evidence = ["Detail 1", "Detail 2"]

        return ScorerResult(
            score=score,
            reason=reason,
            evidence=evidence,
        )
```

Register your scorer:

```python
# In your agent code
from agent_eval import register_scorer
register_scorer(MyCustomScorer())
```

Use in test cases:

```yaml
scorers:
  - my_custom_scorer
```

## LLM Judge Configuration

Scorers that use LLM judges (Reasoning, Grounding) support model configuration:

```yaml
scorer_config:
  reasoning:
    model: claude-3-5-sonnet  # Default
    # Available: claude-3-5-sonnet, gemini-1.5-pro, gemini-1.5-flash

  grounding:
    model: gemini-1.5-pro  # Cheaper for grounding checks
```

Model selection affects:
- **Cost**: Flash < Pro < Sonnet
- **Quality**: Sonnet > Pro > Flash
- **Speed**: Flash > Pro > Sonnet

Recommended:
- Use `claude-3-5-sonnet` for critical evaluations
- Use `gemini-1.5-flash` for quick iteration during development
