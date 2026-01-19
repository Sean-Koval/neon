# Architecture Specification

> Complete technical specification for implementation.

**Last Updated:** 2026-01-18
**Status:** Ready for implementation

---

## Decision 1: Test Case Format

### Decision: Pydantic Models + YAML Serialization

**Rationale:**
- Pydantic for type safety and validation in code
- YAML for human-readable files that can be version-controlled
- CLI loads YAML → Pydantic models
- API accepts JSON (Pydantic serializes both ways)

### Test Case Schema

```python
# src/models/eval.py
from pydantic import BaseModel, Field
from typing import Optional
from enum import Enum

class ScorerType(str, Enum):
    TOOL_SELECTION = "tool_selection"
    REASONING = "reasoning"
    GROUNDING = "grounding"
    EFFICIENCY = "efficiency"
    CUSTOM = "custom"

class EvalCase(BaseModel):
    """A single test case."""
    name: str = Field(..., description="Unique name for the test case")
    description: Optional[str] = None

    # Input to the agent
    input: dict = Field(..., description="Agent input (passed to agent.run())")

    # Expected behavior (optional - if not set, only scorers run)
    expected_tools: Optional[list[str]] = Field(
        None,
        description="Tools that should be called (order-independent)"
    )
    expected_tool_sequence: Optional[list[str]] = Field(
        None,
        description="Tools in exact order (if order matters)"
    )
    expected_output_contains: Optional[list[str]] = Field(
        None,
        description="Strings that must appear in output"
    )
    expected_output_pattern: Optional[str] = Field(
        None,
        description="Regex pattern output must match"
    )

    # Scorer configuration
    scorers: list[ScorerType] = Field(
        default=[ScorerType.TOOL_SELECTION, ScorerType.REASONING],
        description="Scorers to run on this case"
    )
    scorer_config: Optional[dict] = Field(
        None,
        description="Per-scorer configuration overrides"
    )

    # Thresholds
    min_score: float = Field(
        default=0.7,
        description="Minimum average score to pass"
    )

    # Metadata
    tags: list[str] = Field(default_factory=list)
    timeout_seconds: int = Field(default=300)

class EvalSuite(BaseModel):
    """A collection of test cases."""
    name: str
    description: Optional[str] = None
    agent_id: str = Field(..., description="Identifier for the agent being tested")

    # Default configuration for all cases
    default_scorers: list[ScorerType] = Field(
        default=[ScorerType.TOOL_SELECTION, ScorerType.REASONING]
    )
    default_min_score: float = 0.7
    default_timeout_seconds: int = 300

    # Test cases
    cases: list[EvalCase]

    # Suite-level settings
    parallel: bool = Field(default=True, description="Run cases in parallel")
    stop_on_failure: bool = Field(default=False)
```

### YAML Format

```yaml
# eval-suites/core-tests.yaml
name: core-tests
description: Core functionality tests for the research agent
agent_id: research-agent

default_scorers:
  - tool_selection
  - reasoning
  - grounding

default_min_score: 0.7

cases:
  - name: factual_search
    description: Should use search for factual questions
    input:
      query: "What is the capital of France?"
      context: {}
    expected_tools:
      - web_search
    expected_output_contains:
      - "Paris"
    min_score: 0.8
    tags:
      - search
      - factual

  - name: no_tool_needed
    description: Should answer directly without tools for simple questions
    input:
      query: "What is 2 + 2?"
    expected_tools: []  # Empty = no tools should be called
    scorers:
      - reasoning
      - efficiency

  - name: multi_step_research
    description: Should search then summarize
    input:
      query: "Compare the populations of Tokyo and New York"
    expected_tool_sequence:
      - web_search
      - web_search  # May search twice
    expected_output_contains:
      - "Tokyo"
      - "New York"
      - "million"
    timeout_seconds: 600
```

### CLI Loading

```python
# cli/src/loader.py
import yaml
from pathlib import Path
from models.eval import EvalSuite

def load_suite(path: Path) -> EvalSuite:
    """Load eval suite from YAML file."""
    with open(path) as f:
        data = yaml.safe_load(f)
    return EvalSuite(**data)

def load_suites_from_dir(dir: Path) -> list[EvalSuite]:
    """Load all suites from a directory."""
    suites = []
    for path in dir.glob("*.yaml"):
        suites.append(load_suite(path))
    return suites
```

---

## Decision 2: Authentication Model

### Decision: API Keys with Project Scoping

**Rationale:**
- Simple for MVP (no OAuth complexity)
- Works well for CI/CD (secrets as env vars)
- Project-scoped for multi-tenant support later

### Auth Schema

```python
# src/models/auth.py
from pydantic import BaseModel
from datetime import datetime
from enum import Enum

class ApiKeyScope(str, Enum):
    READ = "read"           # View suites, runs, results
    WRITE = "write"         # Create/update suites, cases
    EXECUTE = "execute"     # Run evaluations
    ADMIN = "admin"         # All permissions

class ApiKey(BaseModel):
    id: str
    key_hash: str           # bcrypt hash, never store plaintext
    name: str               # Human-readable name
    project_id: str
    scopes: list[ApiKeyScope]
    created_at: datetime
    last_used_at: datetime | None
    expires_at: datetime | None
    is_active: bool = True
```

### Database Schema

```sql
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    mlflow_tracking_uri TEXT,  -- Optional, for BYOM
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key_prefix VARCHAR(8) NOT NULL,     -- First 8 chars for identification
    key_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    project_id UUID REFERENCES projects(id),
    scopes TEXT[] NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    last_used_at TIMESTAMP,
    expires_at TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_api_keys_prefix ON api_keys(key_prefix);
```

### API Key Format

```
ae_live_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
│   │    └── 32 character random string
│   └── environment (live/test)
└── prefix (agent-eval)
```

### Authentication Flow

```python
# src/auth/middleware.py
from fastapi import Header, HTTPException, Depends
from fastapi.security import APIKeyHeader

api_key_header = APIKeyHeader(name="X-API-Key")

async def verify_api_key(
    api_key: str = Depends(api_key_header),
    db: AsyncSession = Depends(get_db)
) -> ApiKey:
    """Verify API key and return key object."""
    prefix = api_key[:8]

    key_record = await db.execute(
        select(ApiKeyModel).where(
            ApiKeyModel.key_prefix == prefix,
            ApiKeyModel.is_active == True
        )
    )
    key_record = key_record.scalar_one_or_none()

    if not key_record:
        raise HTTPException(401, "Invalid API key")

    if not bcrypt.checkpw(api_key.encode(), key_record.key_hash.encode()):
        raise HTTPException(401, "Invalid API key")

    if key_record.expires_at and key_record.expires_at < datetime.utcnow():
        raise HTTPException(401, "API key expired")

    # Update last used
    key_record.last_used_at = datetime.utcnow()
    await db.commit()

    return key_record

def require_scope(scope: ApiKeyScope):
    """Dependency that checks for required scope."""
    async def check_scope(key: ApiKey = Depends(verify_api_key)):
        if scope not in key.scopes and ApiKeyScope.ADMIN not in key.scopes:
            raise HTTPException(403, f"Missing required scope: {scope}")
        return key
    return check_scope
```

### Usage in Routes

```python
# src/routers/suites.py
from fastapi import APIRouter, Depends
from auth.middleware import require_scope, ApiKeyScope

router = APIRouter(prefix="/v1/suites")

@router.get("/")
async def list_suites(
    key: ApiKey = Depends(require_scope(ApiKeyScope.READ))
):
    """List all suites in the project."""
    # key.project_id scopes the query
    ...

@router.post("/")
async def create_suite(
    suite: EvalSuiteCreate,
    key: ApiKey = Depends(require_scope(ApiKeyScope.WRITE))
):
    """Create a new eval suite."""
    ...

@router.post("/{suite_id}/run")
async def run_suite(
    suite_id: str,
    key: ApiKey = Depends(require_scope(ApiKeyScope.EXECUTE))
):
    """Execute an eval suite."""
    ...
```

### CI/CD Authentication

```yaml
# .github/workflows/agent-eval.yml
env:
  AGENT_EVAL_API_KEY: ${{ secrets.AGENT_EVAL_API_KEY }}

steps:
  - name: Run evaluation
    run: |
      agent-eval run --suite core-tests
    env:
      AGENT_EVAL_API_KEY: ${{ env.AGENT_EVAL_API_KEY }}
```

---

## Decision 3: MLflow Integration Pattern

### Decision: Hybrid — We Execute Agent + Capture Trace

**Rationale:**
- We need to control agent execution to capture traces consistently
- User provides agent as callable (Python function or module path)
- We wrap execution with MLflow tracing
- Store trace ID in our database, query MLflow for details

### Integration Modes

| Mode | Description | Use Case |
|------|-------------|----------|
| **Managed Execution** | We run the agent, capture trace | CLI, CI/CD (primary) |
| **Trace Import** | User provides existing trace ID | Debugging, replay |

### Agent Interface

```python
# src/agent/interface.py
from typing import Protocol, Any
from pydantic import BaseModel

class AgentInput(BaseModel):
    """Standard input format for agents."""
    query: str
    context: dict = {}
    config: dict = {}

class AgentOutput(BaseModel):
    """Standard output format from agents."""
    output: str
    tools_called: list[str]
    metadata: dict = {}

class AgentProtocol(Protocol):
    """Protocol that agents must implement."""

    def run(self, input: AgentInput) -> AgentOutput:
        """Execute the agent with given input."""
        ...

# Adapter for common agent frameworks
class LangChainAdapter:
    """Wrap a LangChain agent to match our protocol."""

    def __init__(self, agent):
        self.agent = agent

    def run(self, input: AgentInput) -> AgentOutput:
        result = self.agent.invoke({"input": input.query, **input.context})
        return AgentOutput(
            output=result["output"],
            tools_called=self._extract_tools(result),
            metadata={}
        )

class CallableAdapter:
    """Wrap any callable as an agent."""

    def __init__(self, fn):
        self.fn = fn

    def run(self, input: AgentInput) -> AgentOutput:
        result = self.fn(input.query, **input.context)
        if isinstance(result, str):
            return AgentOutput(output=result, tools_called=[], metadata={})
        return AgentOutput(**result)
```

### Execution with Tracing

```python
# src/runner/executor.py
import mlflow
from mlflow.entities import SpanType

class EvalExecutor:
    def __init__(
        self,
        mlflow_tracking_uri: str,
        project_id: str
    ):
        mlflow.set_tracking_uri(mlflow_tracking_uri)
        self.experiment = mlflow.set_experiment(f"agent-eval-{project_id}")

    async def execute_case(
        self,
        agent: AgentProtocol,
        case: EvalCase,
        run_id: str
    ) -> ExecutionResult:
        """Execute a single test case with MLflow tracing."""

        with mlflow.start_run(run_name=f"{run_id}/{case.name}") as mlflow_run:
            # Tag the run for querying
            mlflow.set_tags({
                "agent_eval.run_id": run_id,
                "agent_eval.case_name": case.name,
                "agent_eval.suite_id": case.suite_id,
            })

            # Execute agent (MLflow auto-traces if agent uses supported framework)
            start_time = time.time()
            try:
                input = AgentInput(**case.input)
                output = agent.run(input)
                status = "success"
                error = None
            except Exception as e:
                output = None
                status = "error"
                error = str(e)

            execution_time = time.time() - start_time

            # Get the trace
            trace = mlflow.get_last_active_trace()

            # Log metrics
            mlflow.log_metrics({
                "execution_time_seconds": execution_time,
                "tools_called_count": len(output.tools_called) if output else 0,
            })

            return ExecutionResult(
                case_id=case.id,
                mlflow_run_id=mlflow_run.info.run_id,
                mlflow_trace_id=trace.info.trace_id if trace else None,
                output=output,
                status=status,
                error=error,
                execution_time_ms=int(execution_time * 1000)
            )
```

### Querying MLflow Traces

```python
# src/mlflow/client.py
from mlflow import MlflowClient
from mlflow.entities import Trace, SpanType

class MLflowTraceClient:
    def __init__(self, tracking_uri: str):
        self.client = MlflowClient(tracking_uri)

    def get_trace(self, trace_id: str) -> Trace:
        """Get a trace by ID."""
        return self.client.get_trace(trace_id)

    def get_tool_spans(self, trace: Trace) -> list[Span]:
        """Extract tool call spans from a trace."""
        return trace.search_spans(span_type=SpanType.TOOL)

    def get_llm_spans(self, trace: Trace) -> list[Span]:
        """Extract LLM call spans from a trace."""
        return trace.search_spans(span_type=SpanType.CHAT_MODEL)

    def get_trace_summary(self, trace: Trace) -> TraceSummary:
        """Get summary statistics for a trace."""
        tool_spans = self.get_tool_spans(trace)
        llm_spans = self.get_llm_spans(trace)

        return TraceSummary(
            total_spans=len(trace.spans),
            tool_calls=[s.name for s in tool_spans],
            llm_calls=len(llm_spans),
            total_tokens=sum(s.attributes.get("tokens", 0) for s in llm_spans),
            duration_ms=trace.info.duration_ms,
        )
```

### Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        Eval Execution                           │
│                                                                 │
│  1. Load Suite (YAML)                                          │
│         │                                                       │
│         ▼                                                       │
│  2. For each case:                                             │
│         │                                                       │
│         ├──► Start MLflow run                                  │
│         │                                                       │
│         ├──► Execute agent.run(input)                          │
│         │         │                                            │
│         │         └──► MLflow auto-traces (if supported)       │
│         │                                                       │
│         ├──► Capture trace ID                                  │
│         │                                                       │
│         ├──► Run scorers on trace                              │
│         │         │                                            │
│         │         ├──► ToolSelectionScorer                     │
│         │         ├──► ReasoningScorer                         │
│         │         └──► GroundingScorer                         │
│         │                                                       │
│         └──► Store result (our DB) with trace_id (MLflow ref)  │
│                                                                 │
│  3. Aggregate results                                          │
│         │                                                       │
│         ▼                                                       │
│  4. Return EvalRunResult                                       │
└─────────────────────────────────────────────────────────────────┘

Storage:
┌──────────────────────┐      ┌──────────────────────┐
│   Our PostgreSQL     │      │      MLflow          │
│                      │      │                      │
│  • eval_suites       │      │  • Full traces       │
│  • eval_cases        │      │  • Span details      │
│  • eval_runs         │◄────►│  • Metrics           │
│  • eval_results      │      │  • Artifacts         │
│    (trace_id ref)    │      │                      │
└──────────────────────┘      └──────────────────────┘
```

---

## Complete Database Schema

```sql
-- Projects and auth
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    mlflow_tracking_uri TEXT,
    mlflow_experiment_id VARCHAR(255),
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key_prefix VARCHAR(8) NOT NULL,
    key_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    scopes TEXT[] NOT NULL DEFAULT '{read}',
    created_at TIMESTAMP DEFAULT NOW(),
    last_used_at TIMESTAMP,
    expires_at TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE
);

-- Eval suites and cases
CREATE TABLE eval_suites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    agent_id VARCHAR(255) NOT NULL,
    config JSONB DEFAULT '{}',        -- default_scorers, thresholds, etc.
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(project_id, name)
);

CREATE TABLE eval_cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    suite_id UUID REFERENCES eval_suites(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    input JSONB NOT NULL,
    expected_tools TEXT[],
    expected_tool_sequence TEXT[],
    expected_output_contains TEXT[],
    expected_output_pattern VARCHAR(1000),
    scorers TEXT[] NOT NULL DEFAULT '{tool_selection,reasoning}',
    scorer_config JSONB,
    min_score FLOAT DEFAULT 0.7,
    timeout_seconds INT DEFAULT 300,
    tags TEXT[] DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(suite_id, name)
);

-- Eval runs and results
CREATE TABLE eval_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    suite_id UUID REFERENCES eval_suites(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    agent_version VARCHAR(255),       -- Git SHA or version tag
    trigger VARCHAR(50) NOT NULL,     -- 'manual', 'ci', 'scheduled'
    trigger_ref VARCHAR(255),         -- PR number, commit SHA, etc.
    status VARCHAR(50) NOT NULL DEFAULT 'pending',  -- pending, running, completed, failed
    config JSONB,                     -- Runtime config overrides
    summary JSONB,                    -- Aggregated results
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE eval_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID REFERENCES eval_runs(id) ON DELETE CASCADE,
    case_id UUID REFERENCES eval_cases(id) ON DELETE CASCADE,
    mlflow_run_id VARCHAR(255),
    mlflow_trace_id VARCHAR(255),
    status VARCHAR(50) NOT NULL,      -- success, failed, error, timeout
    output JSONB,                     -- Agent output
    scores JSONB NOT NULL,            -- {scorer_name: score}
    score_details JSONB,              -- {scorer_name: {reason, evidence}}
    passed BOOLEAN NOT NULL,
    execution_time_ms INT,
    error TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_eval_runs_suite ON eval_runs(suite_id);
CREATE INDEX idx_eval_runs_project_status ON eval_runs(project_id, status);
CREATE INDEX idx_eval_runs_agent_version ON eval_runs(agent_version);
CREATE INDEX idx_eval_results_run ON eval_results(run_id);
CREATE INDEX idx_eval_results_case ON eval_results(case_id);
CREATE INDEX idx_api_keys_prefix ON api_keys(key_prefix);
CREATE INDEX idx_api_keys_project ON api_keys(project_id);
```

---

## API Specification

### Endpoints

```
Base URL: /api/v1

Authentication:
  Header: X-API-Key: ae_live_xxxxx

Projects:
  GET    /projects                    # List projects (admin)
  POST   /projects                    # Create project (admin)
  GET    /projects/{id}               # Get project
  PATCH  /projects/{id}               # Update project

Suites:
  GET    /suites                      # List suites
  POST   /suites                      # Create suite
  GET    /suites/{id}                 # Get suite with cases
  PATCH  /suites/{id}                 # Update suite
  DELETE /suites/{id}                 # Delete suite

Cases:
  GET    /suites/{suite_id}/cases     # List cases
  POST   /suites/{suite_id}/cases     # Create case
  GET    /cases/{id}                  # Get case
  PATCH  /cases/{id}                  # Update case
  DELETE /cases/{id}                  # Delete case

Runs:
  GET    /runs                        # List runs (filterable)
  POST   /suites/{suite_id}/run       # Start eval run
  GET    /runs/{id}                   # Get run with results
  GET    /runs/{id}/results           # Get detailed results
  POST   /runs/{id}/cancel            # Cancel running eval

Comparison:
  POST   /compare                     # Compare two runs
  GET    /compare/{baseline_id}/{candidate_id}  # Get comparison

API Keys:
  GET    /api-keys                    # List keys (masked)
  POST   /api-keys                    # Create key
  DELETE /api-keys/{id}               # Revoke key
```

### Request/Response Examples

```python
# POST /suites/{suite_id}/run
# Request
{
    "agent_version": "abc123",
    "trigger": "ci",
    "trigger_ref": "PR-456",
    "config": {
        "parallel": true,
        "timeout_override": 600
    }
}

# Response
{
    "id": "run_xxx",
    "suite_id": "suite_xxx",
    "status": "pending",
    "created_at": "2026-01-18T12:00:00Z",
    "poll_url": "/api/v1/runs/run_xxx"
}
```

```python
# GET /runs/{id}
# Response
{
    "id": "run_xxx",
    "suite_id": "suite_xxx",
    "suite_name": "core-tests",
    "agent_version": "abc123",
    "status": "completed",
    "summary": {
        "total_cases": 10,
        "passed": 8,
        "failed": 2,
        "avg_score": 0.82,
        "scores_by_type": {
            "tool_selection": 0.85,
            "reasoning": 0.79,
            "grounding": 0.83
        },
        "execution_time_ms": 45000
    },
    "started_at": "2026-01-18T12:00:00Z",
    "completed_at": "2026-01-18T12:00:45Z"
}
```

```python
# POST /compare
# Request
{
    "baseline_run_id": "run_baseline",
    "candidate_run_id": "run_candidate",
    "threshold": 0.05
}

# Response
{
    "baseline": { "id": "run_baseline", "agent_version": "main" },
    "candidate": { "id": "run_candidate", "agent_version": "abc123" },
    "passed": false,
    "overall_delta": -0.08,
    "regressions": [
        {
            "case_name": "multi_step_research",
            "scorer": "tool_selection",
            "baseline_score": 0.9,
            "candidate_score": 0.6,
            "delta": -0.3
        }
    ],
    "improvements": [
        {
            "case_name": "simple_query",
            "scorer": "efficiency",
            "baseline_score": 0.7,
            "candidate_score": 0.85,
            "delta": 0.15
        }
    ],
    "unchanged": 8
}
```

---

## CLI Specification

```bash
# Installation
pip install agent-eval

# Configuration
export AGENT_EVAL_API_KEY=ae_live_xxxxx
export AGENT_EVAL_API_URL=https://api.agent-eval.example.com  # or self-hosted

# Or config file: ~/.agent-eval/config.yaml
api_key: ae_live_xxxxx
api_url: https://api.agent-eval.example.com
default_project: my-project

# Commands
agent-eval init                       # Initialize in current directory
agent-eval suite create <name>        # Create new suite
agent-eval suite list                 # List suites
agent-eval suite show <name>          # Show suite details
agent-eval suite validate <file>      # Validate YAML syntax

agent-eval run <suite>                # Run evaluation
  --agent <module:function>           # Agent to test (e.g., myagent:run)
  --agent-version <version>           # Version tag (default: git SHA)
  --parallel / --no-parallel          # Parallel execution
  --timeout <seconds>                 # Override timeout
  --output json|table|quiet           # Output format

agent-eval compare <baseline> <candidate>  # Compare two runs
  --threshold <float>                 # Regression threshold (default: 0.05)
  --fail-on-regression                # Exit 1 if regressions found
  --output json|table|markdown        # Output format

agent-eval results <run_id>           # Show run results
  --details                           # Include score explanations
  --failed-only                       # Only show failed cases

agent-eval api-key create <name>      # Create API key
agent-eval api-key list               # List API keys
agent-eval api-key revoke <id>        # Revoke API key
```

### CLI Output Examples

```bash
$ agent-eval run core-tests --agent myagent:run

Running suite: core-tests (10 cases)
Agent version: abc123def

  ✓ factual_search                    [0.92] 1.2s
  ✓ no_tool_needed                    [0.88] 0.8s
  ✗ multi_step_research               [0.45] 5.2s
    └─ tool_selection: 0.40 (expected search, got calculator)
    └─ reasoning: 0.50 (incomplete analysis)
  ✓ simple_query                      [0.95] 0.5s
  ...

Results: 8/10 passed (80%)
Average score: 0.82

Run ID: run_abc123
View details: https://app.agent-eval.example.com/runs/run_abc123
```

```bash
$ agent-eval compare run_main run_abc123 --fail-on-regression

Comparing: main → abc123

Regressions (2):
  ✗ multi_step_research
    tool_selection: 0.90 → 0.40 (-0.50)
  ✗ complex_reasoning
    reasoning: 0.85 → 0.70 (-0.15)

Improvements (1):
  ✓ simple_query
    efficiency: 0.70 → 0.85 (+0.15)

Overall: -0.08 (REGRESSION DETECTED)
Exit code: 1
```

---

## GitHub Action Specification

```yaml
# action.yml
name: 'Agent Evaluation'
description: 'Run agent evaluation suite and check for regressions'
author: 'AgentEval'

inputs:
  api-key:
    description: 'AgentEval API key'
    required: true
  suite:
    description: 'Eval suite to run'
    required: true
  agent:
    description: 'Agent module path (e.g., myagent:run)'
    required: true
  baseline:
    description: 'Baseline to compare against (run ID or "latest")'
    default: 'latest'
  threshold:
    description: 'Regression threshold'
    default: '0.05'
  fail-on-regression:
    description: 'Fail if regressions detected'
    default: 'true'

outputs:
  run-id:
    description: 'The eval run ID'
  passed:
    description: 'Whether the evaluation passed'
  score:
    description: 'Average score'
  regressions:
    description: 'Number of regressions detected'

runs:
  using: 'composite'
  steps:
    - name: Set up Python
      uses: actions/setup-python@v5
      with:
        python-version: '3.11'

    - name: Install agent-eval
      shell: bash
      run: pip install agent-eval

    - name: Run evaluation
      id: eval
      shell: bash
      env:
        AGENT_EVAL_API_KEY: ${{ inputs.api-key }}
      run: |
        agent-eval run ${{ inputs.suite }} \
          --agent ${{ inputs.agent }} \
          --agent-version ${{ github.sha }} \
          --output json > eval-result.json

        echo "run-id=$(jq -r '.run_id' eval-result.json)" >> $GITHUB_OUTPUT
        echo "score=$(jq -r '.summary.avg_score' eval-result.json)" >> $GITHUB_OUTPUT

    - name: Compare with baseline
      id: compare
      shell: bash
      env:
        AGENT_EVAL_API_KEY: ${{ inputs.api-key }}
      run: |
        agent-eval compare ${{ inputs.baseline }} ${{ steps.eval.outputs.run-id }} \
          --threshold ${{ inputs.threshold }} \
          --output json > compare-result.json

        PASSED=$(jq -r '.passed' compare-result.json)
        REGRESSIONS=$(jq -r '.regressions | length' compare-result.json)

        echo "passed=$PASSED" >> $GITHUB_OUTPUT
        echo "regressions=$REGRESSIONS" >> $GITHUB_OUTPUT

        if [ "$PASSED" = "false" ] && [ "${{ inputs.fail-on-regression }}" = "true" ]; then
          echo "::error::Regression detected! $REGRESSIONS test(s) regressed."
          exit 1
        fi

    - name: Post summary
      shell: bash
      run: |
        echo "## Agent Evaluation Results" >> $GITHUB_STEP_SUMMARY
        echo "" >> $GITHUB_STEP_SUMMARY
        echo "| Metric | Value |" >> $GITHUB_STEP_SUMMARY
        echo "|--------|-------|" >> $GITHUB_STEP_SUMMARY
        echo "| Score | ${{ steps.eval.outputs.score }} |" >> $GITHUB_STEP_SUMMARY
        echo "| Regressions | ${{ steps.compare.outputs.regressions }} |" >> $GITHUB_STEP_SUMMARY
        echo "| Status | ${{ steps.compare.outputs.passed == 'true' && '✅ Passed' || '❌ Failed' }} |" >> $GITHUB_STEP_SUMMARY
```

### Usage

```yaml
# .github/workflows/agent-eval.yml
name: Agent Quality
on: [pull_request]

jobs:
  evaluate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install dependencies
        run: pip install -r requirements.txt

      - name: Run Agent Evaluation
        uses: agent-eval/action@v1
        with:
          api-key: ${{ secrets.AGENT_EVAL_API_KEY }}
          suite: core-tests
          agent: src.agent:run
          fail-on-regression: true
```

---

## Summary: Ready to Build

All architectural decisions are now documented:

| Decision | Choice |
|----------|--------|
| Test case format | Pydantic + YAML |
| Auth model | API keys with project scoping |
| MLflow integration | Managed execution + trace capture |
| Database | PostgreSQL with full schema |
| API | REST with detailed spec |
| CLI | Full command spec |
| GitHub Action | Complete action.yml |

**Next step:** Create the repo and start scaffolding.
