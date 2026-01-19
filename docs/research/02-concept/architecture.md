# Technical Architecture

## Architecture Overview

AgentEval extends MLflow 3.0 rather than replacing it. MLflow handles tracing, span storage, and basic evaluation infrastructure. We add agent-specific scorers, test suite management, regression detection, and CI/CD integration.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        AgentEval Platform                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐ │
│  │   Frontend      │  │   Backend API   │  │   CLI / SDK         │ │
│  │   (Next.js)     │  │   (FastAPI)     │  │   (Python)          │ │
│  │                 │  │                 │  │                     │ │
│  │  • Dashboard    │  │  • Suite CRUD   │  │  • agent-eval run   │ │
│  │  • Test Suites  │  │  • Run Eval     │  │  • agent-eval compare│ │
│  │  • Regression   │  │  • Compare      │  │  • Custom Scorers   │ │
│  │    Comparison   │  │  • Webhook      │  │                     │ │
│  └────────┬────────┘  └────────┬────────┘  └──────────┬──────────┘ │
│           │                    │                      │            │
│           └────────────────────┼──────────────────────┘            │
│                                │                                   │
│                                ▼                                   │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                      Data Layer                              │  │
│  │                                                              │  │
│  │  ┌──────────────────┐        ┌───────────────────────────┐  │  │
│  │  │   PostgreSQL     │        │      MLflow 3.0           │  │  │
│  │  │                  │        │                           │  │  │
│  │  │  • eval_suites   │◄──────►│  • Traces                 │  │  │
│  │  │  • eval_cases    │        │  • Spans                  │  │  │
│  │  │  • eval_runs     │        │  • Experiments            │  │  │
│  │  │  • eval_results  │        │  • LoggedModels           │  │  │
│  │  │                  │        │  • LLM Judges             │  │  │
│  │  └──────────────────┘        └───────────────────────────┘  │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                                 ▲
                                 │
┌────────────────────────────────┼────────────────────────────────────┐
│                     External Integrations                           │
│                                │                                    │
│  ┌──────────────┐  ┌──────────┴───────┐  ┌───────────────────────┐ │
│  │ GitHub       │  │  Your Agents     │  │  LLM APIs             │ │
│  │ Actions      │  │                  │  │                       │ │
│  │              │  │  • LangChain     │  │  • Claude (scoring)   │ │
│  │  • PR gates  │  │  • LlamaIndex    │  │  • GPT-4 (scoring)    │ │
│  │  • Status    │  │  • Custom        │  │                       │ │
│  │    checks    │  │  • PydanticAI    │  │                       │ │
│  └──────────────┘  └──────────────────┘  └───────────────────────┘ │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Component Details

### 1. Custom Scorers (Python SDK)

Agent-specific evaluation scorers that extend MLflow's Scorer class.

```python
# agent_eval/scorers/tool_selection.py
from mlflow.genai.scorers import Scorer
from mlflow.entities import Trace, SpanType
from typing import Optional

class ToolSelectionScorer(Scorer):
    """Evaluates if agent selected appropriate tools for the task."""

    name = "tool_selection"
    description = "Scores tool selection appropriateness (0-1)"

    def __init__(
        self,
        expected_tools: Optional[list[str]] = None,
        llm_judge: str = "claude-3-5-sonnet",
        strict: bool = False
    ):
        self.expected_tools = expected_tools
        self.llm_judge = llm_judge
        self.strict = strict

    def score(self, trace: Trace) -> float:
        tool_spans = trace.search_spans(span_type=SpanType.TOOL)
        actual_tools = [span.name for span in tool_spans]

        if self.expected_tools:
            return self._score_against_expected(actual_tools)
        else:
            return self._score_with_llm_judge(trace, actual_tools)

    def _score_against_expected(self, actual: list[str]) -> float:
        if self.strict:
            # Exact match required
            return 1.0 if set(actual) == set(self.expected_tools) else 0.0
        else:
            # Partial credit for overlap
            if not self.expected_tools:
                return 1.0
            overlap = len(set(actual) & set(self.expected_tools))
            return overlap / len(self.expected_tools)

    def _score_with_llm_judge(self, trace: Trace, tools: list[str]) -> float:
        # Use LLM to evaluate tool selection appropriateness
        prompt = f"""
        Task: {trace.inputs.get('query', 'Unknown')}
        Tools called: {tools}

        Rate tool selection appropriateness (0-1):
        - 1.0: Perfect tool selection
        - 0.5: Reasonable but suboptimal
        - 0.0: Wrong tools or unnecessary calls

        Score:
        """
        # Call LLM judge...
        return score
```

**Scorer Library (MVP):**

| Scorer | Evaluates |
|--------|-----------|
| `ToolSelectionScorer` | Were the right tools called? |
| `ReasoningQualityScorer` | Is the chain-of-thought sound? |
| `GroundingScorer` | Are claims supported by tool outputs? |
| `TerminationScorer` | Did agent stop at the right time? |
| `EfficiencyScorer` | Were unnecessary steps avoided? |

---

### 2. Test Suite Management

Data model for defining and storing eval test suites.

```python
# agent_eval/models.py
from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class EvalCase(BaseModel):
    """A single test case in an eval suite."""
    id: str
    name: str
    description: Optional[str]
    input: dict                    # Agent input
    expected_tools: list[str]      # Tools that should be called
    expected_output_pattern: Optional[str]  # Regex match
    expected_output_contains: list[str]     # Must contain these strings
    scorer_config: dict            # Which scorers + params
    tags: list[str]

class EvalSuite(BaseModel):
    """A collection of test cases for an agent."""
    id: str
    name: str
    description: Optional[str]
    agent_id: str
    cases: list[EvalCase]
    default_scorers: list[str]
    created_at: datetime
    updated_at: datetime

class EvalRun(BaseModel):
    """A single execution of an eval suite."""
    id: str
    suite_id: str
    agent_version: str            # Git SHA or version tag
    status: str                   # pending, running, completed, failed
    results: list["EvalResult"]
    summary: "EvalSummary"
    started_at: datetime
    completed_at: Optional[datetime]

class EvalResult(BaseModel):
    """Result of a single test case."""
    case_id: str
    mlflow_trace_id: str          # Link to MLflow trace
    scores: dict[str, float]      # scorer_name -> score
    passed: bool
    execution_time_ms: int

class EvalSummary(BaseModel):
    """Aggregate stats for an eval run."""
    total_cases: int
    passed_cases: int
    failed_cases: int
    avg_scores: dict[str, float]
    execution_time_ms: int
```

**Database Schema:**

```sql
-- PostgreSQL schema
CREATE TABLE eval_suites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    agent_id VARCHAR(255) NOT NULL,
    default_scorers JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE eval_cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    suite_id UUID REFERENCES eval_suites(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    input_json JSONB NOT NULL,
    expected_tools TEXT[],
    expected_output_pattern VARCHAR(1000),
    expected_output_contains TEXT[],
    scorer_config JSONB,
    tags TEXT[],
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE eval_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    suite_id UUID REFERENCES eval_suites(id),
    agent_version VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL,
    summary_json JSONB,
    started_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP
);

CREATE TABLE eval_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID REFERENCES eval_runs(id) ON DELETE CASCADE,
    case_id UUID REFERENCES eval_cases(id),
    mlflow_trace_id VARCHAR(255),
    scores_json JSONB NOT NULL,
    passed BOOLEAN NOT NULL,
    execution_time_ms INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_eval_runs_suite_version ON eval_runs(suite_id, agent_version);
CREATE INDEX idx_eval_results_run ON eval_results(run_id);
```

---

### 3. Regression Detection

Compare eval runs and identify what changed.

```python
# agent_eval/regression.py
from dataclasses import dataclass
from typing import Optional

@dataclass
class Regression:
    """A single test case that regressed."""
    case_id: str
    case_name: str
    baseline_score: float
    candidate_score: float
    delta: float
    scorer: str

@dataclass
class RegressionReport:
    """Full regression analysis between two eval runs."""
    baseline_version: str
    candidate_version: str
    regressions: list[Regression]
    improvements: list[Regression]
    unchanged: int
    overall_delta: float
    passed: bool
    summary: str

def detect_regressions(
    baseline: EvalRun,
    candidate: EvalRun,
    threshold: float = 0.05,
    min_improvement: float = 0.05
) -> RegressionReport:
    """Compare two eval runs and identify regressions."""

    regressions = []
    improvements = []
    unchanged = 0

    for case in baseline.suite.cases:
        baseline_result = baseline.get_result(case.id)
        candidate_result = candidate.get_result(case.id)

        if not baseline_result or not candidate_result:
            continue

        for scorer_name, baseline_score in baseline_result.scores.items():
            candidate_score = candidate_result.scores.get(scorer_name, 0)
            delta = candidate_score - baseline_score

            if delta < -threshold:
                regressions.append(Regression(
                    case_id=case.id,
                    case_name=case.name,
                    baseline_score=baseline_score,
                    candidate_score=candidate_score,
                    delta=delta,
                    scorer=scorer_name
                ))
            elif delta > min_improvement:
                improvements.append(Regression(
                    case_id=case.id,
                    case_name=case.name,
                    baseline_score=baseline_score,
                    candidate_score=candidate_score,
                    delta=delta,
                    scorer=scorer_name
                ))
            else:
                unchanged += 1

    overall_delta = candidate.summary.avg_score - baseline.summary.avg_score
    passed = len(regressions) == 0

    return RegressionReport(
        baseline_version=baseline.agent_version,
        candidate_version=candidate.agent_version,
        regressions=regressions,
        improvements=improvements,
        unchanged=unchanged,
        overall_delta=overall_delta,
        passed=passed,
        summary=_generate_summary(regressions, improvements, overall_delta)
    )
```

---

### 4. CI/CD Integration

GitHub Action for automated evaluation on PRs.

```yaml
# .github/actions/agent-eval/action.yml
name: 'Agent Evaluation'
description: 'Run agent evaluation suite and check for regressions'

inputs:
  suite:
    description: 'Eval suite to run'
    required: true
  agent-path:
    description: 'Path to agent module'
    required: true
  baseline:
    description: 'Baseline version to compare against'
    default: 'main'
  threshold:
    description: 'Regression threshold (0-1)'
    default: '0.95'
  mlflow-tracking-uri:
    description: 'MLflow tracking server URI'
    required: true
  fail-on-regression:
    description: 'Fail the action if regressions detected'
    default: 'true'

outputs:
  passed:
    description: 'Whether evaluation passed'
  report-url:
    description: 'URL to full evaluation report'

runs:
  using: 'composite'
  steps:
    - name: Install agent-eval
      shell: bash
      run: pip install agent-eval mlflow

    - name: Run evaluation
      shell: bash
      env:
        MLFLOW_TRACKING_URI: ${{ inputs.mlflow-tracking-uri }}
      run: |
        agent-eval run \
          --suite ${{ inputs.suite }} \
          --agent ${{ inputs.agent-path }} \
          --version ${{ github.sha }}

    - name: Check regressions
      shell: bash
      run: |
        agent-eval compare \
          --suite ${{ inputs.suite }} \
          --baseline ${{ inputs.baseline }} \
          --candidate ${{ github.sha }} \
          --threshold ${{ inputs.threshold }} \
          ${{ inputs.fail-on-regression == 'true' && '--fail-on-regression' || '' }}
```

**Usage in workflow:**

```yaml
# .github/workflows/agent-quality.yml
name: Agent Quality Check
on: [pull_request]

jobs:
  evaluate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run Agent Eval
        uses: ./.github/actions/agent-eval
        with:
          suite: core-tests
          agent-path: ./src/agent.py
          mlflow-tracking-uri: ${{ secrets.MLFLOW_URI }}
          threshold: '0.95'
          fail-on-regression: 'true'
```

---

### 5. Frontend (Next.js)

**Page Structure:**

```
/app
  /dashboard
    page.tsx           # Overview: recent runs, quality trends
  /suites
    page.tsx           # List of eval suites
    /[id]
      page.tsx         # Suite detail: cases, runs
      /edit
        page.tsx       # Edit suite / cases
  /runs
    /[id]
      page.tsx         # Run detail: results, scores
  /compare
    page.tsx           # A/B comparison view
  /api
    /suites
    /runs
    /compare
```

**Key Components:**

```tsx
// components/RegressionDiff.tsx
export function RegressionDiff({
  baseline,
  candidate
}: {
  baseline: EvalRun
  candidate: EvalRun
}) {
  const report = useRegressionReport(baseline.id, candidate.id)

  return (
    <div>
      <SummaryCard
        regressions={report.regressions.length}
        improvements={report.improvements.length}
        delta={report.overall_delta}
      />

      {report.regressions.length > 0 && (
        <Alert variant="destructive">
          <h3>Regressions Detected</h3>
          <RegressionTable regressions={report.regressions} />
        </Alert>
      )}

      <ComparisonChart baseline={baseline} candidate={candidate} />
    </div>
  )
}
```

---

## Data Flow

### Evaluation Flow

```
1. Developer pushes PR
         │
         ▼
2. GitHub Action triggers
         │
         ▼
3. agent-eval CLI runs suite
         │
         ├──► Load test cases from DB
         │
         ├──► For each case:
         │      │
         │      ├──► Run agent with MLflow tracing
         │      │
         │      ├──► Extract trace from MLflow
         │      │
         │      ├──► Run scorers on trace
         │      │
         │      └──► Store result
         │
         ▼
4. Compare to baseline
         │
         ├──► Load baseline run from DB
         │
         ├──► Calculate deltas per case
         │
         └──► Generate regression report
         │
         ▼
5. Pass/Fail decision
         │
         ├──► If passed: PR check green
         │
         └──► If failed: PR check red + report link
```

---

## Deployment Options

### Option A: Self-Hosted (Recommended for MVP)
- Docker Compose: Postgres + API + Frontend
- MLflow: Existing instance or new deployment
- Suitable for: Teams with existing infrastructure

### Option B: Cloud-Hosted
- Vercel: Frontend
- Railway/Fly: API + Postgres
- MLflow Cloud or Databricks
- Suitable for: Quick start, smaller teams

### Docker Compose (Self-Hosted)

```yaml
# docker-compose.yml
version: '3.8'

services:
  db:
    image: postgres:16
    environment:
      POSTGRES_DB: agent_eval
      POSTGRES_USER: agent_eval
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data

  api:
    build: ./api
    environment:
      DATABASE_URL: postgresql://agent_eval:${DB_PASSWORD}@db/agent_eval
      MLFLOW_TRACKING_URI: ${MLFLOW_TRACKING_URI}
    ports:
      - "8000:8000"
    depends_on:
      - db

  frontend:
    build: ./frontend
    environment:
      API_URL: http://api:8000
    ports:
      - "3000:3000"
    depends_on:
      - api

volumes:
  postgres_data:
```
