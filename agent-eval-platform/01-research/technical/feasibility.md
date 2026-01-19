# Technical Feasibility

## Feasibility Summary

| Component | Feasibility | Complexity | Risk |
|-----------|-------------|------------|------|
| Custom Scorers (MLflow) | High | Low | Low |
| Test Suite Management | High | Low | Low |
| Regression Detection | High | Medium | Low |
| CI/CD Integration | High | Medium | Low |
| Custom Frontend | High | Medium | Low |
| MLflow Integration | High | Low | Medium |

**Overall:** Highly feasible. Building on MLflow significantly reduces complexity.

## Target Versions

| Package | Version | Notes |
|---------|---------|-------|
| **MLflow** | `>=3.7.0` | Latest with Trace Comparison, Multi-turn Eval |
| **Python** | `3.11+` | Required for MLflow 3.x |
| **FastAPI** | `>=0.109.0` | Latest stable |
| **Pydantic** | `>=2.5.0` | V2 for performance |
| **Next.js** | `14.x` | App Router |
| **PostgreSQL** | `16` | Latest stable |

### MLflow 3.7 Features We Leverage

From [MLflow Releases](https://mlflow.org/releases):

| Feature | How We Use It |
|---------|---------------|
| **Trace Comparison UI** | Built-in A/B view reduces custom UI work |
| **Multi-turn Evaluation** | Support for conversational agents |
| **OpenTelemetry Integration** | Standard instrumentation |
| **Session-level Traces** | Group related agent runs |
| **Experiment Prompts UI** | Prompt versioning built-in |

---

## Component Analysis

### 1. Custom Scorers (MLflow Extension)

**What:** Agent-specific scorers that extend MLflow's Scorer class

**Complexity:** Low — MLflow provides clear extension points

**Interface:**
```python
from mlflow.genai.scorers import Scorer
from mlflow.entities import Trace, SpanType

class ToolSelectionScorer(Scorer):
    """Evaluates if agent selected appropriate tools."""

    name = "tool_selection"

    def __init__(self, expected_tools: list[str] = None):
        self.expected_tools = expected_tools

    def score(self, trace: Trace) -> float:
        tool_spans = trace.search_spans(span_type=SpanType.TOOL)
        actual_tools = [span.name for span in tool_spans]

        if self.expected_tools:
            # Check against expected tools
            return self._compare_tools(actual_tools, self.expected_tools)
        else:
            # Use LLM judge to evaluate tool selection
            return self._llm_judge_tools(trace, actual_tools)
```

**Key challenges:**
- Designing effective rubrics for each failure mode
- Balancing LLM judge accuracy vs. latency/cost
- Handling edge cases in span extraction

**Verdict:** ✅ Straightforward — MLflow's Scorer API is well-designed

---

### 2. Test Suite Management

**What:** Data model and API for defining eval test suites with expected behaviors

**Complexity:** Low — Standard CRUD with some domain-specific logic

**Data Model:**
```sql
eval_suites (
  id, name, description, agent_id,
  created_at, updated_at
)

eval_cases (
  id, suite_id, name,
  input_json,              -- Agent input
  expected_tools[],        -- Tools that should be called
  expected_output_pattern, -- Regex or semantic match
  scorer_config_json,      -- Which scorers to run
  created_at
)

eval_runs (
  id, suite_id, agent_version,
  status, started_at, completed_at,
  summary_json             -- Aggregate results
)

eval_results (
  id, run_id, case_id, mlflow_trace_id,
  scores_json,             -- Per-scorer results
  passed, created_at
)
```

**Key challenges:**
- Linking to MLflow traces cleanly
- Version tracking for agent changes
- Efficient querying for regression analysis

**Verdict:** ✅ Straightforward CRUD

---

### 3. Regression Detection

**What:** Compare eval results across agent versions, identify what regressed

**Complexity:** Medium — Statistical analysis + clear presentation

**Approach:**
```python
def detect_regressions(
    baseline_run: EvalRun,
    candidate_run: EvalRun,
    threshold: float = 0.05
) -> RegressionReport:
    """Compare two eval runs, identify regressions."""

    regressions = []
    for case in baseline_run.cases:
        baseline_score = baseline_run.get_score(case.id)
        candidate_score = candidate_run.get_score(case.id)

        if candidate_score < baseline_score - threshold:
            regressions.append(Regression(
                case=case,
                baseline_score=baseline_score,
                candidate_score=candidate_score,
                delta=candidate_score - baseline_score
            ))

    return RegressionReport(
        regressions=regressions,
        overall_delta=candidate_run.avg_score - baseline_run.avg_score,
        passed=len(regressions) == 0
    )
```

**Key challenges:**
- Handling noisy scores (LLM judge variance)
- Statistical significance for small test suites
- Clear visualization of what changed

**Verdict:** ✅ Feasible — mostly algorithmic, well-understood patterns

---

### 4. CI/CD Integration (GitHub Action)

**What:** GitHub Action that runs eval suite on PRs, blocks if quality drops

**Complexity:** Medium — Action development + MLflow integration

**GitHub Action:**
```yaml
# .github/workflows/agent-eval.yml
name: Agent Evaluation
on: [pull_request]

jobs:
  eval:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install dependencies
        run: pip install agent-eval mlflow

      - name: Run evaluation
        env:
          MLFLOW_TRACKING_URI: ${{ secrets.MLFLOW_TRACKING_URI }}
        run: |
          agent-eval run --suite core-tests --agent ./agent.py

      - name: Check for regressions
        run: |
          agent-eval compare \
            --baseline main \
            --candidate ${{ github.sha }} \
            --threshold 0.95 \
            --fail-on-regression
```

**Key challenges:**
- Agent execution in CI environment
- MLflow tracking URI configuration
- Handling secrets for LLM API calls
- Clear failure messages

**Verdict:** ✅ Feasible — standard GitHub Action patterns

---

### 5. Custom Frontend

**What:** Next.js UI for test suite management, regression comparison, results

**Complexity:** Medium — Standard full-stack web app

**Pages:**
| Page | Complexity |
|------|------------|
| Dashboard | Low — aggregate stats |
| Test Suites List | Low — CRUD |
| Test Suite Detail | Medium — case management |
| Eval Run Results | Medium — score visualization |
| Regression Comparison | Medium — A/B diff view |
| MLflow Trace Link | Low — deep link to MLflow UI |

**Stack:**
- Next.js 14 (App Router)
- shadcn/ui components
- Tremor for charts
- TanStack Query for data fetching

**Key challenges:**
- Linking seamlessly to MLflow UI
- Good UX for test case definition
- Clear regression visualization

**Verdict:** ✅ Straightforward web app

---

### 6. MLflow Integration

**What:** Reliable integration with MLflow 3.0 APIs

**Complexity:** Low — Well-documented APIs

**Integration Points:**
```python
import mlflow
from mlflow.genai import get_trace

# Run agent with tracing
with mlflow.start_run():
    result = agent.run(input)
    trace = mlflow.get_current_trace()

# Access spans
tool_spans = trace.search_spans(span_type=SpanType.TOOL)
llm_spans = trace.search_spans(span_type=SpanType.CHAT_MODEL)

# Run scorers
from mlflow.genai.evaluation import evaluate
results = evaluate(
    traces=[trace],
    scorers=[ToolSelectionScorer(), ReasoningScorer()]
)
```

**Key challenges:**
- MLflow API stability (3.0 is relatively new)
- Handling different MLflow deployment modes (local, Databricks, self-hosted)
- Version compatibility

**Risk:** Medium — APIs may evolve, need to pin versions and test

**Verdict:** ✅ Feasible with version management

---

## Architecture

### Proposed Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| **Scorers** | Python, extends MLflow | Native integration |
| **Backend API** | FastAPI | Async, type hints, fast |
| **Database** | PostgreSQL | Reliable, JSON support |
| **Frontend** | Next.js + shadcn | Modern, fast to build |
| **CI/CD** | GitHub Actions | Most common, well-documented |
| **Tracing** | MLflow | Don't rebuild |

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (Next.js)                       │
│  Test Suites │ Eval Runs │ Regression Diff │ Dashboard     │
└─────────────────────────────┬───────────────────────────────┘
                              │ API
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Backend (FastAPI)                        │
│  Suite CRUD │ Run Eval │ Compare Versions │ Webhook        │
└───────┬─────────────────────────────────────┬───────────────┘
        │                                     │
        ▼                                     ▼
┌───────────────┐                    ┌────────────────────────┐
│  PostgreSQL   │                    │      MLflow 3.0        │
│  (suites,     │                    │  (traces, spans,       │
│   results)    │                    │   experiments)         │
└───────────────┘                    └────────────────────────┘
                                              ▲
                                              │ SDK
┌─────────────────────────────────────────────┴───────────────┐
│                      Agent Execution                        │
│  agent-eval SDK │ Custom Scorers │ MLflow auto-trace       │
└─────────────────────────────────────────────────────────────┘
                              ▲
                              │
┌─────────────────────────────┴───────────────────────────────┐
│                    CI/CD (GitHub Actions)                   │
│  Run on PR │ Compare to main │ Block on regression         │
└─────────────────────────────────────────────────────────────┘
```

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| MLflow API breaking changes | Medium | High | Pin versions, test matrix |
| LLM judge variance (noisy scores) | High | Medium | Multiple runs, statistical tests |
| Scorer design complexity | Medium | Medium | Start simple, iterate |
| CI execution environment issues | Medium | Medium | Docker-based runner option |

---

## Proof of Concept Recommendations

### Spike 1: Custom Scorer (Day 1)
- Implement ToolSelectionScorer
- Test with sample agent traces
- **Goal:** Validate MLflow Scorer extension works

### Spike 2: Regression Detection (Day 2)
- Compare two eval runs
- Generate regression report
- **Goal:** Validate comparison logic

### Spike 3: GitHub Action (Day 3)
- Basic action that runs eval suite
- Fail on threshold breach
- **Goal:** Validate CI/CD feasibility

---

## Build Estimate

| Component | Effort | Dependencies |
|-----------|--------|--------------|
| Custom Scorers (3) | 1 day | None |
| Test Suite Data Model | 0.5 day | None |
| Backend API | 1 day | Data model |
| Regression Detection | 0.5 day | Backend |
| Frontend (basic) | 1.5 days | Backend |
| GitHub Action | 0.5 day | Scorers |
| Polish + Testing | 1 day | All |

**Total: ~6 days** for MVP (fits in 1 week)
